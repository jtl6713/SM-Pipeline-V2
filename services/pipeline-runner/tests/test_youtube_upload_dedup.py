from unittest.mock import Mock
import pytest
from yt import ytp1, yts1
from yt.eligibility import ytp1_eligibility_reason

RID='recyWg1UN74FE3EoW'
def setup(monkeypatch,module,fields):
    client=Mock(); client.get_record.return_value={'id':RID,'fields':fields}
    monkeypatch.setattr(module,'AirtableClient',lambda:client)
    monkeypatch.setattr(module,'PipelineSettings',lambda c:object())
    monkeypatch.setattr(module,'load_uploader_settings',lambda *a,**k:{'url':'https://invalid','secret':'test'})
    return client

def test_missing_package_key_stable_and_saved_before_upload(monkeypatch):
    client=setup(monkeypatch,ytp1,{'Output_ID':10544})
    monkeypatch.setattr(ytp1,'ytp1_eligibility_reason',lambda *a,**k:None)
    uploader=Mock()
    keys=[]
    def start(payload):
        assert client.update_record.call_args.args[2]['YouTube_Idempotency_Key']==payload['idempotencyKey']
        keys.append(payload['idempotencyKey'])
        assert payload['outputRecordId']==RID
        return 202,{'id':'job'}
    uploader.start_upload.side_effect=start
    monkeypatch.setattr(ytp1,'YouTubeUploaderClient',lambda **k:uploader)
    for _ in range(2):ytp1.process_request(output_record_id=RID)
    assert keys[0]==keys[1] and RID in keys[0]

@pytest.mark.parametrize('fields,reason',[
    ({'Do_Not_Publish':True},'do_not_publish'),
    ({'Publish_Status':'Published'},'already_published'),
    ({'Platform_Post_URL':'https://youtube.com/watch?v=known'},'already_published'),
])
def test_published_or_held_never_uploads(fields,reason):
    assert ytp1_eligibility_reason({'id':RID,'fields':fields})==reason

@pytest.mark.parametrize('verification',['mismatch','exception'])
def test_saved_video_survives_channel_verification_failure(monkeypatch,verification):
    client=setup(monkeypatch,yts1,{'YouTube_Stage':'YT2','YouTube_Upload_Job_ID':'job'})
    uploader=Mock();uploader.job_status.return_value=(200,{'id':'job','status':'failed','videoId':'saved'})
    monkeypatch.setattr(yts1,'YouTubeUploaderClient',lambda **k:uploader)
    def verify(**kwargs):
        if verification=='exception':raise RuntimeError('temporary')
        return 'Wrong channel','Chicago','expected'
    monkeypatch.setattr(yts1,'verify_upload_channel',verify)
    if verification=='exception':
        with pytest.raises(RuntimeError):yts1.process_request(output_record_id=RID)
    else:yts1.process_request(output_record_id=RID)
    updates=client.update_record.call_args.args[2]
    assert updates['YouTube_Video_ID']=='saved'
    assert updates['Do_Not_Publish'] is True
    assert updates['Publish_Retry_Eligible'] is False
    assert updates.get('YouTube_Upload_Job_ID','job')=='job'


def test_failed_bag_read_does_not_erase_upload_receipt(monkeypatch):
    import supabase_pipeline as sp
    def fail(*a,**k):raise RuntimeError('read unavailable')
    monkeypatch.setattr(sp,'_rest',fail)
    with pytest.raises(RuntimeError,match='read unavailable'):
        sp._merge_json_bag({},'platform_outputs',RID,'error_messages',{'Other':'update'})


def test_partial_bag_update_retains_upload_receipt(monkeypatch):
    import supabase_pipeline as sp
    monkeypatch.setattr(sp,'_rest',lambda *a,**k:[{'error_messages':{'YouTube_Video_ID':'saved','YouTube_Idempotency_Key':'stable'}}])
    result=sp._merge_json_bag({},'platform_outputs',RID,'error_messages',{'Other':'update'})
    assert result['YouTube_Video_ID']=='saved' and result['YouTube_Idempotency_Key']=='stable'
