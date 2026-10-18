param(
  [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$nativeRoot = Join-Path $repo 'native\virtual-camera'
$project = Join-Path $nativeRoot 'media-source\VirtualCameraMediaSource.vcxproj'
$packages = Join-Path $nativeRoot 'packages'
$nuget = Join-Path $repo 'tools\nuget.exe'
$msbuild = $env:PHONECAM_MSBUILD
if (-not $msbuild) {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (Test-Path -LiteralPath $vswhere) {
    $msbuild = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -find 'MSBuild\**\Bin\MSBuild.exe' | Select-Object -First 1
  }
}
$sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\Include'

if (-not $msbuild -or -not (Test-Path -LiteralPath $msbuild)) { throw 'Visual Studio C++ Build Tools are required. Install the Desktop development with C++ workload, or set PHONECAM_MSBUILD.' }
$sdk = Get-ChildItem -LiteralPath $sdkRoot -Directory |
  Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (-not $sdk) { throw 'Windows SDK is required.' }
if (-not (Test-Path -LiteralPath $nuget)) {
  New-Item -ItemType Directory -Path (Split-Path -Parent $nuget) -Force | Out-Null
  Invoke-WebRequest -Uri 'https://dist.nuget.org/win-x86-commandline/latest/nuget.exe' -OutFile $nuget
}

& $nuget restore (Join-Path $nativeRoot 'media-source\packages.config') -PackagesDirectory $packages -NonInteractive
if ($LASTEXITCODE -ne 0) { throw 'NuGet restore failed.' }
& $msbuild $project "/p:Configuration=$Configuration" '/p:Platform=x64' "/p:WindowsTargetPlatformVersion=$($sdk.Name)" "/p:SolutionDir=$nativeRoot\" '/p:TargetName=PhoneCamMediaSource' '/m' '/v:minimal'
if ($LASTEXITCODE -ne 0) { throw 'Media source build failed.' }
& $msbuild (Join-Path $nativeRoot 'manager.vcxproj') "/p:Configuration=$Configuration" '/p:Platform=x64' "/p:WindowsTargetPlatformVersion=$($sdk.Name)" '/m' '/v:minimal'
if ($LASTEXITCODE -ne 0) { throw 'Camera manager build failed.' }
& $msbuild (Join-Path $nativeRoot 'frame-snapshot-test.vcxproj') "/p:Configuration=$Configuration" '/p:Platform=x64' "/p:WindowsTargetPlatformVersion=$($sdk.Name)" '/m' '/v:minimal'
if ($LASTEXITCODE -ne 0) { throw 'Frame snapshot test build failed.' }
& (Join-Path $repo 'release\native\frame-snapshot-test.exe')
if ($LASTEXITCODE -ne 0) { throw 'Frame snapshot regression tests failed.' }
