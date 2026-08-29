from a3.metadata_merge import (
    authoritative_metadata_terms,
    merge_photo_metadata_fields,
    parse_filename_metadata,
    unique_preserve_order,
)


def test_parse_filename_metadata_smart_name():
    meta = parse_filename_metadata("Andersonville 1.jpeg")
    assert meta["filename_phrase"] == "Andersonville 1"
    assert "andersonville" in meta["filename_tokens"]


def test_parse_filename_metadata_underscores_and_hyphens():
    meta = parse_filename_metadata("Pilsen-Murals_10.jpg")
    assert meta["filename_phrase"] == "Pilsen Murals 10"
    assert meta["filename_tokens"] == ["pilsen", "murals", "10"]


def test_merge_photo_metadata_fields_prefers_filename_and_embedded_tags():
    fields = {
        "AI_Tags": "mural, street art",
        "Search_Keywords": "Chicago neighborhood",
        "Asset_Description": "Colorful wall in an urban setting.",
        "Evidence_From_Metadata": "AI-only metadata note.",
    }
    meta = {
        "filename_phrase": "Pilsen Murals 6",
        "filename_tokens": ["pilsen", "murals", "6"],
        "keywords": ["Chicago street art", "public art"],
        "description": "Woman painting a mural in Pilsen.",
        "sources": ["filename", "embedded", "xmp"],
    }
    merged = merge_photo_metadata_fields(fields, meta, "Pilsen Murals 6.jpg")

    assert merged["Search_Keywords"].startswith("Pilsen Murals 6")
    assert "pilsen" in merged["Search_Keywords"]
    assert "Chicago street art" in merged["Search_Keywords"]
    assert "Chicago neighborhood" in merged["Search_Keywords"]
    assert merged["AI_Tags"].startswith("Pilsen Murals 6")
    assert "mural" in merged["AI_Tags"]
    assert merged["Asset_Description"].startswith("Woman painting a mural in Pilsen.")
    assert "Smart filename: Pilsen Murals 6" in merged["Evidence_From_Metadata"]
    assert merged["Metadata_Used"] is True


def test_authoritative_metadata_terms_falls_back_to_asset_name_when_extractor_errors():
    search, ai, description = authoritative_metadata_terms({"error": "404"}, "The Bean 3.jpeg")
    assert search[0] == "The Bean 3"
    assert "bean" in search
    assert ai == search
    assert description == ""
