param(
    [Parameter(Mandatory=$true)][string]$GameDirectory,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
# StormLib distributed with PD2 is 32-bit. The game installation is read-only.
# Run with Windows\SysWOW64\WindowsPowerShell\v1.0\powershell.exe.
$ErrorActionPreference = 'Stop'
if ([IntPtr]::Size -ne 4) { throw 'Run this script in 32-bit Windows PowerShell.' }
$taskGamePath = (Resolve-Path -LiteralPath $GameDirectory).Path
$taskDll = (Join-Path $taskGamePath 'ProjectD2\StormLib.dll').Replace('"', '""')
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DamageTargetMpq {
    const string Dll = @"$taskDll";
    [DllImport(Dll, CharSet=CharSet.Ansi)] public static extern bool SFileOpenArchive(string path, uint priority, uint flags, out IntPtr archive);
    [DllImport(Dll, CharSet=CharSet.Ansi)] public static extern bool SFileOpenFileEx(IntPtr archive, string path, uint scope, out IntPtr file);
    [DllImport(Dll)] public static extern uint SFileGetFileSize(IntPtr file, IntPtr high);
    [DllImport(Dll)] public static extern bool SFileReadFile(IntPtr file, byte[] bytes, uint count, out uint read, IntPtr overlap);
    [DllImport(Dll)] public static extern bool SFileCloseFile(IntPtr file);
    [DllImport(Dll)] public static extern bool SFileCloseArchive(IntPtr archive);
}
"@
[void](New-Item -ItemType Directory -Path $OutputDirectory -Force)
$taskOutputPath = (Resolve-Path -LiteralPath $OutputDirectory).Path
$taskFiles = @{}
foreach ($archive in @('d2data.mpq', 'd2exp.mpq', 'ProjectD2\pd2data.mpq')) {
    $handle = [IntPtr]::Zero
    if (![DamageTargetMpq]::SFileOpenArchive((Join-Path $taskGamePath $archive), 0, 0x100, [ref]$handle)) { throw "Cannot open $archive" }
    try {
        $paths = if ($archive -eq 'd2data.mpq') { @('data\local\lng\eng\string.tbl') }
            elseif ($archive -eq 'd2exp.mpq') { @('data\local\lng\eng\expansionstring.tbl') }
            else {
                @('MonStats', 'MonProp', 'SuperUniques', 'Levels') | ForEach-Object { 'data\global\excel\' + $_ + '.txt' }
                'data\global\excel\MonStats.bin'
                'data\local\lng\eng\patchstring.tbl'
            }
        foreach ($path in $paths) {
            $file = [IntPtr]::Zero
            if (![DamageTargetMpq]::SFileOpenFileEx($handle, $path, 0, [ref]$file)) { continue }
            try {
                $size = [DamageTargetMpq]::SFileGetFileSize($file, [IntPtr]::Zero)
                if ($size -eq [uint32]::MaxValue) { throw "Cannot size $path" }
                $bytes = New-Object byte[] $size
                $read = 0
                if (![DamageTargetMpq]::SFileReadFile($file, $bytes, $size, [ref]$read, [IntPtr]::Zero) -or $read -ne $size) { throw "Cannot read $path" }
                $taskFiles[(Split-Path $path -Leaf)] = $bytes
            } finally { [void][DamageTargetMpq]::SFileCloseFile($file) }
        }
    } finally { [void][DamageTargetMpq]::SFileCloseArchive($handle) }
}
foreach ($required in @('MonStats.txt', 'MonStats.bin', 'MonProp.txt', 'SuperUniques.txt', 'Levels.txt', 'string.tbl', 'expansionstring.tbl', 'patchstring.tbl')) {
    if (!$taskFiles.ContainsKey($required)) { throw "Missing $required" }
}
foreach ($name in $taskFiles.Keys) {
    [IO.File]::WriteAllBytes((Join-Path $taskOutputPath $name), $taskFiles[$name])
}
Write-Output 'Extracted source tables and English strings. Run compile-monster-names.py on this output directory, then review the table diff and run both damage:qa commands.'
