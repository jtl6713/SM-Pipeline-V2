#!/usr/bin/env python3
"""Opt-in durable SQLite accounting for standalone Python Airtable HTTP clients.

Call record_attempt once per actual outbound HTTP attempt, including failed attempts.
No token, URL, record identifier, or payload is stored. The caller is responsible
for wrapping the actual transport and for configuring a persistent DB path.
"""
import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS airtable_attempts (
  event_id TEXT PRIMARY KEY,
  hour_utc TEXT NOT NULL,
  source TEXT NOT NULL,
  method TEXT NOT NULL,
  status_class TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS airtable_heartbeats (
  source TEXT NOT NULL,
  hour_utc TEXT NOT NULL,
  collector_ok INTEGER NOT NULL,
  emitted_at TEXT NOT NULL,
  PRIMARY KEY (source, hour_utc)
);
"""
def hour_of(at):
    if isinstance(at,str):
        at=datetime.fromisoformat(at.replace("Z","+00:00"))
    if at.tzinfo is None:
        raise ValueError("timestamp must be timezone aware")
    return at.astimezone(timezone.utc).replace(minute=0,second=0,microsecond=0).isoformat()

def connect(path):
    p=Path(path)
    p.parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(str(p),timeout=10)
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript(SCHEMA)
    return db

def record_attempt(db_path, *, event_id, source, method, status_class, at):
    if source not in ("standalone_scripts","external_integrations"):
        raise ValueError("source must be a supported independently instrumented writer")
    if not event_id or len(event_id)>128:
        raise ValueError("invalid idempotency key")
    if status_class not in ("2xx","3xx","4xx","5xx","network_error"):
        raise ValueError("invalid status class")
    with connect(db_path) as db:
        db.execute("INSERT OR IGNORE INTO airtable_attempts VALUES (?,?,?,?,?)",
                   (event_id,hour_of(at),source,method.upper(),status_class))

def attest_hour(db_path, *, source, hour, observed_at):
    """Attest a completed UTC hour only; no invented zero hours."""
    h=hour_of(hour)
    observed=datetime.fromisoformat(observed_at.replace("Z","+00:00"))
    if observed.tzinfo is None or datetime.fromisoformat(h)>=observ.astimezone(timezone.utc):
        raise ValueError("hour is not completed")
    if datetime.fromisoformat(h)+__import__("datetime").timedelta(hours=1)>observ.astimezone(timezone.utc):
        raise ValueError("hour is still in progress")
    with connect(db_path) as db:
        db.execute("INSERT OR REPLACE INTO airtable_heartbeats VALUES (?,?,1,?)",
                   (source,h,observed.astimezone(timezone.utc).isoformat()))

def export(db_path, *, source, start, end):
    with connect(db_path) as db:
        attempts=db.execute("""SELECT hour_utc,method,status_class,COUNT(*)
          FROM airtable_attempts WHERE source=? AND hour_utc>=? AND hour_utc<?
          GROUP BY hour_utc,method,status_class ORDER BY hour_utc""",
          (source,start,end)).fetchall()
        heartbeats=db.execute("""SELECT hour_utc,collector_ok,emitted_at FROM airtable_heartbeats
          WHERE source=? AND hour_utc>=? AND hour_utc<? ORDER BY hour_utc""",
          (source,start,end)).fetchall()
    return {"source":source,"hourly":[{"hour_utc":h,"method":m,"status_class":s,"attempts":n}
              for h,m,s,n in attempts],
            "attestations":[{"hour_utc":h,"collector_ok":bool(ok),"emitted_at":at}
              for h,ok,at in heartbeats],
            "note":"An attestation proves only this instrumented store was queried successfully, not that all independent processes use it."}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--db",required=True)
    p.add_argument("--source",required=True,choices=["standalone_scripts","external_integrations"])
    p.add_argument("--start",required=True)
    p.add_argument("--end",required=True)
    p.add_argument("--output",required=True)
    a=p.parse_args()
    Path(a.output).write_text(json.dumps(export(a.db,source=a.source,start=a.start,end=a.end),indent=2)+"\n")

if __name__=="__main__":
    main()
