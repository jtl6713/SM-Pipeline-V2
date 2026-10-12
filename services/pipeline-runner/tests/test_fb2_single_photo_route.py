from unittest.mock import MagicMock, patch

from fb.fb2 import process_request


def test_single_photo_publish_uses_prepared_attached_media_and_never_binary_upload():
    output = {
        "id": "recABCDEFGHIJKLMN",
        "fields": {
            "Output_ID": 2292,
            "Platform": "Facebook",
            "FB_Publish_Status": "Retry Pending",
            "Publish_Error_Stage": "FB2_PUBLISH",
            "FB_Photo_Count": 1,
            "Image_Count": 1,
            "FB_Package_Revision": "rev",
            "FB_Resolved_Publish_Mode": "Single Photo",
            "Publish_Attempt_Count": 2,
        },
    }
    photo = {"fields": {"FB_Photo_ID": "122148061227022170"}}
    client = MagicMock()
    client.get_record.return_value = output
    graph = MagicMock()
    graph.publish_attached_media.return_value = (200, {"id": "page_12345"})
    with patch("fb.fb2.AirtableClient", return_value=client), \
         patch("fb.fb2.PipelineSettings"), \
         patch("fb.fb2.list_ready_photos", return_value=[photo]), \
         patch("fb.fb2.photo_ids", return_value=["122148061227022170"]), \
         patch("fb.fb2.facebook_message", return_value="First Spins, No Lines"), \
         patch("fb.fb2.post_fingerprint", return_value="fingerprint"), \
         patch("fb.fb2.load_facebook_page_settings", return_value={"page_id": "123", "token": "test"}), \
         patch("fb.fb2.resolve_publish_location", return_value=None), \
         patch("fb.fb2.FacebookPhotoClient", return_value=graph):
        response = process_request(output_record_id=output["id"])
    assert response["processed"] is True
    assert response["platform_post_id"] == "page_12345"
    graph.publish_attached_media.assert_called_once_with(
        message="First Spins, No Lines", photo_ids=["122148061227022170"], place=None
    )
    graph.publish_single_photo.assert_not_called()
    graph.download_image.assert_not_called()
