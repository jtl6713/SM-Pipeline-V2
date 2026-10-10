Option Explicit
Dim shell, here, command
Set shell = CreateObject("Wscript.Shell")
here = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
shell.CurrentDirectory = here
command = "cmd.exe /c """ & here & "start-ame-bridge.bat"""
shell.Run command, 0, False
