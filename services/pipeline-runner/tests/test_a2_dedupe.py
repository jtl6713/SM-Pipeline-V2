from a2.dedupe import intake_duplicate_formulas, intake_name_key


def test_intake_name_key_strips_drive_copy_suffix():
    assert intake_name_key("River Fog 1.jpg") == "River Fog 1.jpg"
    assert intake_name_key("River Fog 1 (1).jpg") == "River Fog 1.jpg"
    assert intake_name_key("River Fog 1 (12).JPG") == "River Fog 1.JPG"


def test_intake_duplicate_formulas_cover_id_and_name_size():
    formulas = intake_duplicate_formulas("abc123", "River Fog 1 (1).jpg", 4400)
    assert '{Google Drive File ID}="abc123"' in formulas
    assert 'AND({Asset Name}="River Fog 1 (1).jpg",{File_Size_Bytes}=4400)' in formulas
    assert 'AND({Asset Name}="River Fog 1.jpg",{File_Size_Bytes}=4400)' in formulas
