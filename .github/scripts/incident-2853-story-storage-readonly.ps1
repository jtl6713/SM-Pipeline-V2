# GET-only diagnostic through the deployed Runner's configuration.
$ErrorActionPreference='Stop'
$root='D:\Content Creation\ChicagoShining Pipeline\Services\pipeline-runner\service'
$phase='runtime'
try {
  $code=@'
import json,sys
from urllib.parse import urlsplit
sys.path.insert(0,sys.argv[1])
phase="import"
try:
    import requests
    from config import load_settings
    from integrations.r2_upload import R2UploadClient
    phase="configuration"
    runtime=load_settings()
    url=str(runtime.get("r2_upload_worker_url") or "").strip()
    secret=str(runtime.get("r2_upload_worker_secret") or "").strip()
    expected="chicagoshining-r2-upload.joseph-t-logan.workers.dev"
    origin=urlsplit(url)
    allowed=origin.scheme=="https" and origin.hostname==expected and not origin.username and not origin.password and origin.port in (None,443)
    print("story2853_config="+json.dumps({"url_present":bool(url),"secret_present":bool(secret),"expected_origin":allowed},separators=(",",":")))
    if not allowed or not secret:
        raise ValueError("configuration")
    storage=R2UploadClient()
    base="https://"+expected
    phase="health"
    health=requests.get(base+"/health",timeout=(5,15),allow_redirects=False)
    version=health.json().get("version","") if health.status_code==200 else ""
    print("story2853_health="+json.dumps({"http":health.status_code,"expected_version":version=="1.3.1-story-audio-read"},separators=(",",":")))
    phase="head"
    keys={"prior":"studio/previews/story-voiceover/rec9qS53G7HDoyCL5/0454c4863049a512c784d2964e74a587387baa5665a2753a1bb8f5b3c501c18d.mp3",
          "synthetic":"studio/previews/story-voiceover/recAAAAAAAAAAAAAA/"+"0"*64+".mp3"}
    for name,key in keys.items():
        try:
            with requests.get(storage._story_endpoint("/lifecycle/object",key),params={"key":key},headers=storage._headers(),timeout=(5,20),allow_redirects=False) as response:
                result="unverified"
                try:
                    body=response.json()
                    if response.status_code==200 and body.get("ok") is True and (body.get("object") or {}).get("key")==key:
                        result="present"
                    elif response.status_code==200 and body.get("ok") is False and body.get("error")=="Not found" and body.get("key")==key:
                        result="absent"
                    elif response.status_code==403:
                        result="forbidden"
                    elif body.get("error")=="Key prefix not allowed":
                        result="prefix_rejected"
                except (ValueError,AttributeError,TypeError):
                    result="invalid_json"
                print("story2853_head="+json.dumps({"sample":name,"http":response.status_code,"result":result},separators=(",",":")))
        except requests.RequestException:
            print("story2853_head="+json.dumps({"sample":name,"http":0,"result":"transport_error"},separators=(",",":")))
    print("story2853_proof=READONLY_COMPLETE")
except Exception:
    print("story2853_error="+phase)
'@
  Push-Location -LiteralPath $root
  try { $code | & python - $root } finally { Pop-Location }
  if($LASTEXITCODE -ne 0){throw 'runtime'}
} catch { Write-Output ('story2853_error='+$phase) }
