"""Generates SQL to bootstrap the very first app_admin user.

Meant to be run once, against a fresh database, before any UI exists to
create users (the debug app's org-management screen itself requires an
authenticated app_admin — this breaks that chicken-and-egg problem). Prints
SQL to stdout; run it directly against Postgres, e.g.:

    PYTHONPATH=. poetry run python scripts/bootstrap_app_admin.py --username admin \\
        | psql "$DATABASE_URL"

Password is prompted interactively (not passed as a CLI arg) so it never
ends up in shell history.
"""

import argparse
import getpass
import sys

from app.security import hash_password


def build_sql(username: str, password_hash: str) -> str:
    escaped_username = username.replace("'", "''")
    escaped_hash = password_hash.replace("'", "''")
    return f"""
INSERT INTO organizations (name, slug)
VALUES ('System', 'system')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (organization_id, username, password_hash, app_role, org_role)
VALUES (
    (SELECT id FROM organizations WHERE slug = 'system'),
    '{escaped_username}',
    '{escaped_hash}',
    'admin',
    'admin'
)
ON CONFLICT (organization_id, username) DO NOTHING;
""".strip()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate SQL to bootstrap the first app_admin user."
    )
    parser.add_argument(
        "--username", required=True, help="Login for the new app_admin."
    )
    args = parser.parse_args()

    password = getpass.getpass("Password for the new app_admin: ")
    if not password:
        print("Password cannot be empty.", file=sys.stderr)
        raise SystemExit(1)
    confirm_password = getpass.getpass("Confirm password: ")
    if password != confirm_password:
        print("Passwords did not match.", file=sys.stderr)
        raise SystemExit(1)

    print(build_sql(args.username, hash_password(password)))


if __name__ == "__main__":
    main()
