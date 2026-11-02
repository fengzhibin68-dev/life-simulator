<#
.SYNOPSIS
    一键启动人生模拟器：找 Python → 选空闲端口 → 打开浏览器 → 起静态服务器。

.DESCRIPTION
    这个游戏是纯静态页面，但浏览器不允许 file:// 读 data/*.json，所以必须走 HTTP。
    本脚本把 README 里那三条命令合成一次运行，双击 start.bat 即可。

.PARAMETER Port
    起始端口，默认 8000；被占用时自动往后找 20 个。

.PARAMETER NoBrowser
    不自动打开浏览器（调试或远程时用）。

.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File tools/serve.ps1
#>
[CmdletBinding()]
param(
    [int]$Port = 8000,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Find-Python {
    foreach ($name in @('python', 'python3', 'py')) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if (-not $cmd) { continue }
        if ($name -eq 'py') { return @{ Exe = 'py'; Prefix = @('-3') } }
        return @{ Exe = $cmd.Source; Prefix = @() }
    }
    return $null
}

function Test-PortFree([int]$candidate) {
    # Windows 下「能绑定」不代表空闲（允许重复绑定），改成试连一次：有人应答就是被占用
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $client.BeginConnect('127.0.0.1', $candidate, $null, $null)
        if (-not $task.AsyncWaitHandle.WaitOne(300)) { return $true }
        return -not $client.Connected
    }
    catch {
        return $true
    }
    finally {
        $client.Close()
    }
}

$python = Find-Python
if (-not $python) {
    Write-Host ''
    Write-Host '  没有找到 Python。' -ForegroundColor Red
    Write-Host '  装一个 Python 3（https://www.python.org/downloads/）后再双击 start.bat；'
    Write-Host '  或者在 VS Code 里用 Live Server 插件打开 index.html。'
    Write-Host ''
    if ($Host.Name -eq 'ConsoleHost') { Read-Host '按回车退出' }
    exit 1
}

$chosen = 0
for ($p = $Port; $p -lt ($Port + 20); $p++) {
    if (Test-PortFree $p) { $chosen = $p; break }
}
if ($chosen -eq 0) {
    Write-Host ''
    Write-Host "  $Port ~ $($Port + 19) 端口都被占用了，先关掉占端口的程序。" -ForegroundColor Red
    Write-Host ''
    if ($Host.Name -eq 'ConsoleHost') { Read-Host '按回车退出' }
    exit 1
}

$url = "http://localhost:$chosen/"

Write-Host ''
Write-Host '  人生模拟器' -ForegroundColor Green
Write-Host "  $url" -ForegroundColor Green
Write-Host '  按 Ctrl+C 停止服务（关掉这个窗口也行）' -ForegroundColor DarkGray
Write-Host ''

if (-not $NoBrowser) {
    try { Start-Process $url | Out-Null } catch { Write-Host "  打不开浏览器，请手动访问 $url" -ForegroundColor Yellow }
}

$arguments = @()
$arguments += $python.Prefix
$arguments += @('-m', 'http.server', "$chosen")

& $python.Exe @arguments
