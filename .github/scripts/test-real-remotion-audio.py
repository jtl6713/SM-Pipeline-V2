"""Real production-composition smoke: independently detect both synthetic stems.

No live content, credentials, production assets, database, or provider calls.
The tones prove track routing/mixing, not real speech intelligibility or music quality.
"""
import array
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import tempfile
import wave
import zlib

RATE = 48000
FRAMES = 60
FPS = 30
STEMS = {"voiceover": 440, "music": 1000}
ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/remotion-renderer"


def run(args, **kwargs):
    return subprocess.run(args, cwd=SERVICE, check=True, **kwargs)


def tone(path, frequency):
    samples = array.array("h", (round(8192*math.sin(2*math.pi*frequency*i/RATE))
                                 for i in range(3*RATE)))
    if os.sys.byteorder != "little":
        samples.byteswap()
    with wave.open(str(path), "wb") as w:
        w.setparams((1, 2, RATE, len(samples), "NONE", "not compressed"))
        w.writeframes(samples.tobytes())


def photo(path):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind+data))
    width, height = 180, 320
    pixels = (b"\x00" + bytes([80, 120, 160])*width)*height
    path.write_bytes(b"\x89PNG\r\n\x1a\n" +
                     chunk(b"IHDR", struct.pack(">IIBBBBB", width,height,8,2,0,0,0)) +
                     chunk(b"IDAT", zlib.compress(pixels)) + chunk(b"IEND", b""))


def component_db(pcm, frequency):
    # Check the middle second, avoiding intentional fades and codec edges.
    values = pcm[RATE//2:RATE*3//2]
    assert len(values) == RATE, "decoded soundtrack does not cover the planned middle second"
    sine = sum(v*math.sin(2*math.pi*frequency*i/RATE) for i,v in enumerate(values))
    cosine = sum(v*math.cos(2*math.pi*frequency*i/RATE) for i,v in enumerate(values))
    amplitude = 2*math.hypot(sine,cosine)/len(values)/32768
    return round(20*math.log10(max(amplitude,1e-9)),2)


def verify(path, voiceover, music):
    metadata = json.loads(run(["ffprobe","-v","error","-show_streams","-show_format",
                              "-of","json",str(path)],capture_output=True,text=True).stdout)
    video = [s for s in metadata["streams"] if s["codec_type"]=="video"]
    audio = [s for s in metadata["streams"] if s["codec_type"]=="audio"]
    assert len(video)==1 and int(video[0]["nb_frames"])==FRAMES, metadata
    assert abs(float(video[0]["duration"])-FRAMES/FPS)<0.04, video[0]
    if not audio:
        assert not voiceover and not music, "requested audio stream absent"
        return {"voiceover_dbfs":None,"music_dbfs":None,"audio_streams":0}
    assert len(audio)==1, "unexpected audio stream inventory"
    raw = run(["ffmpeg","-v","error","-i",str(path),"-map","0:a:0","-ac","1","-ar",str(RATE),
               "-f","s16le","-"],capture_output=True).stdout
    pcm = array.array("h")
    pcm.frombytes(raw)
    if os.sys.byteorder != "little":
        pcm.byteswap()
    result = {"audio_streams":1}
    for label, enabled in (("voiceover",voiceover),("music",music)):
        db = component_db(pcm, STEMS[label])
        result[label+"_dbfs"] = db
        if enabled:
            assert db > -45, f"{label} missing or inaudible: {db} dBFS"
        else:
            assert db < -60, f"disabled {label} leaked into mix: {db} dBFS"
    if not voiceover and not music:
        peak=max(abs(v) for v in pcm)
        assert peak/32768 < 0.0032, "intentionally silent render contains unexpected sound"
    return result


def main():
    # Keep generated fixtures outside the tracked source tree after the test.
    with tempfile.TemporaryDirectory(prefix="smv2-real-audio-",dir=SERVICE/"public") as public_dir, \
         tempfile.TemporaryDirectory(prefix="smv2-audio-result-") as work:
        public = Path(public_dir)
        work = Path(work)
        photo(public/"photo.png")
        for name,frequency in STEMS.items():
            tone(public/(name+".wav"),frequency)
        receipt = []
        for name,vo,music in [("both",True,True),("vo_only",True,False),
                              ("music_only",False,True),("intentional_silence",False,False)]:
            props = {"width":180,"height":320,"transitionFrames":0,"endHoldFrames":0,
                     "clips":[{"id":"qa-photo","mediaKind":"photo","src":public.name+"/photo.png",
                               "durationFrames":FRAMES}],
                     "voiceover":{"enabled":vo,"src":public.name+"/voiceover.wav","volume":0.7},
                     "voiceoverDurationSeconds":2,"voiceoverEndFrame":FRAMES,
                     "music":{"enabled":music,"src":public.name+"/music.wav","volume":0.4,
                              "duckingEnabled":True,"duckingMultiplier":0.5,
                              "fadeInFrames":0,"fadeOutFrames":0,"loop":True},
                     "watermarkRequired":False,"spokenCaptionsEnabled":False}
            prop_file=work/(name+".json")
            prop_file.write_text(json.dumps(props),encoding="utf-8")
            output=work/(name+".mp4")
            run(["npx","--no-install","remotion","render","src/index.ts","ChicagoShiningPhotoSequence",
                 str(output),"--props="+str(prop_file),"--concurrency=1","--log=error"])
            result=verify(output,vo,music)
            receipt.append({"case":name,"frames":FRAMES,"voiceover":vo,"music":music,**result})
            print("REAL_REMOTION_AUDIO_PASS "+json.dumps(receipt[-1]),flush=True)
        Path(os.environ.get("QA_RECEIPT_PATH","/tmp/real-remotion-audio-receipt.json")).write_text(
            json.dumps({"composition":"ChicagoShiningPhotoSequence","cases":receipt,
                        "commit":os.environ.get("GITHUB_SHA","local")},indent=2),encoding="utf-8")


if __name__=="__main__":
    main()
