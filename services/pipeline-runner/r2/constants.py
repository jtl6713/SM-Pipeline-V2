"""R2 stage constants — mirrors Make scenario 5569495."""

MAKE_SCENARIO_ID = 5569495
MAKE_SCENARIO_NAME = (
    "R2 - Auto Asset Selection v6.2 - Studio + Legacy Explicit Eligibility"
)

# Make modules (blueprint: repair/_tmp_make/r2.json)
MAKE_MODULE_CLAIM = 2
MAKE_MODULE_VIDEO_SEARCH = 5
MAKE_MODULE_VIDEO_AGG = 6
MAKE_MODULE_OPENAI = 7
MAKE_MODULE_PARSE_JSON = 8
MAKE_MODULE_WRITE_SELECTION = 9
MAKE_MODULE_FAILFAST = 14
MAKE_MODULE_P4_PARTIAL = 20
MAKE_MODULE_P4_ZERO = 21

VIDEO_CANDIDATES_VIEW = "R2 - Available Classified Video Assets"
MUSIC_CANDIDATES_VIEW = "R2 - Available Classified Music Assets"
MEDIA_ASSETS_TABLE = "tblSITCujCsJTNcDe"
VIDEO_CANDIDATE_LIMIT = 75
MUSIC_CANDIDATE_LIMIT = 20

# P4 missing-asset webhook (Make modules 20/21)
P4_WEBHOOK_URL = ""

# Worker continuation probe (worker.js STUDIO_R2_WORK_FORMULA)
STUDIO_R2_WORK_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),NOT({Do_Not_Publish}),{Content_Item}!=BLANK(),'
    '{Output_Status}="Ready for Review",'
    'OR({Asset_Need_Status}="Not Needed",{Asset_Need_Status}="Fulfilled"),'
    '{Asset_Selection_Status}=BLANK(),{Render_Status}=BLANK(),'
    '{Remotion_Job_ID}=BLANK(),{Final_File_URL}="")'
)
