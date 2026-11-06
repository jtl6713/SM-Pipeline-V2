// Generated from docs/qa-test-center/catalog.v1.json. Keep the JSON source authoritative for versioned cases.
export const QA_CATALOG = Object.freeze({
  "schemaVersion": 1,
  "source": "QA Test Center handoff 2026-10-31",
  "catalogVersion": "2026-10-31.1",
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
    }
  ]
});
