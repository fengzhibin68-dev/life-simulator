<#
.SYNOPSIS
    一次性把 GitHub 侧的协作配置应用到仓库：标签体系 + main 分支保护。

.DESCRIPTION
    1) 读取 .github/labels.json，逐个创建或更新标签（以 JSON 为唯一数据源）；
    2) 为 main 分支配置保护：必须走 PR、至少 1 个批准、必须通过 CI 的 hygiene 检查、
       禁止强推与删除、要求线性历史、要求解决讨论。

    脚本不修改代码、不保存 token。重复运行是幂等的。

.PARAMETER Token
    GitHub token（环境变量 GITHUB_TOKEN 或显式传入）。
    fine-grained PAT 需要该仓库的 Administration: Read and write 与 Issues: Read and write；
    classic PAT 需要 repo 权限。

.PARAMETER DryRun
    只打印将要发出的请求，不真正调用 API。

.EXAMPLE
    $env:GITHUB_TOKEN = "github_pat_xxx"
    pwsh -ExecutionPolicy Bypass -File ./tools/apply-github-settings.ps1

.EXAMPLE
    # 先看会发哪些请求，不调用 API
    pwsh -ExecutionPolicy Bypass -File ./tools/apply-github-settings.ps1 -DryRun

.NOTES
    Windows 默认执行策略是 Restricted，直接运行 .ps1 会报「禁止运行脚本」。
    用上面的 -ExecutionPolicy Bypass 写法即可，不需要改系统设置。
#>
[CmdletBinding()]
param(
    [string]$Owner = 'fengzhibin68-dev',
    [string]$Repo = 'life-simulator',
    [string]$Branch = 'main',
    [string]$Token = $env:GITHUB_TOKEN,
    [string]$RequiredCheck = 'hygiene',
    [switch]$SkipLabels,
    [switch]$SkipProtection,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$labelsFile = Join-Path $repoRoot '.github/labels.json'

$headers = @{
    'Accept'               = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent'           = 'homework-collab-setup'
    'Authorization'        = "Bearer $Token"
}

if ([string]::IsNullOrWhiteSpace($Token) -and -not $DryRun) {
    throw "缺少 token：请先设置 `$env:GITHUB_TOKEN，或传 -Token。见 docs/github-settings.md 第 4 节。"
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Invoke-GitHubApi {
    param(
        [Parameter(Mandatory)][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [object]$Body
    )

    $uri = "https://api.github.com$Path"
    $json = $null
    if ($null -ne $Body) {
        $json = ($Body | ConvertTo-Json -Depth 8 -Compress)
    }

    if ($DryRun) {
        Write-Host "[dry-run] $Method $uri" -ForegroundColor DarkGray
        if ($json) { Write-Host "          $json" -ForegroundColor DarkGray }
        return $null
    }

    try {
        if ($null -ne $json) {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
            return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers `
                -Body $bytes -ContentType 'application/json; charset=utf-8'
        }
        return Invoke-RestMethod -Method $Method -Uri $uri -Headers $headers
    }
    catch {
        $status = 'n/a'
        if ($_.Exception.PSObject.Properties.Name -contains 'Response' -and $_.Exception.Response) {
            $status = [int]$_.Exception.Response.StatusCode
        }
        throw "请求失败（HTTP $status）：$Method $uri`n$($_.Exception.Message)"
    }
}

function Write-Section($text) {
    Write-Host ''
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

Write-Section '目标仓库'
Write-Host "owner=$Owner repo=$Repo branch=$Branch required-check=$RequiredCheck"
if ($DryRun) { Write-Host '模式：DryRun（不会真的调用 API）' -ForegroundColor Yellow }

# ---------------------------------------------------------------- 标签
if (-not $SkipLabels) {
    Write-Section '同步标签'

    if (-not (Test-Path -LiteralPath $labelsFile)) {
        throw "找不到标签数据源：$labelsFile"
    }

    $desired = Get-Content -LiteralPath $labelsFile -Raw -Encoding UTF8 | ConvertFrom-Json
    Write-Host "数据源 $labelsFile，共 $($desired.Count) 个标签"

    $existing = @{}
    if (-not $DryRun) {
        $current = Invoke-GitHubApi -Method GET -Path "/repos/$Owner/$Repo/labels?per_page=100"
        foreach ($item in $current) { $existing[$item.name] = $true }
    }

    $created = 0
    $updated = 0

    foreach ($label in $desired) {
        $payload = @{ new_name = $label.name; color = $label.color; description = $label.description }
        if ($existing.ContainsKey($label.name)) {
            Invoke-GitHubApi -Method PATCH -Path "/repos/$Owner/$Repo/labels/$([uri]::EscapeDataString($label.name))" -Body $payload | Out-Null
            $updated++
        }
        else {
            $create = @{ name = $label.name; color = $label.color; description = $label.description }
            Invoke-GitHubApi -Method POST -Path "/repos/$Owner/$Repo/labels" -Body $create | Out-Null
            $created++
        }
    }

    Write-Host "标签同步完成：新建 $created 个，更新 $updated 个。"
    $missing = $desired | Where-Object { $_.description -eq $null -or $_.description -eq '' }
    if ($missing) { Write-Host '提示：有标签缺少描述，建议补上，方便队友选择。' -ForegroundColor Yellow }
}

# ---------------------------------------------------------------- 分支保护
if (-not $SkipProtection) {
    Write-Section "配置 $Branch 分支保护"

    $protection = @{
        required_status_checks            = @{
            strict   = $true
            contexts = @($RequiredCheck)
        }
        enforce_admins                    = $false
        required_pull_request_reviews     = @{
            dismiss_stale_reviews           = $true
            require_code_owner_reviews      = $false
            required_approving_review_count = 1
            require_last_push_approval      = $true
        }
        restrictions                      = $null
        required_linear_history           = $true
        allow_force_pushes                = $false
        allow_deletions                   = $false
        required_conversation_resolution  = $true
        block_creations                   = $false
        lock_branch                       = $false
    }

    Invoke-GitHubApi -Method PUT -Path "/repos/$Owner/$Repo/branches/$Branch/protection" -Body $protection | Out-Null
    Write-Host '分支保护已应用：必须 PR + 1 个批准 + hygiene 检查通过 + 线性历史 + 禁止强推/删除。'
}

Write-Section '完成'
Write-Host @'
下一步手工确认（Settings → General / Branches）：
  1. 合并方式只保留 "Allow squash merging"；
  2. 勾选 "Automatically delete head branches"；
  3. 邀请第二位协作者（Settings → Collaborators，角色 Write）；
  4. 若开启了 CODEOWNERS 评审，确认其中用户名都已是协作者。

注意：GitHub Free 的**私有**仓库不支持分支保护与 ruleset，
     需要 GitHub Pro / Team，或把仓库设为 public。
'@
