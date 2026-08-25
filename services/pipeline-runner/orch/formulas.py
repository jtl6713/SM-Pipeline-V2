from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class OrchBranch:
    name: str
    stage: str
    view: str | None
    formula: str
    action: str = "dispatch"


TTD_GUARD = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="TikTok",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Publish_Locked_By}=BLANK(),{Publish_Locked_At}=BLANK(),'
    'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())),'
    '{Publish_Status}!="Published"))'
)
TTD_RETRY_PREFIX = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="TikTok",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Publish_Locked_By}=BLANK(),{Publish_Locked_At}=BLANK(),'
    'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())),'
    '{Publish_Status}!="Published",'
)

FB_PRE = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Facebook",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Publish_Status}!="Published",{Publish_Locked_By}=BLANK(),'
    '{Publish_Locked_At}=BLANK(),OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())),'
    '{Platform_Post_ID}=BLANK()))'
)
FB_POST = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Facebook",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Publish_Status}!="Published",{Publish_Locked_By}=BLANK(),'
    '{Publish_Locked_At}=BLANK(),OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())),'
    '{Platform_Post_ID}!=""))'
)
FB_FBS3 = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Facebook",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Publish_Status}!="Published",{Publish_Locked_By}=BLANK(),'
    '{Publish_Locked_At}=BLANK(),OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW()))))'
)
FB_PRE_RETRY = FB_PRE[:-2] + ',{Publish_Retry_Eligible}=1,'
FB_POST_RETRY = FB_POST[:-2] + ',{Publish_Retry_Eligible}=1,'

APCAR_GUARD = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Instagram",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Publish_Locked_By}=BLANK(),{Publish_Locked_At}=BLANK(),'
    'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW())),'
    '{IG_Carousel_Status}!="Published"))'
)

YT0_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="YouTube",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),{Publish_Locked_By}=BLANK(),'
    '{Publish_Locked_At}=BLANK(),OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW()))))'
)
YTP1_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="YouTube",{YouTube_Stage}="YT1",{Auto_Publish_Enabled}=1,'
    '{Do_Not_Publish}=0,{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),{Publish_Locked_By}=BLANK(),'
    '{Publish_Locked_At}=BLANK(),{YouTube_Upload_Job_ID}=BLANK(),{YouTube_Video_ID}=BLANK(),'
    'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW()))))'
)
YTS1_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="YouTube",{YouTube_Stage}="YT2",{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),{Publish_Locked_By}=BLANK(),'
    '{Publish_Locked_At}=BLANK(),{YouTube_Upload_Job_ID}!="",{YouTube_Video_ID}=BLANK(),'
    'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW()))))'
)
YTS2_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="YouTube",{YouTube_Stage}="YT2",{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),{Publish_Locked_By}=BLANK(),'
    '{Publish_Locked_At}=BLANK(),{YouTube_Video_ID}!="",'
    'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW()))))'
)
YTS3_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="YouTube",{YouTube_Stage}="YT4",{YouTube_Video_ID}!="",'
    '{YouTube_Processing_Status}="Succeeded",{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),'
    '{Publish_Locked_By}=BLANK(),{Publish_Locked_At}=BLANK(),'
    'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW()))))'
)

TTD_BRANCHES = (
    OrchBranch("TTD0", "ttd0", "TTD0 — Ready for Draft Asset Preparation", TTD_GUARD),
    OrchBranch("TTD1", "ttd1", "TTD1 — Ready for Draft Initialization", TTD_GUARD),
    OrchBranch("TTD2", "ttd2", "TTD2 — Draft Processing", TTD_GUARD),
    OrchBranch("TTD3", "ttd3", "TTD3 — Ready for Handoff Email", TTD_GUARD),
    OrchBranch("TTD0 Retry", "ttd0", "TTD — Retry Eligible", TTD_RETRY_PREFIX + 'LEFT({Publish_Error_Stage},4)="TTD0"))'),
    OrchBranch(
        "TTD1 Retry",
        "ttd1",
        "TTD — Retry Eligible",
        TTD_RETRY_PREFIX + 'OR(LEFT({Publish_Error_Stage},4)="TTD1",{Publish_Error_Stage}="TTD_CAPACITY")))',
    ),
    OrchBranch("TTD2 Retry", "ttd2", "TTD — Retry Eligible", TTD_RETRY_PREFIX + 'LEFT({Publish_Error_Stage},4)="TTD2"))'),
    OrchBranch("TTD3 Retry", "ttd3", "TTD — Retry Eligible", TTD_RETRY_PREFIX + 'LEFT({Publish_Error_Stage},4)="TTD3"))'),
)

YT_BRANCHES = (
    OrchBranch("YT0", "yt0", "YT0 Ready for Package Validation", YT0_FORMULA),
    OrchBranch("YTP1", "ytp1", "YT1 Ready to Start Upload", YTP1_FORMULA),
    OrchBranch("YTS1", "yts1", "YT2 Ready to Check Upload", YTS1_FORMULA),
    OrchBranch("YTS2", "yts2", "YT2 Ready to Check Processing", YTS2_FORMULA),
    OrchBranch("YTS3", "yts3", "YT4 Ready for Finalization", YTS3_FORMULA),
)

FB_BRANCHES = (
    OrchBranch("FB0", "fb0", "FB0 — Ready for 4x5 Asset Preparation", FB_PRE),
    OrchBranch("FB1", "fb1", "FB1 — Ready to Create Photo Objects", FB_PRE),
    OrchBranch("FB2", "fb2", "FB2 — Ready to Publish Multi-Photo", FB_PRE),
    OrchBranch("FB2R", "fb2r", "FB2R — Reconcile Ambiguous Publish", FB_PRE),
    OrchBranch("FB3", "fb3", "FB3 — Ready to Finalize", FB_POST),
    OrchBranch("FB0 Retry", "fb0", "FB — Retry Eligible", FB_PRE_RETRY + 'LEFT({Publish_Error_Stage},3)="FB0"))'),
    OrchBranch("FB1 Retry", "fb1", "FB — Retry Eligible", FB_PRE_RETRY + 'LEFT({Publish_Error_Stage},3)="FB1"))'),
    OrchBranch(
        "FB2 Retry",
        "fb2",
        "FB — Retry Eligible",
        FB_PRE_RETRY + 'OR({Publish_Error_Stage}="FB2_PUBLISH",{Publish_Error_Stage}="FB2_COMMIT")))',
    ),
    OrchBranch("FB2R Retry", "fb2r", "FB — Retry Eligible", FB_PRE_RETRY + 'LEFT({Publish_Error_Stage},4)="FB2R"))'),
    OrchBranch("FB3 Retry", "fb3", "FB — Retry Eligible", FB_POST_RETRY + 'LEFT({Publish_Error_Stage},3)="FB3"))'),
    OrchBranch("FBS1", "fbs1", "FBS1 — Ready to Start Slideshow Render", FB_PRE),
    OrchBranch("FBS2", "fbs2", "FBS2 — Slideshow Renders to Poll", FB_PRE),
    OrchBranch("FBS3", "fbs3", "FBS3 — Ready to Publish Slideshow Reel", FB_FBS3),
    OrchBranch("FBS4", "fbs4", "FBS4 — Slideshow Reels to Poll", FB_POST),
)

IGPUB_DUE_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Instagram",{Review_Status}="Approved",'
    '{Output_Status}="Approved for Publishing",{Publish_Status}="Ready to Schedule",'
    '{Publish_Method}="Automated",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Published_At}=BLANK(),OR({Scheduled_Post_Date}=BLANK(),IS_BEFORE({Scheduled_Post_Date},NOW()))))'
)
IGPUB_AP0_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Instagram",'
    'OR({Platform_Output_Type}="Instagram Reel",{Platform_Output_Type}="Instagram Story",'
    '{Platform_Output_Type}="Instagram Feed Post"),{Review_Status}="Approved",'
    '{Output_Status}="Approved for Publishing",{Publish_Status}="Ready to Publish",'
    '{Publish_Method}="Automated",{Auto_Publish_Enabled}=1,{Do_Not_Publish}=0,'
    '{Final_File_ID}!="",{Publish_Asset_URL}=BLANK(),{Published_At}=BLANK()))'
)
IGPUB_AP1_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Instagram",'
    'OR({Platform_Output_Type}="Instagram Reel",{Platform_Output_Type}="Instagram Feed Post"),'
    '{Review_Status}="Approved",{Output_Status}="Approved for Publishing",'
    '{Publish_Status}="Ready to Publish",{Publish_Method}="Automated",{Auto_Publish_Enabled}=1,'
    '{Do_Not_Publish}=0,{Publish_Asset_URL}!="",{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),'
    '{Publish_Locked_By}=BLANK(),{Publish_Locked_At}=BLANK(),'
    'OR({Publish_Next_Retry_At}=BLANK(),IS_BEFORE({Publish_Next_Retry_At},NOW()))))'
)
IGPUB_IGS_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Instagram",{Platform_Output_Type}="Instagram Story",'
    '{Review_Status}="Approved",{Output_Status}="Approved for Publishing",{Do_Not_Publish}=0,'
    '{Publish_Asset_URL}!="",{Publish_Status}="Ready to Publish",{Publish_Method}="Automated",'
    '{Auto_Publish_Enabled}=1,{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),'
    '{IG_Story_Container_ID}=BLANK(),{IG_Story_Post_ID}=BLANK(),'
    'OR({IG_Story_Status}=BLANK(),{IG_Story_Status}="Ready")))'
)
IGPUB_POLL_FORMULA = (
    'AND({Test_Run_ID}=BLANK(),AND({Platform}="Instagram",{Platform_Output_Type}="Instagram Story",'
    '{IG_Story_Status}="Publishing",{IG_Story_Container_ID}!="",{IG_Story_Post_ID}=BLANK(),'
    '{Do_Not_Publish}=0,{Review_Status}="Approved",{Published_At}=BLANK()))'
)

IGPUB_BRANCHES = (
    OrchBranch("Due promote", "promote", None, IGPUB_DUE_FORMULA, action="promote"),
    OrchBranch("AP0", "ap0", "AP0 - Ready to Prepare Publish Asset", IGPUB_AP0_FORMULA),
    OrchBranch("AP1-IG", "ap1_ig", None, IGPUB_AP1_FORMULA),
    OrchBranch("AP1-IGS", "ap1_igs", None, IGPUB_IGS_FORMULA),
    OrchBranch("AP1-IGS-POLL", "ap1_igs_poll", None, IGPUB_POLL_FORMULA),
)

APCAR_BRANCHES = (
    OrchBranch("AP0C", "ap0c", "AP0C - Ready to Prepare Carousel Assets", APCAR_GUARD),
    OrchBranch("AP1C", "ap1c", "AP1C - Ready to Create Child Containers", APCAR_GUARD),
    OrchBranch("AP2C", "ap2c", "AP2C - Children Processing", APCAR_GUARD),
    OrchBranch("AP3C", "ap3c", "AP3C - Ready to Create Parent", APCAR_GUARD),
    OrchBranch("AP3P", "ap3p", "AP3P - Parent Processing", APCAR_GUARD),
    OrchBranch("AP4C", "ap4c", "AP4C - Ready to Publish Parent", APCAR_GUARD),
    OrchBranch("AP4R", "ap4r", "AP4R - Publish Reconciliation", APCAR_GUARD),
    OrchBranch("AP5C", "ap5c", "AP5C - Ready to Finalize", APCAR_GUARD),
)
