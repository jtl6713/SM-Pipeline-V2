from pathlib import Path

path = Path('apps/studio-api/worker.js')
text = path.read_text()
old = """input: [{ name: 'output_record_id', type: 'text', default: null, required: true, multiline: false }],
          output: null,"""
new = """input: [{ name: 'output_record_id', type: 'text', default: null, required: true, multiline: false }],
          output: [],"""
if new in text:
    path.write_text(text)
elif old in text:
    path.write_text(text.replace(old, new, 1))
else:
    raise SystemExit('exact Start Scenario probe interface block not found')
