param(
  [ValidatePattern('^COM[0-9]+$')]
  [string]$Port = 'COM3',
  [ValidateRange(2,60)]
  [int]$Seconds = 10,
  [string]$ReplayPath
)

$ErrorActionPreference = 'Stop'
$observed = [Collections.Generic.List[object]]::new()

if ($ReplayPath) {
  foreach ($line in Get-Content -LiteralPath $ReplayPath) {
    $record = $line | ConvertFrom-Json -AsHashtable
    $observed.Add($record)
  }
} else {
  $serial = [IO.Ports.SerialPort]::new($Port,250000,[IO.Ports.Parity]::None,8,[IO.Ports.StopBits]::One)
  $serial.DtrEnable = $false
  $serial.RtsEnable = $false
  $serial.ReadTimeout = 200
  $clock = [Diagnostics.Stopwatch]::new()
  try {
    $serial.Open()
    $clock.Start()
    while ($clock.Elapsed.TotalSeconds -lt $Seconds) {
      try { $line = $serial.ReadLine().Trim() } catch [TimeoutException] { continue }
      if (!$line) { continue }
      $observed.Add(@{receivedMs=$clock.Elapsed.TotalMilliseconds;line=$line})
    }
  } finally { $serial.Dispose() }
}

$packetCount = 0
$sampleCount = 0
$nearRails = 0
$missing = 0
$nonIncreasingPackets = 0
$nextIndex = $null
$firstTime = $null
$lastTime = $null
$firstPacketSize = 0
$mode = $null
$referenceV = $null

foreach ($measurement in $observed) {
  $line = [string]$measurement.line
  if ($packetCount -eq 0 -and !$line.StartsWith('{')) {
    # Opening an active serial stream can start partway through a line.
    continue
  }
  $packet = $line | ConvertFrom-Json -AsHashtable
  if ($packet.status -eq 'reference_unset') { throw 'The Uno reports an unset ADC reference. Load the current acquisition firmware.' }
  $countsOnly = $packet.mode -in @('adc_counts','bench_counts')
  $validIndex = ($packet.startIndex -is [long] -or $packet.startIndex -is [int]) -and $packet.startIndex -ge 0
  $validReference = if ($countsOnly) {
    $packet.Contains('referenceV') -and $null -eq $packet.referenceV
  } else {
    !$packet.Contains('mode') -and $packet.referenceV -gt 0 -and $packet.referenceV -le 5.5
  }
  if ($packet.sampleRate -ne 2000 -or $packet.adcMax -ne 1023 -or !$validIndex -or !$validReference -or
      $packet.samples -isnot [array] -or !$packet.samples.Count -or $packet.samples.Count -gt 40) {
    throw 'Unexpected Uno packet header. Check the firmware and serial rate.'
  }
  $time = $measurement.receivedMs
  if ($null -eq $time -or $time -lt 0 -or ($null -ne $lastTime -and $time -lt $lastTime)) {
    throw 'Packet receipt times must be nonnegative and monotonic.'
  }
  $packetMode = if ($countsOnly) { $packet.mode } else { 'voltage_reference' }
  if (!$packetCount) {
    $firstTime = $time
    $firstPacketSize = $packet.samples.Count
    $mode = $packetMode
    $referenceV = $packet.referenceV
  } elseif ($mode -ne $packetMode -or $referenceV -ne $packet.referenceV) {
    throw 'The recording mode or ADC reference changed during the check.'
  }
  $lastTime = $time
  if ($null -ne $nextIndex) {
    if ($packet.startIndex -lt $nextIndex) { $nonIncreasingPackets++ }
    elseif ($packet.startIndex -gt $nextIndex) { $missing += $packet.startIndex - $nextIndex }
  }
  $nextIndex = [Math]::Max([long]$nextIndex, [long]($packet.startIndex + $packet.samples.Count))
  foreach ($code in $packet.samples) {
    if (($code -isnot [int] -and $code -isnot [long]) -or $code -lt 0 -or $code -gt 1023) {
      throw 'A packet contains an invalid ADC count.'
    }
    if ($code -le 1 -or $code -ge 1022) { $nearRails++ }
  }
  $sampleCount += $packet.samples.Count
  $packetCount++
}
if ($packetCount -lt 2 -or $lastTime -le $firstTime) { throw 'Too few timed Uno packets. Verify that the intended firmware is running.' }

[pscustomobject]@{
  Source = if ($ReplayPath) { 'packet_replay' } else { "serial_$Port" }
  Mode = $mode
  DeclaredReferenceV = $referenceV
  NominalSamplesPerSecond = 2000
  ObservedSamplesPerSecond = [Math]::Round(($sampleCount-$firstPacketSize)*1000/($lastTime-$firstTime),1)
  ValidPackets = $packetCount
  RawAdcSamples = $sampleCount
  MissingIndices = $missing
  NonIncreasingPackets = $nonIncreasingPackets
  SamplesNearAdcLimits = $nearRails
  NearRailPercent = [Math]::Round(100.0*$nearRails/$sampleCount,2)
} | ConvertTo-Json
