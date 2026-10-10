param(
    [Parameter(Mandatory = $true)][string]$Message,
    [Parameter(Mandatory = $true)][string]$To,
    [Parameter(Mandatory = $true)][string]$Subject
)
$ErrorActionPreference = 'Stop'
Import-Module Send-MailKitMessage -ErrorAction Stop

$credentialPath = Join-Path $PSScriptRoot 'gmail-credential.local.xml'
if (-not (Test-Path -LiteralPath $credentialPath)) {
    throw "Encrypted Gmail credential not found: $credentialPath"
}
$credential = Import-Clixml -LiteralPath $credentialPath
if (-not ($credential -is [PSCredential])) { throw 'Invalid Gmail credential file' }

$mail = [MimeKit.MimeMessage]::new()
$mail.From.Add([MimeKit.MailboxAddress]::new('ChicagoShining Watchdog', $credential.UserName))
$mail.To.Add([MimeKit.MailboxAddress]::new('', $To))
$mail.Subject = $Subject
$body = [MimeKit.TextPart]::new('plain')
$body.Text = "Computer: $env:COMPUTERNAME`r`nTime: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')`r`n`r`n$Message"
$mail.Body = $body

$client = [MailKit.Net.Smtp.SmtpClient]::new()
try {
    # Port 465 requires encryption from the first byte: no opportunistic downgrade.
    $client.Connect('smtp.gmail.com', 465, [MailKit.Security.SecureSocketOptions]::SslOnConnect)
    $auth = [MailKit.Security.SaslMechanismLogin]::new(
        $credential.UserName, $credential.GetNetworkCredential().Password
    )
    $client.Authenticate($auth)
    $client.Send($mail) | Out-Null
    $client.Disconnect($true)
} finally {
    $client.Dispose()
}
