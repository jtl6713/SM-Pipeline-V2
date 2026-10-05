' Quality Agent hourly keep-alive with no console window and no focus steal.
' Task Scheduler runs this through wscript.exe. Output stays in hourly-companion-YYYYMMDD.log.
Option Explicit

Dim shell, repo, script, command, code
Set shell = CreateObject("Wscript.Shell")
repo = "D:\Content Creation\ChicagoShining Pipeline\Source Control\SM-Pipeline-V2"
script = repo & "\deploy\local-services\Run-DeskCompanionHourly.ps1"
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """"
' 0 = hidden window. True = wait so Task Scheduler still tracks the run.
code = shell.Run(command, 0, True)
WScript.Quit code
