// Generated from docs/qa-test-center/catalog.v1.json. Keep the JSON source authoritative for versioned cases.
export const QA_CATALOG = Object.freeze({
  "schemaVersion": 1,
  "source": "QA Test Center comprehensive Studio regression plan expanded from 2026-10-31 baseline",
  "catalogVersion": "2026-11-06.2",
  "tests": [
    {
      "id": "QA-AUTH-001",
      "title": "Admin access control",
      "category": "AUTH",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Sign in as an authorized admin"
        },
        {
          "order": 2,
          "instruction": "navigate to Admin"
        },
        {
          "order": 3,
          "instruction": "open QA Test Center"
        },
        {
          "order": 4,
          "instruction": "repeat with a non-admin and anonymous browser session."
        }
      ],
      "expectedResults": [
        "Admin functionality is accessible only to administrators; unauthorized requests receive 401/403."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-AUTH-002",
      "title": "Mutation authorization",
      "category": "AUTH",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Using an unauthorized session, POST a manual result and automated-execution request"
        },
        {
          "order": 2,
          "instruction": "repeat with a read-only account."
        }
      ],
      "expectedResults": [
        "No execution or result writes occur; API denies requests and logs authorization failure."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-CAT-001",
      "title": "Catalog completeness",
      "category": "CAT",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open QA catalog"
        },
        {
          "order": 2,
          "instruction": "inspect each test for stable ID, category, prerequisite, step-by-step procedure, expected result and severity."
        }
      ],
      "expectedResults": [
        "Every active catalog test has all required fields and a version."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RUN-001",
      "title": "Start run snapshot",
      "category": "RUN",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Start a run"
        },
        {
          "order": 2,
          "instruction": "inspect catalog snapshot and deployment identifier"
        },
        {
          "order": 3,
          "instruction": "change catalog in a separate version."
        }
      ],
      "expectedResults": [
        "Run retains catalog version, originating deployment and start UTC timestamp."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RUN-002",
      "title": "Manual pass evidence",
      "category": "RUN",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Execute an eligible manual test"
        },
        {
          "order": 2,
          "instruction": "add observations and evidence"
        },
        {
          "order": 3,
          "instruction": "submit Pass."
        }
      ],
      "expectedResults": [
        "Immutable execution created with tester identity, server UTC, notes, evidence and result."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RUN-003",
      "title": "Manual fail",
      "category": "RUN",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Submit an actual reproducible defect with notes and evidence as Fail."
        }
      ],
      "expectedResults": [
        "Failure appears in run summary and regression list; record is immutable."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RUN-004",
      "title": "Blocked result",
      "category": "RUN",
      "severity": "Medium",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Attempt a test with an absent prerequisite"
        },
        {
          "order": 2,
          "instruction": "mark Blocked with reason."
        }
      ],
      "expectedResults": [
        "Blocked is not counted as Pass; missing prerequisite and UTC timestamp recorded."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RUN-005",
      "title": "Result immutability",
      "category": "RUN",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Complete a result"
        },
        {
          "order": 2,
          "instruction": "attempt update and delete through API and UI."
        }
      ],
      "expectedResults": [
        "Historical execution cannot be mutated or deleted; any correction creates a new linked record."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RUN-006",
      "title": "Concurrent run history",
      "category": "RUN",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Start two runs across different builds"
        },
        {
          "order": 2,
          "instruction": "complete overlapping tests."
        }
      ],
      "expectedResults": [
        "Runs and results remain separately attributed and searchable by build and date."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-AUTO-001",
      "title": "Unknown assertion denial",
      "category": "AUTO",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Request an assertion ID not present in server registry."
        }
      ],
      "expectedResults": [
        "Request is rejected and no result is fabricated."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-AUTO-002",
      "title": "False-positive safeguard",
      "category": "AUTO",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Cause a controlled assertion mismatch in an isolated fixture"
        },
        {
          "order": 2,
          "instruction": "execute test."
        }
      ],
      "expectedResults": [
        "Fail recorded with real observed value and evidence, never Pass."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-AUTO-003",
      "title": "Timeout and error handling",
      "category": "AUTO",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Simulate a timeout and an unavailable dependency with safe fixtures."
        }
      ],
      "expectedResults": [
        "Execution returns Error or Blocked, not Pass; diagnostic context retained."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-DIAG-001",
      "title": "Worker health read-only",
      "category": "DIAG",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Execute Worker health diagnostics as admin"
        },
        {
          "order": 2,
          "instruction": "compare observed version and status to live endpoint."
        }
      ],
      "expectedResults": [
        "Evidence includes response time, HTTP status, version and UTC; no mutations."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-DIAG-002",
      "title": "Worker authentication denial",
      "category": "DIAG",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Call protected diagnostic without credentials."
        }
      ],
      "expectedResults": [
        "Unauthorized response and no secret disclosure."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-AT-001",
      "title": "Airtable canonical read",
      "category": "AT",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Read an explicitly allowlisted existing record through read-only credentials and compare normalized fields."
        }
      ],
      "expectedResults": [
        "Recorded evidence matches Airtable canonical fields; no record altered."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-SB-001",
      "title": "Supabase mirror parity",
      "category": "SB",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Select explicit Airtable record IDs"
        },
        {
          "order": 2,
          "instruction": "compare mirror records field-by-field and timestamps."
        }
      ],
      "expectedResults": [
        "Differences recorded as Fail or Blocked; mirror never overrides Airtable."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-SB-002",
      "title": "Database pool protection",
      "category": "SB",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Execute bounded parity scan with concurrency and row limits"
        },
        {
          "order": 2,
          "instruction": "inspect pool metrics."
        }
      ],
      "expectedResults": [
        "No unbounded scan; graceful degradation at configured limits."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-DATA-001",
      "title": "Synthetic record isolation",
      "category": "DATA",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Create a uniquely tagged test fixture in approved isolated environment"
        },
        {
          "order": 2,
          "instruction": "verify exclusions from production queues."
        }
      ],
      "expectedResults": [
        "Fixture never enters live scheduling/publishing and cleanup is verified."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RENDER-001",
      "title": "Full media sequence",
      "category": "RENDER",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect a render with multiple source images, compare first/middle/final frames and duration."
        }
      ],
      "expectedResults": [
        "All intended source images are represented in preserved order; no first-image-only defect."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RENDER-002",
      "title": "Preview playback",
      "category": "RENDER",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open each output preview"
        },
        {
          "order": 2,
          "instruction": "validate HTTP playback and media duration."
        }
      ],
      "expectedResults": [
        "Media plays without authorization errors or missing audio/video."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RENDER-003",
      "title": "Watermark and captions",
      "category": "RENDER",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect branded preview frames and audio/caption tracks."
        }
      ],
      "expectedResults": [
        "Correct brand watermark, legibility, audio and caption timing; manual signoff required for visual quality."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-RENDER-004",
      "title": "Aspect sibling parity",
      "category": "RENDER",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Prepare 9:16 sibling outputs from a shared creative master"
        },
        {
          "order": 2,
          "instruction": "compare content and order."
        }
      ],
      "expectedResults": [
        "Same creative video content across compatible outputs; only aspect framing and platform encoding differ."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-MAE-001",
      "title": "Dry-run safe allocation",
      "category": "MAE",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Run MAE planner dry run for a bounded fixture"
        },
        {
          "order": 2,
          "instruction": "inspect would-schedule changes."
        }
      ],
      "expectedResults": [
        "No approved/scheduled/published records changed; proposed M/A/E slots respect profile TZ."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-MAE-002",
      "title": "Schedule recomputation",
      "category": "MAE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Use synthetic approvals and regenerate the proposal across a 30-day window."
        }
      ],
      "expectedResults": [
        "Results fill morning, afternoon, evening in configured order and preserve occupied slots."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PUB-001",
      "title": "No unattended publish",
      "category": "PUB",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Attempt publish-capable action from automated QA executor and synthetic fixture."
        }
      ],
      "expectedResults": [
        "Explicit deny; no live publication request or token used."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-AI-001",
      "title": "AI evidence versus approval",
      "category": "AI",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Ask AI to assess a screenshot/worker trace"
        },
        {
          "order": 2,
          "instruction": "attempt to mark manual review complete automatically."
        }
      ],
      "expectedResults": [
        "AI assessment is provisional; human approval is captured separately before release gate Pass."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-GATE-001",
      "title": "Critical failure blocks release",
      "category": "GATE",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Create a run containing a failed critical test and request release readiness."
        }
      ],
      "expectedResults": [
        "Release gate blocks with exact failed tests and evidence links."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-GATE-002",
      "title": "Blocked test visibility",
      "category": "GATE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Create a run with blocked high-severity test and request release readiness."
        }
      ],
      "expectedResults": [
        "Run cannot be declared fully passed; explicit waiver policy and authorized approver required."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-REG-001",
      "title": "Regression comparison",
      "category": "REG",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Authenticated QA administrator",
        "Explicit test scope and target deployment"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Complete same test across baseline and next release as Pass then Fail."
        }
      ],
      "expectedResults": [
        "Regression appears with both build IDs and links to immutable evidence."
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-HOME-001",
      "title": "Dashboard counts and source freshness",
      "category": "HOME",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Open Home after authenticating and select a content profile",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Record the platform counts and refresh; compare against bounded canonical Airtable output statuses; inspect freshness timestamps"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Counts reconcile or identify explicitly stale/unavailable sources; no false ready state"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-HOME-002",
      "title": "All Profiles overview parity",
      "category": "HOME",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Open the All Profiles dashboard",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect Chicago, NYC, LA and Miami counts; switch profiles; check aggregate totals against profile-specific inventory"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Every profile is represented once and aggregate counts reconcile"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-HOME-003",
      "title": "Start a post entrypoints",
      "category": "HOME",
      "severity": "Medium",
      "automation": "manual",
      "prerequisites": [
        "Open Home and navigate the onboarding choices",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Select Upload Video; return; select Completed Video; return; select Step by Step"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Each entrypoint opens the correct production workflow without creating unintended records"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-HOME-004",
      "title": "Scheduled card navigation",
      "category": "HOME",
      "severity": "Medium",
      "automation": "manual",
      "prerequisites": [
        "Ensure at least one scheduled output exists",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open a scheduled output card from Home and inspect its linked Pipeline item"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Correct platform and exact output identity is preserved"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-IDEA-001",
      "title": "Idea search and profile isolation",
      "category": "IDEA",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Select Chicago and inspect Ideas with a known title",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Search the known title; reset filters; switch to Miami; repeat"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Results respect selected profile and filter reset without cross-profile contamination"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-IDEA-002",
      "title": "Manual idea creation and validation",
      "category": "IDEA",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use QA-designated draft data, not a publishable production candidate",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open New idea; enter title, summary and platform choice; validate errors with missing fields; save approved QA draft"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Required-field checks work and one intended Airtable idea is persisted"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-IDEA-003",
      "title": "Idea image match and ordering",
      "category": "IDEA",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use an isolated QA idea with multiple QA-owned photos",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Search assets; attach multiple matching stills; reorder; reload"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Selected photos and order persist; no duplicate photos appear"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-IDEA-004",
      "title": "Promote to production no publishing",
      "category": "IDEA",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use an explicitly authorized isolated QA idea",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect prerequisite summary, content type and selected platforms; promote; verify new Content Item and output references"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Promotion does not approve or publish a post automatically"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-IDEA-005",
      "title": "Unpromoted idea hold and restore",
      "category": "IDEA",
      "severity": "Medium",
      "automation": "manual",
      "prerequisites": [
        "Use an isolated QA-created unpromoted Idea Candidate",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Hold candidate; refresh; restore; refresh again"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Hold and restore state persists with no output publishing side effects"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-IDEA-006",
      "title": "Autonomous duplicate idea guard",
      "category": "IDEA",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Prepare known isolated duplicate title fixtures",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Request a candidate that duplicates a recent title; inspect response and saved records"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Duplicate is blocked or clearly reconciled, never silently created twice"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROD-001",
      "title": "Multi-photo production input",
      "category": "PROD",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use an isolated QA Production Request with at least six stills",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Upload or attach all six; inspect selected media; save; reopen"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "All six images remain attached in their original order"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROD-002",
      "title": "Multi-clip Script a Short directives",
      "category": "PROD",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use six owned test video clips and explicit exact title",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Provide exact clip count, order, narrative, and duration; produce preview; verify all clips"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Final preview contains all selected clips in the correct order and exact title"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROD-003",
      "title": "Voiceover duration and slide fit",
      "category": "PROD",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use QA narrated photo reel with multiple slides",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Generate preview; compare slide dwell to voiceover line timing; verify final duration"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Every narrated image remains visible for intended narration length"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROD-004",
      "title": "Production draft lifecycle",
      "category": "PROD",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Create a QA production draft",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Save once; return to Production; locate draft; edit a field; reload"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Only the intended in-flight draft persists; submitted records are not shown as unsubmitted drafts"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROD-005",
      "title": "Vibe Cut upload progress",
      "category": "PROD",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use approved QA long-form clip",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Upload the clip; observe current file, segments, uploaded segments and terminal state; reload if resumable"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Progress shows x of y segments and identifies current file; no premature success"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROD-006",
      "title": "Asset Manager upload progress parity",
      "category": "PROD",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use at least two QA media assets",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Upload multiple files from Asset Manager; observe current asset, count, bytes/segments and error state"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Per-asset upload progress accurately tracks current file and total; no phantom completion"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROD-007",
      "title": "Production source media completeness",
      "category": "PROD",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use QA request with multiple source photos and videos",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Generate preview; inspect each linked manifest frame and source; compare with selected assets"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "No single-frame truncation or first-part-only export"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROD-008",
      "title": "Aspect ratio output variations",
      "category": "PROD",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use single QA request with vertical and horizontal destinations",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Generate each permitted aspect; inspect framing and output dimensions"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "9:16, 4:5, 1:1 and 16:9 outputs use their intended ratios"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PIPE-001",
      "title": "Ready for Review and Factory parity",
      "category": "PIPE",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Prepare read-only canonical list of all Ready for Review outputs",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Compare every genuinely reviewable output with Approval Factory Needs Eyes; include held statuses and pagination"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "No actionable Ready for Review output is hidden from Factory"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PIPE-002",
      "title": "Pipeline filters and sorting",
      "category": "PIPE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Open Pipeline with multiple profile and platform rows",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Filter by output, platform, render, review and publish state; sort; combine and clear filters"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Selected filters and sort accurately show matching rows"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PIPE-003",
      "title": "Rendering completion truth",
      "category": "PIPE",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Identify an in-queue and a completed QA render",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Compare status, progress timeline and actual rendered file against Airtable"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Completed is shown only after genuine terminal render and valid media"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PIPE-004",
      "title": "Inline title and creative save",
      "category": "PIPE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Select permitted QA output in Pipeline",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Change exact title and creative instructions; save; reload detail view"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Exact title and instructions survive reload without generic title replacement"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PIPE-005",
      "title": "Publishing URL correction permission",
      "category": "PIPE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use a QA output with manually posted URL and appropriate permission",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect URL field editability and exact-output validation; save controlled test URL without publishing"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Authorized corrected public URL can be saved; unrelated outputs are unaffected"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PIPE-006",
      "title": "Reschedule and MAE recomputation",
      "category": "PIPE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use nonpublic QA candidate with approved scheduling prerequisites",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Change scheduled date; recalculate MAE; check other calendar positions"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Schedule recomputation is deterministic and does not silently alter non-target outputs"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-FACT-001",
      "title": "Needs Eyes count and filtered rows",
      "category": "FACT",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use Airtable canonical Ready for Review inventory",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open Factory; compare Needs Eyes badge with actual filtered results including all pages"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Badge equals actionable row total; list contains the exact candidates"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-FACT-002",
      "title": "Factory reject and changes requested",
      "category": "FACT",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use isolated review-only QA output",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Request changes with exact notes; inspect Pipeline and Factory; reload"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Record transitions to Changes Requested, preserves notes and does not publish"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-FACT-003",
      "title": "Single-output formal approve guard",
      "category": "FACT",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use isolated review output and test authorization",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect approval eligibility, confirm exact output; execute only if explicitly authorized in safe test setup"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Approval remains explicitly human-triggered; no unrelated output dispatch"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-FACT-004",
      "title": "Batch approval selection isolation",
      "category": "FACT",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use QA-only outputs or a dry-run acceptance test harness",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Select a subset; inspect confirmation; verify hidden or ineligible outputs are excluded"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Only explicitly eligible selected rows are targets; no unintended publication"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-FACT-005",
      "title": "Stale hold recovery visibility",
      "category": "FACT",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Find held QA output with authoritative approval eligibility",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect hold reason, clear through permitted explicit QA path and refresh Factory"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Eligible held output becomes visible without bypassing formal review"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-FACT-006",
      "title": "Completed batch receipts",
      "category": "FACT",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use a completed QA batch receipt",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open batch history and inspect all children, status and external references"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Parent and every child show genuine terminal receipt and correct destination"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-REVIEW-001",
      "title": "Post-production review enrollment",
      "category": "REVIEW",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use allowlisted private Instagram QA reel",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Enroll in Post Production Edits; inspect status and review session"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Original output is held privately and review attempt is traceable"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-REVIEW-002",
      "title": "Voiceover/caption preview QA",
      "category": "REVIEW",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use private exact-output test render",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Play preview on mobile and desktop; inspect audio, captions and watermark"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Full audio and captions are present and correctly aligned"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-REVIEW-003",
      "title": "Creative redo rollback",
      "category": "REVIEW",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use held QA review with revisions enabled",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Request creative redo; inspect new attempt and preservation of original"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Original version remains recoverable and no publishing occurs"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-LIB-001",
      "title": "Asset upload and deduplication",
      "category": "LIB",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use QA photo and clip fixtures",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Upload batch; refresh; inspect names, media metadata and duplicate handling"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Each file is represented correctly and duplicates are not silently multiplied"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-LIB-002",
      "title": "Asset classification and profile ownership",
      "category": "LIB",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use QA intake asset missing content profile",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Assign specific profile; run classification in bounded QA workflow; reload"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Asset appears only in correct profile and retains its source Drive identity"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-LIB-003",
      "title": "Asset preview and source file",
      "category": "LIB",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use known QA still and clip with Drive source",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open preview and original source; compare duration, dimensions and content"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Preview matches linked media without broken R2/Drive substitution"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-LIB-004",
      "title": "Asset rename reference integrity",
      "category": "LIB",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use isolated QA asset referenced by a draft",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Rename the asset; reload draft and Asset Manager"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Source and linked reference remain intact without unexpected title contamination"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-MUSIC-001",
      "title": "Music library search and preview",
      "category": "MUSIC",
      "severity": "Medium",
      "automation": "manual",
      "prerequisites": [
        "Use approved reusable music library track",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Search track; preview; confirm duration and availability"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Selected track plays and metadata is accurate"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-MUSIC-002",
      "title": "Music copyright risk and safe substitution",
      "category": "MUSIC",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use QA draft with a track marked restricted",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Attempt production and select safer replacement; verify audio track metadata"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Restricted audio is not automatically published and replacement evidence is captured"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-INS-001",
      "title": "Insights linked account coverage",
      "category": "INS",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use each profile with linked destination accounts",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Refresh YouTube and Meta insights; record coverage and failures"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "No profile is shown with invented statistics; absent data is labeled unavailable"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-INS-002",
      "title": "Insights date range and channel filters",
      "category": "INS",
      "severity": "Medium",
      "automation": "manual",
      "prerequisites": [
        "Use known analytics date window",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Change date range and platform filters; compare totals with provider receipt counts"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Displayed charts and counts respect filters and timestamps"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-ENG-001",
      "title": "Engagement discovery read-only",
      "category": "ENG",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use authenticated Engagement screen",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Run bounded discovery, view suggestions, inspect profile scope"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Discovery does not automatically post, like, follow or message"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-ENG-002",
      "title": "Engagement action authorization",
      "category": "ENG",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use explicit QA engagement target",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect action confirmation as nonadmin; test authorized action only if allowed"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "No action occurs without appropriate permission and explicit user confirmation"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROFILE-001",
      "title": "Profile access and sidebar visibility",
      "category": "PROFILE",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use tenant admin and nonadmin test identities",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Compare permitted profile options and admin navigation across roles"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Unauthorized administration is denied server-side; permitted profiles stay scoped"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROFILE-002",
      "title": "New Profile onboarding isolation",
      "category": "PROFILE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use isolated QA profile setup record",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Create setup; inspect default branding and platform auth; do not activate"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Profile remains inactive until authorized activation and does not leak existing data"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-PROFILE-003",
      "title": "Profile branding and language",
      "category": "PROFILE",
      "severity": "Medium",
      "automation": "manual",
      "prerequisites": [
        "Select authorized nonproduction profile",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Edit QA-safe branding settings; reload; switch profiles; return"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Only intended profile values change and UI uses selected identity"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-OPS-001",
      "title": "Operations job status and logs",
      "category": "OPS",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Open Operations as administrator",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect queue/status cards and most recent log receipts; refresh"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Queue status matches current server-run receipts and retains timestamps"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-OPS-002",
      "title": "Runner queue stalled recovery read-only",
      "category": "OPS",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Identify stale QA rendering job",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Inspect worker/runner evidence and error classification without triggering replay"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Investigation identifies exact job, last attempt and safe next action; does not mutate live jobs"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-OPS-003",
      "title": "Quality Agent false-positive prevention",
      "category": "OPS",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use known healthy and deliberately unhealthy QA fixtures",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Run diagnostic classification on both; compare observed evidence"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Healthy fixture is not repaired; unhealthy fixture returns supported error or blocked outcome"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-OPS-004",
      "title": "Exception Recovery authorization and receipts",
      "category": "OPS",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use QA-designated output or read-only existing exception",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open Exception Recovery, preflight and receipt views; inspect action permissions"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Unavailable or unsafe actions are disabled; no phantom successful repair"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-OPS-005",
      "title": "Airtable rate limit and recovery",
      "category": "OPS",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use staging/mock Airtable 429 responses",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Apply bounded requests; inspect retry-after/circuit breaker; observe recovery"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Worker fails fast and recovers without saturating Airtable"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-OPS-006",
      "title": "Supabase mirror read-source controls",
      "category": "OPS",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Keep Airtable canonical and Supabase nonauthoritative",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Simulate mirror lag/pool exhaustion in isolated test; inspect read-source fallback"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "No writes move to Supabase and circuit-breaker protects pool"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-MOBILE-001",
      "title": "iPhone navigation and scroll containment",
      "category": "MOBILE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Open Studio on narrow mobile viewport",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Open hamburger; visit Factory, Production and QA Center; scroll and use form fields"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "No horizontal overflow, hidden action buttons or inaccessible forms"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-MOBILE-002",
      "title": "UI build/cache release parity",
      "category": "MOBILE",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use fresh reload on deployed custom domain",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Compare footer UI version, shared asset cache key and item4 BUILD_ID"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "All runtime versions agree and deployed release is strictly newer than previous"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-MOBILE-003",
      "title": "Upload interruption and resume",
      "category": "MOBILE",
      "severity": "High",
      "automation": "manual",
      "prerequisites": [
        "Use isolated QA asset on unstable network",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Interrupt upload once; reload/resume using recorded segment progress"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "System resumes safely or reports explicit failure; never marks partial file complete"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-SEC-001",
      "title": "Forbidden QA arbitrary URL/script rejection",
      "category": "SEC",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use QA API as authenticated admin",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Try an unregistered test ID with supplied script, URL and publish arguments; inspect status"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "API rejects unsafe automation; no third-party requests or publication occur"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-SEC-002",
      "title": "QA CSRF and content-type rejection",
      "category": "SEC",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Use authenticated QA test session",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Submit POST without JSON and from disallowed Origin; verify rejection"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Mutations require trusted origin and supported bounded JSON payload"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-SEC-003",
      "title": "Cross-run event isolation",
      "category": "SEC",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Create two QA runs with different actors",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Try to append review to wrong run and inspect both histories"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "Results and approvals never cross run boundaries"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    },
    {
      "id": "QA-SEC-004",
      "title": "QA immutable history and idempotent retries",
      "category": "SEC",
      "severity": "Critical",
      "automation": "manual",
      "prerequisites": [
        "Create QA run with retryable fixed request ID",
        "Authenticated QA administrator and explicitly approved test scope"
      ],
      "steps": [
        {
          "order": 1,
          "instruction": "Submit result once; repeat concurrently using same ID; query canonical Airtable records"
        },
        {
          "order": 2,
          "instruction": "Capture server timestamps, exact output IDs and screenshot or API evidence; mark Pass, Fail or Blocked with a rationale."
        }
      ],
      "expectedResults": [
        "At most one immutable event is created per idempotency key and payload"
      ],
      "prohibitedActions": [
        "public_publish",
        "production_delete",
        "unbounded_mutation"
      ],
      "version": 1
    }
  ]
});
