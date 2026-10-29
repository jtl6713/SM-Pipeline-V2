"""Private audio repair proof never writes, renders, or uploads; offline tests."""
import hashlib
import os
import unittest
from unittest.mock import patch
from rendering_review.audio_qa_proof import (
  verify_8447_audio_repair, AudioRepairProofFailed,V1,V2,CORRECTED,
  EXPECTED_BYTES
)
class Drive:
 def __init__(self):
  self.downloads=[]
 def get_file(self,id):
  return {"id":id,"mimeType":"video/mp4"}
 def download_file_to_path(self,id,path,timeout=120):
  self.downloads.append(id)
  with open(path,"wb") as f:f.write(b"test-data")
  return path,"video/mp4"
class RepairProofTests(unittest.TestCase):
 def test_detects_media_hash_mismatch_before_bitstream_verification(self):
  drive=Drive()
  with patch("rendering_review.audio_qa_proof._packet_hash",
             side_effect=AssertionError("must not inspect wrong bytes")):
   with self.assertRaisesRegex(AudioRepairProofFailed,
                                "private_media_sha256_mismatch"):
    verify_8447_audio_repair(drive)
  self.assertEqual(drive.downloads,[V1[0]])
 def test_verified_streams_require_original_v1_and_old_v2(self):
  # Patch immutable reference digests solely for tiny hermetic fixtures.
  data=b"x"*EXPECTED_BYTES
  expected=hashlib.sha256(data).hexdigest()
  drive=Drive()
  drive.download_file_to_path=lambda id,path,timeout=120: (
    open(path,"wb").write(data) and path,"video/mp4")
  with patch("rendering_review.audio_qa_proof.V1",(V1[0],expected)):
   with patch("rendering_review.audio_qa_proof.V2",(V2[0],expected)):
    with patch("rendering_review.audio_qa_proof.CORRECTED",
               (CORRECTED[0],expected)):
     with patch("rendering_review.audio_qa_proof._packet_hash",
                side_effect=lambda p,stream:
                   "SHA256="+("1"*64 if os.path.basename(p).startswith(
                     "original") and stream=="0:a:0" else "2"*64)):
      with self.assertRaisesRegex(AudioRepairProofFailed,
            "original_v1_audio_bitstream_not_preserved"):
       verify_8447_audio_repair(drive)
     with patch("rendering_review.audio_qa_proof._packet_hash",
                return_value="SHA256="+"a"*64):
      proof=verify_8447_audio_repair(drive)
      self.assertTrue(proof["verified"])
      self.assertTrue(proof["v1_audio_unchanged"])
      self.assertTrue(proof["v2_video_unchanged"])
      self.assertFalse(proof["public_post_created"])
if __name__=="__main__":unittest.main()
