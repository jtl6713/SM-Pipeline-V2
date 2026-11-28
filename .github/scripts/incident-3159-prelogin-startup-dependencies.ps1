$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$root=Join-Path 'D:\Content Creation' 'ChicagoShining Pipeline'
$known=Get-CimInstance Win32_StartupCommand | Where-Object {$_.Name -eq 'START ChicagoShining Services'}
$task=@(Get-ScheduledTask | Where-Object {$_.TaskName -eq 'SM-Pipeline Local Service Watchdog'})
try {
 if(@($known).Count -ne 1 -or $task.Count -ne 1){throw 'startup_identity_changed'}
 $shell=New-Object -ComObject WScript.Shell
 function Describe([string]$value){
   $out=[ordered]@{type='unknown';target_inside_root=$false;target_exists=$false;target_leaf=$null;script_leaf=$null;script_exists=$false;script_sha256=$null;requires_userprofile=$false;references_onedrive=$false;interactive_launch=$false;references_services=@()}
   $value=[Environment]::ExpandEnvironmentVariables($value).Trim()
   # Resolve only literal shortcut or known launcher path; never evaluate command.
   if($value -match '^"([^"]+\.lnk)"$|^([^"]+\.lnk)$'){
      $lnk=if($Matches[1]){$Matches[1]}else{$Matches[2]}
      if(Test-Path -LiteralPath $lnk -PathType Leaf){
         $sc=$shell.CreateShortcut($lnk);$value='"'+$sc.TargetPath+'" '+$sc.Arguments
         $out.type='shortcut'
      }
   }
   $rootPrefix=[IO.Path]::GetFullPath($root).TrimEnd('\')+'\'
   $parts=[regex]::Matches($value,'(?i)"([^"]+\.(?:ps1|bat|cmd|exe|vbs))"|([A-Za-z]:\\[^"\r\n]*?\.(?:ps1|bat|cmd|exe|vbs))(?=\s|$)')
   foreach($m in $parts){
      $p=if($m.Groups[1].Success){$m.Groups[1].Value}else{$m.Groups[2].Value}
      try{$full=[IO.Path]::GetFullPath($p)}catch{continue}
      if($full.StartsWith($rootPrefix,[StringComparison]::OrdinalIgnoreCase)){
        $out.target_inside_root=$true;$out.target_leaf=[IO.Path]::GetFileName($full);$out.target_exists=Test-Path -LiteralPath $full -PathType Leaf
        if($out.target_exists -and [IO.Path]::GetExtension($full) -in @('.ps1','.cmd','.bat','.vbs')){
          $fi=Get-Item -LiteralPath $full
          if($fi.Length -gt 262144){throw 'launcher_too_large'}
          $source=Get-Content -LiteralPath $full -Raw
          $out.script_leaf=$fi.Name;$out.script_exists=$true;$out.script_sha256=(Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash
          $out.requires_userprofile=$source -match '(?i)USERPROFILE|APPDATA|HKCU:|HKEY_CURRENT_USER'
          $out.references_onedrive=$source -match '(?i)OneDrive'
          $out.interactive_launch=$source -match '(?i)Start-Process|start\s+""|ShellExecute|explorer\.exe|cmd\s+/k|powershell.*-NoExit'
          $out.references_services=@(@('ops-dashboard','pipeline-runner','remotion','timing-engine','voiceover-normalizer','media-transfer','youtube-uploader')|Where-Object{$source -match [regex]::Escape($_)})
        }
      }
   }
   return $out
 }
 $launcher=Describe ([string]$known.Command)
 $watch=@($task[0].Actions|ForEach-Object {Describe ('"'+$_.Execute+'" '+$_.Arguments)})
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
 $principal=New-Object Security.Principal.WindowsPrincipal($identity)
 $sameAccount=$task[0].Principal.UserId -eq $identity.Name
 # Never emit actual account names, full command strings, script contents, or config.
 $result=@{launcher=$launcher;watchdog=$watch;watchdog_logon_type=[string]$task[0].Principal.LogonType;ops_is_admin=$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);ops_same_as_watchdog=$sameAccount;root_exists=(Test-Path -LiteralPath $root -PathType Container);runner_config_exists=(Test-Path -LiteralPath (Join-Path $root 'Services\pipeline-runner\service\.env') -PathType Leaf);read_only=$true}
 Write-Output ('STARTUP3159_DEPENDENCIES='+($result|ConvertTo-Json -Compress -Depth 6))
 Write-Output 'STARTUP3159_DEPENDENCIES_PROOF=PASS_READONLY'
}catch{throw 'startup3159_dependency_inventory_failed'}
