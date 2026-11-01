from __future__ import annotations
from io import BytesIO
import unittest
from PIL import Image, ImageDraw
from rendering_review.video_watermark_qa import (
    VideoWatermarkUnverified,inspect_logo_frames,
)
PROFILE="recF7UAn0LkMZZrWZ"
OTHER="recT2rbKX3MF7cVFU"

def logo():
    image=Image.new("RGBA",(240,88),(0,0,0,0))
    d=ImageDraw.Draw(image)
    d.rectangle((8,8,55,70),fill=(251,220,21,255))
    d.ellipse((68,14,122,71),fill=(255,255,255,255))
    d.rectangle((142,8,220,75),fill=(41,205,235,255))
    out=BytesIO();image.save(out,format="PNG");return out.getvalue()

def frames(logo_png):
    with Image.open(BytesIO(logo_png)) as original:
        mark=original.resize((50,round(50*original.height/original.width)),
            Image.Resampling.LANCZOS)
    originals=[]
    for color in [(14,32,64),(51,83,20),(102,55,90)]:
        canvas=Image.new("RGBA",(200,400),color+(255,))
        canvas.alpha_composite(mark,(5,4))
        originals.append(canvas.convert("RGB"))
    return originals

class FrameWatermarkTests(unittest.TestCase):
    def test_actual_overlay_in_three_frames_matches_verified_city_logo(self):
        png=logo()
        proof=inspect_logo_frames(frames(png),png,PROFILE,
            target_width=200,left=5,top=4,logo_fraction=.25)
        self.assertTrue(proof["profile_watermark_matched"])
        self.assertEqual(proof["frame_sample_count"],3)
        self.assertEqual(proof["profile_id"],PROFILE)
        self.assertGreater(proof["minimum_pixel_match"],.99)

    def test_missing_logo_or_different_city_sticker_is_not_verified(self):
        original=logo()
        wrong=Image.new("RGBA",(240,88),(255,25,0,255))
        b=BytesIO();wrong.save(b,"PNG")
        with self.assertRaises(VideoWatermarkUnverified):
            inspect_logo_frames(frames(original),b.getvalue(),PROFILE,
                target_width=200,left=5,top=4,logo_fraction=.25)

    def test_every_sample_needs_the_same_overlay(self):
        png=logo();sample=frames(png)
        sample[-1]=Image.new("RGB",(200,400),"black")
        with self.assertRaisesRegex(VideoWatermarkUnverified,"not_visible"):
            inspect_logo_frames(sample,png,PROFILE,target_width=200,
                left=5,top=4,logo_fraction=.25)

    def test_bad_identity_and_transparent_logo_fail_closed(self):
        png=logo()
        for city in ("",OTHER[:8],"invalid"):
            with self.assertRaises(VideoWatermarkUnverified):
                inspect_logo_frames(frames(png),png,city,target_width=200,
                    left=5,top=4,logo_fraction=.25)
        transparent=Image.new("RGBA",(240,88),(0,0,0,0))
        b=BytesIO();transparent.save(b,"PNG")
        with self.assertRaisesRegex(VideoWatermarkUnverified,"opaque_coverage"):
            inspect_logo_frames(frames(png),b.getvalue(),PROFILE,
                target_width=200,left=5,top=4,logo_fraction=.25)

if __name__=="__main__":
    unittest.main()
