' Hidden runner for the local SM Pipeline Windows watchdog.
' Keep the Scheduled Task attached to this wscript.exe process until PowerShell exits,
' so LastTaskResult reflects the watchdog's exit code. No visible console window.
Option Explicit
Dim shell, fso, folder, command, configPath, exitCode
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
folder = fso.GetParentFolderName(WScript.ScriptFullName)
command = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & fso.BuildPath(folder, "watchdog.ps1") & """"
If WScript.Arguments.Count > 0 Then
    configPath = WScript.Arguments.Item(0)
    command = command & " -ConfigPath """ & configPath & """"
End If
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
