import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(dir, "worker.js"), "utf8");
const service = fs.readFileSync(path.join(dir, "worker-functions-04.mjs"), "utf8");

test("read-only center API is server-side admin only", () => {
  const declaration = 'const isAdminExceptionRecoveryRoute = url.pathname === "/api/admin/exception-recovery";';
  assert.ok(worker.includes(declaration));
  const routeStart = worker.indexOf("if (isAdminExceptionRecoveryRoute) {");
  const routeEnd = worker.indexOf("if (isAdminExceptionConversationRoute)", routeStart);
  assert.ok(routeStart > 0 && routeEnd > routeStart);
  const route = worker.slice(routeStart,routeEnd);
  assert.match(route,/request\.method !== "GET"/);
  assert.match(route,/requirePermission\(authorization, "tenant_admin"\)/);
  assert.match(route,/getStudioExceptionRecoveryCenter\(request, env\)/);
  assert.doesNotMatch(route,/assertWriteRequest|mutate|publish|delete|PATCH|POST/);
});

test("adapter reuses the Quality Agent snapshot without another scheduler", () => {
  const from = service.indexOf("export async function getStudioExceptionRecoveryCenter");
  const to = service.indexOf("/*__STUDIO_WORKER_END:getStudioExceptionRecoveryCenter__*/",from);
  assert.ok(from > 0 && to > from);
  const section = service.slice(from,to);
  assert.match(section,/loadStudioFailedOutputSnapshot\(env,\s*\{\s*fresh:\s*url\.searchParams\.get\("fresh"\) === "1"/);
  assert.match(section,/buildExceptionRecoveryCenter\(snapshot,\s*\{/);
  assert.doesNotMatch(section,/method:\s*"(PATCH|POST|DELETE)"|airtableFetch|setInterval|studioPublish|retryLimit/);
  assert.match(section,/503/);
});
