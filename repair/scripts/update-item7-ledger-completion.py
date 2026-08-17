#!/usr/bin/env python3
from pathlib import Path
import re

p = Path('repair/SM_PIPELINE_21_ITEM_LEDGER.md')
s = p.read_text()
new_row = '''| 7 | Fresh edge-to-edge 9:16 normal-path regression | **Complete — R2→R3→R4→R5→RR1 accepted on Output 168** | Fixture remains Platform Output 168 (`recByMge4QPlCOsD2`) / Content Item 75 (`recA0WClSp6SR6vvl`) with exact `Test_Run_ID=ITEM7_9X16_REGRESSION_RUN32060507474`, 9:16, and `Do_Not_Publish=true`. R2 accepted via L11 `32072311195` plus independent postflight `32072648938`. R3 accepted via L14 `32073675521` with canonical `maxRecords=10` restoration hardened in deploy `32073376086`. R4 accepted via L15 `32074479277` with render job `job-20260817220701-bc03f06f` verified in run `32074747996`. R5 accepted via L16 `32077730040`: one cycle advanced Output 168 to `Render_Status=Rendered`, populated `Final_File_URL`, `Final_File_ID`, and Studio preview fields; controller R5 canonical `maxRecords=5` preservation deployed in `32077649270`. RR1 accepted via L19 `32078647065` after clearing a non-canonical `Review_Status=Pending` fixture state and deploying RR1 canonical `maxRecords=10` preservation in `32078078572`; Output 168 reached `Review_Status=Review Sent` with `Review_Email_Sent_At=2026-08-17T23:02:03.289Z`. All stage postflights proved scenarios OFF, `{Test_Run_ID}=BLANK()` production selectors restored, and schedules preserved. No publishing occurred. | Closed for the bounded 9:16 exact-output regression. Reopen only on new cross-record evidence or a fresh platform-specific acceptance item. Malformed review-HTML concatenation remains Item 10 scope, not an Item 7 blocker. |'''
pat = r'^\| 7 \| Fresh edge-to-edge 9:16 normal-path regression \|.*$'
s2, n = re.subn(pat, new_row, s, count=1, flags=re.M)
if n != 1:
    raise SystemExit(f'Item 7 row replacement count={n}')
append = '''\n\n## 2026-08-17 Item 7 completion delta\n\n- **R5:** run `32077730040` / lease L16. Exact one-cycle pulse finalized Output 168 to `Rendered` with Drive final file `1ZR49jPVZglsnGRda4m7A2-dnC9L6XPiR`, Studio preview URL, and `Do_Not_Publish=true` preserved. Controller patch v8 (`32077649270`) preserves R5 production `maxRecords=5` across exact-stage recovery.\n- **RR1:** failed L18 `32078181389` exposed two gates: production RR1 requires `Review_Status=BLANK()` (fixture had `Pending`), and controller canonical `maxRecords=10` had to be preserved like R3/R5. After clearing the fixture review status, deploying RR1 maxRecords v9 (`32078078572`), and rerunning L19 `32078647065`, Output 168 reached `Review Sent` with review email timestamp `2026-08-17T23:02:03.289Z`; RR1 returned OFF with canonical selector restored.\n- **Item 7 is complete** for the bounded exact-output 9:16 regression on Output 168. Publishing was not attempted and must remain blocked by `Do_Not_Publish=true`.\n'''
if '## 2026-08-17 Item 7 completion delta' not in s2:
    s2 = s2.rstrip() + append
p.write_text(s2 if s2.endswith('\n') else s2 + '\n')
print('updated Item 7 ledger to completion')
