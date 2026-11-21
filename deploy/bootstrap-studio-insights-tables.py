#!/usr/bin/env python3
"""RETIRED. Legacy metadata bootstrap created Airtable tables; schema changes must use Supabase migrations.

This compatibility entrypoint intentionally has no network access.
"""


def main() -> None:
    raise SystemExit("Retired: Supabase-native replacement required; no Airtable API access permitted.")


if __name__ == "__main__":
    main()
