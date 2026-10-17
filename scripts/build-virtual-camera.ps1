param(
  [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$nativeRoot = Join-Path $repo 'native\virtual-camera'
$project = Join-Path $nativeRoot 'media-source\VirtualCameraMediaSource.vcxproj'
$packages = Join-Path $nativeRoot 'packages'
$nuget = Join-Path $repo 'tools\nuget.exe'
$msbuild = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe'
$sdkRoot = 'C:\Program Files (x86)\Windows Kits\10\Include'

if (-not (Test-Path -LiteralPath $msbuild)) { throw 'Visual Studio 2022 C++ Build Tools are required.' }
$sdk = Get-ChildItem -LiteralPath $sdkRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
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
