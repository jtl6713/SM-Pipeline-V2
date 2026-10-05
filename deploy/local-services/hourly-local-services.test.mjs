import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("hourly Quality Agent wrapper has no pause and wraps the companion runner", () => {
  const bat = fs.readFileSync(path.join(here, "HOURLY-Local-Services.bat"), "utf8");
  assert.doesNotMatch(bat, /^\s*pause\b/im);
  assert.match(bat, /Run-DeskCompanionHourly\.ps1/);
  assert.match(bat, /Quality Agent hourly keep-alive/);
});

test("hourly task is registered through a hidden launcher", () => {
  const reg = fs.readFileSync(path.join(here, "Register-DeskCompanionHourly.ps1"), "utf8");
  const vbs = fs.readFileSync(path.join(here, "HOURLY-Local-Services-Hidden.vbs"), "utf8");
  assert.match(reg, /wscript\.exe/);
  assert.match(reg, /HOURLY-Local-Services-Hidden\.vbs/);
  assert.doesNotMatch(reg, /New-ScheduledTaskAction -Execute \$Runner/);
  assert.match(vbs, /Run-DeskCompanionHourly\.ps1/);
  assert.match(vbs, /WindowStyle Hidden/);
  assert.match(vbs, /shell\.Run\(command,\s*0,\s*True\)/);
});

test("hourly runner logs hourly-companion and skips deploy when dirty", () => {
  const ps1 = fs.readFileSync(path.join(here, "Run-DeskCompanionHourly.ps1"), "utf8");
  assert.match(ps1, /hourly-companion-/);
  assert.match(ps1, /start-chicagoshining-local-services\.bat/);
  assert.match(ps1, /verify-chicagoshining-local-services\.bat/);
  assert.match(ps1, /Dirty checkout: log and skip SYNC\/DEPLOY/);
  assert.match(ps1, /Never git reset --hard/);
  assert.doesNotMatch(ps1, /STOP ALL \+ START ALL/);
});
