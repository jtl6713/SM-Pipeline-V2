// Studio QA Test Center Supabase-only ledger adapter (server-side).
// No Airtable transport, writes to production outputs, scheduling or publishing.
// Append-only storage tables are protected by RLS, minimal grants and DB triggers.
// Never instantiate this adapter with credentials originating from browser input.
export const QA_RUNS_TABLE = "studio_qa_runs";
export const QA_EVENTS_TABLE = "studio_qa_events";

const specs = Object.freeze({
  [QA_RUNS_TABLE]: {
    columns: "record_id,run_id,catalog_revision,environment,deployment,created_by,created_at_utc,status,idempotency_key,payload_hash",
    filters: {"Run ID":"run_id","Idempotency Key":"idempotency_key"},
    order: "created_at_utc.desc,record_id.desc"
  },
  [QA_EVENTS_TABLE]: {
    columns: "record_id,run_id,execution_id,test_id,event_kind,actor_id,recorded_at_utc,payload_json,idempotency_key,payload_hash",
    filters: {"Run ID":"run_id","Idempotency Key":"idempotency_key"},
    order: "recorded_at_utc.asc,record_id.asc"
  }
});

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function necessary(value, label, max=4096) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw fail(503, "QA ledger " + label + " unavailable");
  return value;
}
function parsedObject(value, label) {
  try {
    const obj = JSON.parse(value);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
  } catch {}
  throw fail(503, "QA ledger " + label + " invalid");
}
function iso(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) throw fail(503, "QA ledger timestamp invalid");
  return date.toISOString();
}
function spec(table) {
  const selected = specs[table];
  if (!selected) throw fail(500, "Unknown QA ledger table");
  return selected;
}
function expose(table, row) {
  if (!row || typeof row !== "object" || !row.record_id)
    throw fail(503, "QA ledger canonical row invalid");
  if (table === QA_RUNS_TABLE) return {id:row.record_id, fields:{
    "Run ID":row.run_id,
    "Catalog Revision":row.catalog_revision,
    "Environment":row.environment,
    "Deployment JSON":JSON.stringify(row.deployment),
    "Created By":row.created_by,
    "Created At UTC":iso(row.created_at_utc),
    "Status":row.status,
    "Idempotency Key":row.idempotency_key,
    "Payload Hash":row.payload_hash
  }};
  return {id:row.record_id,fields:{
    "Execution ID":row.execution_id,
    "Run ID":row.run_id,
    "Test ID":row.test_id,
    "Event Kind":row.event_kind,
    "Actor ID":row.actor_id,
    "Recorded At UTC":iso(row.recorded_at_utc),
    "Payload JSON":JSON.stringify(row.payload_json),
    "Idempotency Key":row.idempotency_key,
    "Payload Hash":row.payload_hash
  }};
}
// Compare the complete committed representation, not just the request key.
// JSON object property order can change during Postgres JSONB normalization.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
function assertCommittedFields(table, row, expected) {
  const timeKeys=table===QA_RUNS_TABLE?new Set(["created_at_utc"]):new Set(["recorded_at_utc"]);
  for (const [key,value] of Object.entries(expected)) {
    const saved=row?.[key];
    if (saved===undefined||saved===null)
      throw fail(503,"QA ledger insert readback omitted a canonical field");
    const same=timeKeys.has(key)
      ? iso(saved)===iso(value)
      : JSON.stringify(canonical(saved))===JSON.stringify(canonical(value));
    if (!same) throw fail(503,"QA ledger insert readback field mismatch");
  }
}
function insertColumns(table, fields) {
  const k=(key)=>necessary(fields[key], key, 8192);
  if (table === QA_RUNS_TABLE) return {
    run_id:k("Run ID"),catalog_revision:k("Catalog Revision"),
    environment:k("Environment"),deployment:parsedObject(k("Deployment JSON"),"deployment"),
    created_by:k("Created By"),created_at_utc:iso(k("Created At UTC")),
    status:k("Status"),idempotency_key:k("Idempotency Key"),
    payload_hash:k("Payload Hash")
  };
  if (table === QA_EVENTS_TABLE) return {
    execution_id:k("Execution ID"),run_id:k("Run ID"),
    test_id:k("Test ID"),event_kind:k("Event Kind"),actor_id:k("Actor ID"),
    recorded_at_utc:iso(k("Recorded At UTC")),
    payload_json:parsedObject(k("Payload JSON"),"payload"),
    idempotency_key:k("Idempotency Key"),payload_hash:k("Payload Hash")
  };
  throw fail(500, "Unknown QA ledger table");
}
function validatedCursor(cursor) {
  if (cursor === null || cursor === undefined || cursor === "") return 0;
  if (typeof cursor !== "string" || !/^(0|[1-9][0-9]{0,6})$/.test(cursor))
    throw fail(400, "Invalid QA pagination cursor");
  const index=Number(cursor);
  if (!Number.isSafeInteger(index) || index > 9999999)
    throw fail(400, "Invalid QA pagination cursor");
  return index;
}
function validatedConfig(env) {
  const raw = necessary(env?.SUPABASE_URL,"URL",300);
  const key = necessary(env?.SUPABASE_SERVICE_ROLE_KEY,"service credential",10000);
  let origin;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password ||
        parsed.search || parsed.hash || parsed.port ||
        (parsed.pathname !== "/" && parsed.pathname !== "") ||
        !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname))
      throw new Error("not an approved Supabase URL");
    origin = parsed.origin;
  } catch {
    throw fail(503, "QA ledger target invalid");
  }
  return {origin,key};
}

// Requester can be replaced by a strict mock for deterministic offline tests.
export function createSupabaseQaLedger(env, requester=fetch) {
  const {origin,key}=validatedConfig(env);
  async function send(table, params, method="GET", body=undefined) {
    spec(table);
    const url = origin + "/rest/v1/" + table + (params ? "?" + params.toString() : "");
    let response;
    try {
      response = await requester(url, {
        method,redirect:"error",
        headers: {
          "apikey":key, "Authorization":"Bearer "+key,
          "Accept":"application/json",
          ...(method === "POST" ? {"Content-Type":"application/json",
            "Prefer":"return=representation"} : {})
        },
        ...(body === undefined ? {} : {body:JSON.stringify(body)}),
        signal:AbortSignal.timeout(8000)
      });
    } catch {
      throw fail(503, "QA ledger network operation unavailable");
    }
    if (response.status === 409) throw fail(409, "QA ledger uniqueness conflict; reconcile before retry");
    if (!response.ok) throw fail(503, "QA canonical persistence unavailable");
    let data;
    try {data=await response.json();} catch {
      throw fail(503,"QA ledger response unreadable");
    }
    if (!Array.isArray(data)) throw fail(503, "QA ledger response invalid");
    return data;
  }
  return Object.freeze({
    async listPage(table, field, value, limit=50, cursor=null, sortField=null) {
      const def=spec(table);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw fail(400, "Unbounded QA ledger request");
      if (sortField && !["Created At UTC","Recorded At UTC"].includes(sortField))
        throw fail(500, "Unknown QA ledger sort");
      if (sortField === "Created At UTC" && table !== QA_RUNS_TABLE ||
          sortField === "Recorded At UTC" && table !== QA_EVENTS_TABLE)
        throw fail(500, "QA ledger sort/table mismatch");
      const start=validatedCursor(cursor);
      const q=new URLSearchParams({select:def.columns,limit:String(limit+1),
        offset:String(start),order:def.order});
      if (field) {
        const column=def.filters[field];
        if (!column || typeof value !== "string" || !value || value.length > 200)
          throw fail(400, "Unknown QA ledger filter");
        q.set(column,"eq."+value);
      }
      const rows=await send(table,q);
      if (rows.length > limit + 1) throw fail(503, "QA ledger page exceeds request budget");
      return {
        records:rows.slice(0,limit).map(row=>expose(table,row)),
        offset:rows.length>limit ? String(start+limit) : null
      };
    },
    async add(table,recordFields) {
      spec(table);
      const expected=insertColumns(table,recordFields);
      const rows=await send(table,new URLSearchParams({select:spec(table).columns}),
        "POST",expected);
      if (rows.length !== 1) throw fail(503,"QA ledger insert readback not committed");
      assertCommittedFields(table,rows[0],expected);
      return expose(table,rows[0]);
    }
  });
}
