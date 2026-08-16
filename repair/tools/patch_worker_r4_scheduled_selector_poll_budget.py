from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()
old = '      }, 45000, 1000);\n      if (!observed?.matched) throw new HttpError(502, `R4 scheduled selector did not advance Platform Output ${recordId} within 45 seconds`);'
new = '      }, 24000, 3000);\n      if (!observed?.matched) throw new HttpError(502, `R4 scheduled selector did not advance Platform Output ${recordId} within 24 seconds`);'
if text.count(old) != 1:
    raise SystemExit(f'expected exactly one R4 scheduled-selector polling block, found {text.count(old)}')
text = text.replace(old, new, 1)
for required in (
    'action === "pulse_r4_scheduled_selector"',
    '}, 24000, 3000);',
    'phase6StopScenarioVerified(env, lease.scenario_id, 3)',
    'Standalone ACTIVATE/RUN is intentionally disabled',
):
    if required not in text:
        raise SystemExit(f'missing required safety contract: {required}')
path.write_text(text)
print('r4_scheduled_selector_poll_budget_patch=applied')
