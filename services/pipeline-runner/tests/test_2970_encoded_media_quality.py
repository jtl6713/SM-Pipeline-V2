import json
import shutil
import subprocess

import pytest

from render.media_quality import MediaContractError, render_contract, validate_probe, verify_rendered_media, RECEIPT_FIELD


def output(**patch):
    props={"durationInFrames":300,"fps":30,"width":1080,"height":1920,
           "music":{"url":"https://media.example/music.mp3","volume":0.6},
           "voiceover":{"url":"https://media.example/voice.mp3","volume":1}}
    fields={"Output_Filename":"studio-2970-instagram-story.mp4","Studio_Output_Type":"Story",
            "Render_Total_Frames":300,"Studio_Effective_Voiceover_Mode":"Yes",
            "Studio_Effective_Background_Music_Mode":"Yes",
            "Studio_Output_Directives_JSON":json.dumps({"video_duration_seconds":10,
                  "voiceover_mode":"Yes","background_music_mode":"Yes"}),
            "Selected_Assets_JSON":json.dumps({"target_total_frames":300}),
            "Remotion_Props_JSON":json.dumps(props)}
    return {"id":"recTEST","fields":{**fields,**patch}}


def metadata(duration=10,frames=300,audio=True,width=1080,height=1920):
    v={"codec_type":"video","duration":str(duration),"nb_frames":str(frames),"width":width,"height":height}
    return {"streams":[v]+([{"codec_type":"audio"}] if audio else [])}


def test_expected_both_audio_inputs_and_10_seconds():
    c=render_contract(output())
    assert c["seconds"]==10
    assert c["required_audio"]=={"voiceover":True,"music":True}
    assert set(c["input_source_hashes"])=={"voiceover","music"}
    assert validate_probe(c,metadata(),peak_db=-5,mean_db=-23)["audio_streams"]==1


@pytest.mark.parametrize("name",["music","voiceover"])
def test_required_missing_or_muted_input(name):
    o=output()
    p=json.loads(o["fields"]["Remotion_Props_JSON"])
    p[name]["volume"]=0
    o["fields"]["Remotion_Props_JSON"]=json.dumps(p)
    with pytest.raises(MediaContractError,match="missing or muted"):
        render_contract(o)


def test_reel_replacing_story_detected_even_if_database_count_looks_good():
    c=render_contract(output())
    with pytest.raises(MediaContractError,match="encoded duration"):
        validate_probe(c,metadata(41.9,1257),peak_db=-4,mean_db=-15)


def test_story_bad_planned_duration_and_silent_mix():
    o=output(Render_Total_Frames=1257)
    p=json.loads(o["fields"]["Remotion_Props_JSON"]); p["durationInFrames"]=1257
    o["fields"]["Remotion_Props_JSON"]=json.dumps(p)
    with pytest.raises(MediaContractError,match="Story is not"):
        render_contract(o)
    c=render_contract(output())
    for m,peak,mean in [(metadata(audio=False),None,None),(metadata(),-91,-91),(metadata(),None,None)]:
        with pytest.raises(MediaContractError):
            validate_probe(c,m,peak_db=peak,mean_db=mean)


def test_explicit_no_and_legacy_remain_valid():
    o=output(Studio_Effective_Voiceover_Mode="No",Studio_Effective_Background_Music_Mode="No")
    c=render_contract(o)
    assert validate_probe(c,metadata(audio=False),peak_db=None,mean_db=None)["audio_streams"]==0
    assert verify_rendered_media(output(Output_Filename="legacy.mp4"),b"not-a-probe",job_id="old")=={}


@pytest.mark.skipif(not (shutil.which("ffmpeg") and shutil.which("ffprobe")),reason="FFmpeg tools unavailable")
def test_real_encoded_audio_and_silent_aac(tmp_path):
    # Tiny synthetic 10-second video: actual encoded bytes, not mocked stream metadata.
    o=output()
    p=json.loads(o["fields"]["Remotion_Props_JSON"]); p.update(width=64,height=96)
    o["fields"]["Remotion_Props_JSON"]=json.dumps(p)
    for silent in (False,True):
        path=tmp_path/("silent.mp4" if silent else "audible.mp4")
        audio="anullsrc=r=48000:cl=mono" if silent else "sine=frequency=440:sample_rate=48000"
        subprocess.run(["ffmpeg","-nostdin","-v","error","-y","-f","lavfi","-i","color=c=blue:s=64x96:r=30",
            "-f","lavfi","-i",audio,"-t","10","-c:v","mpeg4","-c:a","aac",str(path)],check=True,timeout=30)
        if silent:
            with pytest.raises(MediaContractError,match="silent"):
                verify_rendered_media(o,path.read_bytes(),job_id="job-silent")
        else:
            result=json.loads(verify_rendered_media(o,path.read_bytes(),job_id="job-audible")[RECEIPT_FIELD])
            assert result["job_id"]=="job-audible" and result["encoded"]["encoded_frames"]==300
            assert result["individual_stems_verified"] is False
