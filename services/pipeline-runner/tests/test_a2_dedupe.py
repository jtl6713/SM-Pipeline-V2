from a2.dedupe import intake_duplicate_formulas, intake_name_key, processed_residue_action


def test_intake_name_key_strips_drive_copy_suffix():
    assert intake_name_key("River Fog 1.jpg") == "River Fog 1.jpg"
    assert intake_name_key("River Fog 1 (1).jpg") == "River Fog 1.jpg"
    assert intake_name_key("River Fog 1 (12).JPG") == "River Fog 1.JPG"


def test_intake_duplicate_formulas_cover_id_and_name_size():
    formulas = intake_duplicate_formulas("abc123", "River Fog 1 (1).jpg", 4400)
    assert ('{Google Drive File ID}="abc123"', "drive_id") in formulas
    assert ('AND({Asset Name}="River Fog 1 (1).jpg",{File_Size_Bytes}=4400)', "name_size") in formulas
    assert ('AND({Asset Name}="River Fog 1.jpg",{File_Size_Bytes}=4400)', "name_size") in formulas


def test_processed_residue_removes_extra_ingestion_parent():
    assert processed_residue_action(
        leftover_id="file1",
        leftover_parents=["ingestion", "photos"],
        existing_drive_id="file1",
        existing_parents=["photos"],
        duplicate_reason="drive_id",
        ingestion_folder_id="ingestion",
        typed_ids={"photos", "video"},
    ) == "remove_ingestion_parent"


def test_processed_residue_trashes_duplicate_copy_only_in_ingestion():
    assert processed_residue_action(
        leftover_id="leftover",
        leftover_parents=["ingestion"],
        existing_drive_id="library",
        existing_parents=["photos"],
        duplicate_reason="name_size",
        ingestion_folder_id="ingestion",
        typed_ids={"photos", "video"},
    ) == "trash_leftover"


def test_processed_residue_retries_move_when_only_copy_is_ingestion():
    assert processed_residue_action(
        leftover_id="file1",
        leftover_parents=["ingestion"],
        existing_drive_id="file1",
        existing_parents=["ingestion"],
        duplicate_reason="drive_id",
        ingestion_folder_id="ingestion",
        typed_ids={"photos", "video"},
    ) == "retry_move"


def test_processed_residue_never_trashes_same_id_only_copy():
    assert processed_residue_action(
        leftover_id="file1",
        leftover_parents=["ingestion"],
        existing_drive_id="file1",
        existing_parents=["ingestion"],
        duplicate_reason="name_size",
        ingestion_folder_id="ingestion",
        typed_ids={"photos"},
    ) != "trash_leftover"


def test_processed_residue_does_not_treat_empty_parents_as_only_ingestion():
    assert processed_residue_action(
        leftover_id="leftover",
        leftover_parents=[],
        existing_drive_id="library",
        existing_parents=["photos"],
        duplicate_reason="name_size",
        ingestion_folder_id="ingestion",
        typed_ids={"photos"},
    ) == "none"
