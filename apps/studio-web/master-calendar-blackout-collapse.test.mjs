import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./assets/app-item4-0625.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./assets/styles-phase7-0621.css", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");

assert.match(app, /let pipelineScheduleBlackoutHoursOpen = false;/);
assert.match(app, /data-pipeline-blackout-toggle/);
assert.match(app, /Show blackout hours/);
assert.match(app, /Hide blackout hours/);
assert.match(app, /Nothing scheduled/);
assert.match(app, /scheduled item\$\{scheduledCount === 1 \? "" : "s"\} — expand to review/);
assert.match(app, /rowBlackout && !pipelineScheduleBlackoutHoursOpen/);
assert.match(app, /pipelineScheduleIsBlackout/);
assert.match(css, /pipeline-schedule-blackout-band/);
assert.match(css, /pipeline-schedule-blackout-toggle/);
assert.match(html, /UI build 0\.6\.517/);
assert.match(html, /app-item4-0625\.js\?v=0\.6\.517-compact-home-launcher/);

console.log("master calendar blackout collapse contract: PASS");
