#!/usr/bin/env python3
"""RETIRED. Archive backfill directly reads Airtable; Supabase is authoritative.

This compatibility entrypoint intentionally has no network access.
"""


def main() -> None:
    raise SystemExit("Retired: Supabase-native replacement required; no Airtable API access permitted.")


if __name__ == "__main__":
    main()
