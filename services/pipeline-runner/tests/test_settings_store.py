from settings_store import settings_filter


def test_named_and_active_job_filters():
    assert settings_filter('{Setting_Name}="YOUTUBE_API_KEY"')["name"] == "YOUTUBE_API_KEY"
    assert settings_filter("AND({Active}=1,{Setting_Name}='A1_JOB_file1')")["name"] == "A1_JOB_file1"
    assert settings_filter('AND({Active}=1,{Setting_Name}="A1_POLLER_WEBHOOK_URL")')["active"] is True
    assert settings_filter("AND({Setting_Name}='X',{Active}=1)")["name"] == "X"
    assert settings_filter("AND({Active}=1,FIND('A1_JOB_',{Setting_Name})=1)")["prefix"] == "A1_JOB_"
    assert settings_filter("FIND('A1_JOB_',{Setting_Name})=1")["active"] is False
    assert settings_filter(
        'AND({Active}=1,OR({Setting_Name}="MAKE_API_BASE_URL",{Setting_Name}="MAKE_API_TOKEN"))'
    )["names"] == ["MAKE_API_BASE_URL", "MAKE_API_TOKEN"]
    assert settings_filter('{Platform}="Instagram"') is None
