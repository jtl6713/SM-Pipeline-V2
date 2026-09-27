from a3.images import classification_image_url


class _ThumbDrive:
    def download_thumbnail(self, file_id, *, size="w720"):
        assert file_id == "driveHeic"
        assert size == "w1280"
        return b"jpeg-bytes", "image/jpeg"


def test_heic_classification_uses_drive_jpeg_data_url():
    url = classification_image_url(
        {
            "fields": {
                "Google Drive File ID": "driveHeic",
                "MIME_Type": "image/heif",
                "Asset Name": "Lincoln Park Zoo 4.HEIC",
                "File_Extension": "HEIC",
            }
        },
        drive=_ThumbDrive(),
    )
    assert url.startswith("data:image/jpeg;base64,")


def test_jpeg_classification_uses_authenticated_drive_thumbnail():
    url = classification_image_url(
        {
            "fields": {
                "Google Drive File ID": "driveHeic",
                "MIME_Type": "image/jpeg",
                "Asset Name": "skyline.jpg",
                "File_Extension": "jpg",
            }
        },
        drive=_ThumbDrive(),
    )
    assert url.startswith("data:image/jpeg;base64,")


class _NoThumbDrive:
    def download_thumbnail(self, file_id, *, size="w720"):
        return None


def test_public_image_falls_back_to_drive_download_url_when_thumbnail_missing():
    url = classification_image_url(
        {
            "fields": {
                "Google Drive File ID": "driveJpeg",
                "MIME_Type": "image/jpeg",
                "Asset Name": "skyline.jpg",
                "File_Extension": "jpg",
            }
        },
        drive=_NoThumbDrive(),
    )
    assert url == "https://drive.google.com/uc?export=download&id=driveJpeg"
