// Compact CI reporter: preserve failing test names and errors, never dump Studio's large HTML/JS source.
const short = (value, max = 240) => String(value ?? "").split(/\r?\n/, 1)[0].slice(0, max);
export default async function* report(source) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for await (const event of source) {
    const data = event.data || {};
    if (event.type === "test:pass") { passed += 1; continue; }
    if (event.type === "test:fail") {
      failed += 1;
      const error = data.details?.error || {};
      yield "FAIL " + short(data.name, 180) + "\n  " +
        short(error.message || error.cause?.message || "Test failed") + "\n  " +
        short(data.file || data.details?.file || "") + (data.line ? ":" + data.line : "") + "\n";
      continue;
    }
    if (event.type === "test:skip") skipped += 1;
  }
  yield "Studio UI regression: " + passed + " passed, " + failed + " failed, " + skipped + " skipped.\n";
}
