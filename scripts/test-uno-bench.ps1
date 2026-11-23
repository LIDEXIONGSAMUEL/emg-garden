#Requires -Version 7.0
[CmdletBinding()]
param(
  [ValidatePattern('^COM[0-9]+$')]
  [string]$Port = 'COM3',
  [ValidateRange(5,60)]
  [int]$Seconds = 20,
  [string]$OutputDirectory,
  [switch]$ElectrodesDetached
)

$ErrorActionPreference = 'Stop'
if (!$IsWindows) { throw 'This bench workflow uses Windows COM ports.' }
if (!$OutputDirectory) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $OutputDirectory = Join-Path ([IO.Path]::GetTempPath()) ("emg-uno-bench-$stamp-" + [guid]::NewGuid().ToString('N').Substring(0,8))
}
if (Test-Path -LiteralPath $OutputDirectory) {
  throw 'Use a new output directory to preserve any earlier firmware backup.'
}
$work = (New-Item -ItemType Directory -Path $OutputDirectory).FullName
$build = Join-Path $work 'build'
$sketch = Join-Path (Split-Path -Parent $PSScriptRoot) 'firmware/EmgGardenUno'
$checker = Join-Path $PSScriptRoot 'check-uno-serial.ps1'

$compileOutput = arduino-cli compile --fqbn arduino:avr:uno --build-property 'compiler.cpp.extra_flags=-DEMG_BENCH_CAPTURE=1' --output-dir $build $sketch
if ($LASTEXITCODE -ne 0) { throw 'The Uno bench sketch did not compile.' }
$compileOutput | Set-Content -LiteralPath (Join-Path $work 'compile.txt')
$image = 'build/EmgGardenUno.ino.hex'
if (!(Test-Path -LiteralPath (Join-Path $work $image) -PathType Leaf)) { throw 'The application-only bench image is missing.' }

if (!$ElectrodesDetached) {
  [pscustomobject]@{ Mode = 'prepare_only'; BenchImage = (Join-Path $work $image); BoardWritten = $false } | ConvertTo-Json
  return
}

$arduinoData = ((arduino-cli config get directories.data) -join [Environment]::NewLine).Trim()
if ($LASTEXITCODE -ne 0 -or !$arduinoData) { throw 'Could not locate the Arduino CLI data directory.' }
$avrdudeInstall = Get-ChildItem -LiteralPath (Join-Path $arduinoData 'packages/arduino/tools/avrdude') -Directory |
  Sort-Object { [version](($_.Name -split '-')[0]) } -Descending |
  Where-Object { (Test-Path -LiteralPath (Join-Path $_.FullName 'bin/avrdude.exe')) -and
                 (Test-Path -LiteralPath (Join-Path $_.FullName 'etc/avrdude.conf')) } |
  Select-Object -First 1
if (!$avrdudeInstall) { throw 'Install the Arduino AVR Boards core before running the bench check.' }
$avrdude = Join-Path $avrdudeInstall.FullName 'bin/avrdude.exe'
$config = Join-Path $avrdudeInstall.FullName 'etc/avrdude.conf'
$fullBackup = 'original-flash.bin'
$application = 'original-application.bin'
$applicationBytes = 32256
$evidencePath = Join-Path $work 'bench-result.json'

function Invoke-BoardFlash {
  param([string]$Operation,[string]$LogName,[switch]$WriteFlash)
  $common = @('-C',$config,'-p','atmega328p','-c','arduino','-P',$Port,'-b','115200','-A')
  $guard = if ($WriteFlash) { '-D' } else { '-n' }
  $log = Join-Path $work $LogName
  & $avrdude @common $guard -U $Operation *> $log
  if ($LASTEXITCODE -ne 0) { throw "avrdude failed during $LogName. See $log." }
}

Push-Location -LiteralPath $work
try {
  Invoke-BoardFlash "flash:r:$($fullBackup):r" 'backup.log'
  $flash = [IO.File]::ReadAllBytes((Join-Path $work $fullBackup))
  if ($flash.Length -ne 32768 -or ($flash[0] -eq 255 -and $flash[1] -eq 255)) {
    throw 'The readback is not a complete programmed Uno flash image. The board has not been written.'
  }
  $original = [byte[]]::new($applicationBytes)
  [Array]::Copy($flash,$original,$applicationBytes)
  [IO.File]::WriteAllBytes((Join-Path $work $application),$original)
  Invoke-BoardFlash "flash:v:$($application):r" 'backup-verify.log'
  $originalHash = (Get-FileHash -LiteralPath $application).Hash
  $measurement = $null
  $measurementError = $null
  try {
    Invoke-BoardFlash "flash:w:$($image):i" 'bench-upload.log' -WriteFlash
    $measurement = & $checker -Port $Port -Seconds $Seconds | ConvertFrom-Json
    if ($measurement.Mode -ne 'bench_counts') { throw 'The serial stream was not emitted by the counts-only bench firmware.' }
  } catch {
    $measurementError = $_.Exception.Message
  } finally {
    try {
      if ((Get-FileHash -LiteralPath $application).Hash -ne $originalHash) {
        throw 'The application backup changed during the bench check.'
      }
      Invoke-BoardFlash "flash:w:$($application):r" 'restore.log' -WriteFlash
      Invoke-BoardFlash "flash:v:$($application):r" 'restore-verify.log'
    } catch {
      throw "Could not verify the original firmware restore. Keep the electrodes disconnected. Verified original backup: $(Join-Path $work $application). $($_.Exception.Message)"
    }
  }

  $transportPassed = !$measurementError -and $measurement.RawAdcSamples -ge $Seconds * 1800 -and
    $measurement.MissingIndices -eq 0 -and $measurement.NonIncreasingPackets -eq 0 -and
    [Math]::Abs($measurement.ObservedSamplesPerSecond - 2000) -le 40
  $evidence = [pscustomobject]@{
    Mode = 'uno_bench'
    RequestedSeconds = $Seconds
    OriginalApplicationSha256 = $originalHash
    OriginalRestoredAndVerified = $true
    TransportPassed = $transportPassed
    Measurement = $measurement
    MeasurementError = $measurementError
  }
  $evidence | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $evidencePath
  $evidence | ConvertTo-Json -Depth 6
  if (!$transportPassed) { throw "The bench transport check did not pass. The original firmware was restored and verified. See $evidencePath." }
} finally {
  Pop-Location
}
