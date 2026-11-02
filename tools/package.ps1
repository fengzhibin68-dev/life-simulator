<#
.SYNOPSIS
    把游戏打包成可分发文件：便携 ZIP，或带安装步骤的自解压 EXE。

.DESCRIPTION
    只收集运行需要的文件（网页、样式、脚本、数据、启动脚本），不带 .git / docs / 测试工具。
    产物默认输出到仓库外的 dist 目录，避免二进制进仓库。

.PARAMETER Version
    版本号，决定产物文件名，默认 0.4.0。

.PARAMETER OutDir
    输出目录，默认 <仓库>\..\dist。

.PARAMETER Installer
    额外生成自解压安装包 EXE（依赖 Windows 自带的 iexpress.exe）。

.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File tools/package.ps1
    pwsh -ExecutionPolicy Bypass -File tools/package.ps1 -Installer
#>
[CmdletBinding()]
param(
    [string]$Version = '0.4.0',
    [string]$OutDir,
    [switch]$Installer
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path (Split-Path -Parent $root) 'dist' }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd'
$baseName = "life-simulator-v$Version"

# 运行需要的最小文件集
$files = @(
    'index.html',
    'README.md',
    'start.bat',
    'css/style.css',
    'src/core.js',
    'src/storage.js',
    'src/ui.js',
    'data/events.json',
    'data/endings.json',
    'tools/serve.ps1'
)

$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("lifesim-pkg-" + [System.Guid]::NewGuid().ToString('N'))
# 固定叫 LifeSimulator：安装包解压后目录稳定，升级不会到处留版本文件夹
$payloadDir = Join-Path $staging 'LifeSimulator'
New-Item -ItemType Directory -Force -Path $payloadDir | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-Zip([string]$sourceDir, [string]$zipPath, [bool]$includeBase) {
    if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
    [System.IO.Compression.ZipFile]::CreateFromDirectory(
        $sourceDir, $zipPath,
        [System.IO.Compression.CompressionLevel]::Optimal,
        $includeBase,
        [System.Text.Encoding]::UTF8)
}

try {
    foreach ($rel in $files) {
        $src = Join-Path $root $rel
        if (-not (Test-Path -LiteralPath $src)) { throw "缺少文件：$rel" }
        $dst = Join-Path $payloadDir $rel
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }

    $readme = @"
人生模拟器 v$Version（打包于 $stamp）

怎么玩
  1. 解压到任意目录
  2. 双击 start.bat，会自动启动本地服务并打开浏览器
  3. 关闭黑窗口即停止服务

为什么需要 start.bat
  游戏是纯静态页面，但浏览器不允许 file:// 读取 data/*.json，
  所以必须通过本地 HTTP 服务打开，直接用浏览器打开 index.html 会提示数据加载失败。

没装 Python 怎么办
  装一个 Python 3（https://www.python.org/downloads/），或改用 VS Code 的 Live Server 插件。

存档
  存在浏览器的 localStorage 里，换浏览器或清缓存会丢。
"@
    Set-Content -LiteralPath (Join-Path $payloadDir '使用说明.txt') -Value $readme -Encoding UTF8

    # 便携版：解压后是一个 LifeSimulator 文件夹
    $zipPath = Join-Path $OutDir "$baseName.zip"
    New-Zip -sourceDir $payloadDir -zipPath $zipPath -includeBase $true
    $zipSize = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1KB, 1)
    Write-Host "便携版已生成：$zipPath（$zipSize KB）" -ForegroundColor Green

    if ($Installer) {
        $iexpress = Join-Path $env:SystemRoot 'System32\iexpress.exe'
        if (-not (Test-Path -LiteralPath $iexpress)) { throw '找不到 iexpress.exe，无法生成安装包' }

        $stage2 = Join-Path $staging 'installer'
        New-Item -ItemType Directory -Force -Path $stage2 | Out-Null
        Copy-Item -LiteralPath $zipPath -Destination (Join-Path $stage2 'payload.zip') -Force

        $installCmd = @'
@echo off
set "PROGRAMS=%LOCALAPPDATA%\Programs"
set "DEST=%PROGRAMS%\LifeSimulator"
echo.
echo   人生模拟器 —— 正在安装到 %DEST%
echo.
if not exist "%PROGRAMS%" mkdir "%PROGRAMS%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0payload.zip' -DestinationPath '%PROGRAMS%' -Force"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $lnk = Join-Path ([Environment]::GetFolderPath('Programs')) '人生模拟器.lnk'; $s = $ws.CreateShortcut($lnk); $s.TargetPath = '%DEST%\start.bat'; $s.WorkingDirectory = '%DEST%'; $s.IconLocation = '%SystemRoot%\System32\shell32.dll,13'; $s.Save()"
echo   安装完成，开始菜单里已经有「人生模拟器」。
start "" "%DEST%\start.bat"
'@
        Set-Content -LiteralPath (Join-Path $stage2 'install.cmd') -Value $installCmd -Encoding OEM

        $exePath = Join-Path $OutDir "$baseName-setup.exe"

        $sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3
[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=1
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=Life Simulator installed. Shortcut created in Start Menu.
TargetName=$exePath
FriendlyName=Life Simulator
AppLaunched=install.cmd
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles
[Strings]
FILE0=payload.zip
FILE1=install.cmd
[SourceFiles]
SourceFiles0=$stage2\
[SourceFiles0]
%FILE0%=
%FILE1%=
"@
        $sedPath = Join-Path $staging 'package.sed'
        Set-Content -LiteralPath $sedPath -Value $sed -Encoding ASCII

        $proc = Start-Process -FilePath $iexpress -ArgumentList '/N', '/Q', $sedPath -Wait -PassThru -WindowStyle Hidden
        if ($proc.ExitCode -ne 0) { throw "iexpress 失败，退出码 $($proc.ExitCode)" }
        if (-not (Test-Path -LiteralPath $exePath)) { throw 'iexpress 没有生成 exe' }
        $exeSize = [math]::Round((Get-Item -LiteralPath $exePath).Length / 1KB, 1)
        Write-Host "安装包已生成：$exePath（$exeSize KB）" -ForegroundColor Green
    }
}
finally {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue }
}
