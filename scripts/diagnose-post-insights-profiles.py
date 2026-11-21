#!/usr/bin/env python3
"""RETIRED. Legacy profile diagnostic queried Airtable; use Supabase-backed diagnostics.

This compatibility entrypoint intentionally has no network access.
"""


def main() -> None:
    raise SystemExit("Retired: Supabase-native replacement required; no Airtable API access permitted.")


if __name__ == "__main__":
    main()
