#!/usr/bin/env python3

import argparse
import sys
import typing
from urllib.parse import parse_qs, urlsplit


def fail(message: str) -> typing.NoReturn:
    print(f"OAuth redirect check failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def single_query_value(query: dict[str, list[str]], name: str) -> str:
    values = query.get(name, [])

    if len(values) != 1 or values[0] == "":
        fail(f"expected exactly one non-empty {name} parameter")

    return values[0]


def validate_redirect(raw_url: str, expected_callback: str, expected_prompt: str) -> None:
    parsed = urlsplit(raw_url)

    if parsed.scheme != "https" or parsed.hostname != "accounts.google.com":
        fail("authorization endpoint host did not match Google")

    query_fields = parse_qs(parsed.query, keep_blank_values=True)

    client_id = single_query_value(query_fields, "client_id")
    if not client_id.endswith(".apps.googleusercontent.com"):
        fail("client_id was not a Google web client identifier")

    single_query_value(query_fields, "state")

    expected = urlsplit(expected_callback)
    callback = single_query_value(query_fields, "redirect_uri")
    actual_callback = urlsplit(callback)

    if (
        actual_callback.scheme != expected.scheme
        or actual_callback.hostname != expected.hostname
        or actual_callback.port != expected.port
        or actual_callback.path != expected.path
    ):
        fail("redirect_uri did not match the selected localhost callback")

    prompt_values = query_fields.get("prompt", [])

    if expected_prompt == "absent":
        if prompt_values:
            fail("prompt must be absent")
    elif expected_prompt == "select_account":
        if prompt_values != ["select_account"]:
            fail("prompt must be exactly select_account")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--expected-callback", required=True)
    parser.add_argument("--expected-prompt", required=True, choices=("absent", "select_account"))
    args = parser.parse_args()

    redirect_url = sys.stdin.read()
    if not redirect_url:
        fail("no redirect URL was provided")

    if "\n" in redirect_url:
        fail("redirect URL must be a single-line absolute URL")

    redirect_url = redirect_url.strip()
    if not redirect_url:
        fail("no redirect URL was provided")

    if " " in redirect_url:
        fail("redirect URL must be a single-line absolute URL")

    validate_redirect(redirect_url, args.expected_callback, args.expected_prompt)
    print("local Google OAuth redirect contract: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
