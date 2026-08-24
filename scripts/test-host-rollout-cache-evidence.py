#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import hashlib
import hmac
import http.server
import io
import json
import os
import shutil
import ssl
import subprocess
import tarfile
import tempfile
import threading
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest import mock
import urllib.error
import urllib.request


REPO_ROOT = Path(__file__).resolve().parents[1]
HELPER_PATH = REPO_ROOT / "scripts/host-rollout-cache-evidence.py"


def _load_helper() -> Any:
    spec = importlib.util.spec_from_file_location("readmates_host_rollout_cache_evidence", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("host rollout cache evidence helper is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _environment() -> dict[str, str]:
    environment = {
        "GITHUB_ACTIONS": "true",
        "GITHUB_RUN_ID": "123",
        "GITHUB_RUN_ATTEMPT": "2",
        "READMATES_HOST_ROLLOUT_LIVE_EVIDENCE": "protected",
        "READMATES_HOST_ROLLOUT_REF_PROTECTED": "true",
        "READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL": "https://origin.rollout.internal.example.org",
        "READMATES_HOST_ROLLOUT_BFF_BASE_URL": "https://bff.rollout.internal.example.org",
        "READMATES_HOST_ROLLOUT_CDN_BASE_URL": "https://cdn.rollout.internal.example.org",
        "READMATES_HOST_ROLLOUT_PUBLIC_CLUB_PATH": "/api/public/clubs/rollout-synthetic-fixture",
        "READMATES_HOST_ROLLOUT_PUBLIC_SESSION_PATH": "/api/public/clubs/rollout-synthetic-fixture/sessions/11111111-1111-4111-8111-111111111111",
        "READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH": "/api/public/clubs/rollout-synthetic-fixture/sessions/22222222-2222-4222-8222-222222222222",
        "READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID": "33333333-3333-4333-8333-333333333333",
        "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE": "readmates-rollout-synthetic-44444444-4444-4444-8444-444444444444",
        "READMATES_HOST_ROLLOUT_SYNTHETIC_EXPECTED_REVISION": "7",
        "READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE": "readmates_session=protected-fixture-value",
        "READMATES_HOST_ROLLOUT_EVIDENCE_HMAC_KEY": "protected-evidence-hmac-key-value-0001",
    }
    marker_payload = (
        "synthetic-owner\n"
        f"{environment['READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID']}\n"
        "rollout-synthetic-fixture\n"
        "22222222-2222-4222-8222-222222222222\n"
        f"{environment['READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE']}\n"
    ).encode()
    environment["READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY"] = (
        "hmac-sha256:"
        + hmac.new(
            environment["READMATES_HOST_ROLLOUT_EVIDENCE_HMAC_KEY"].encode(),
            marker_payload,
            hashlib.sha256,
        ).hexdigest()
    )
    return environment


def _ownership_responses(config: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    club = {
        "schema": "host.club_operations_snapshot.v1",
        "generatedAt": "2026-08-24T01:00:00Z",
        "club": {
            "clubId": config.synthetic_club_id,
            "slug": config.synthetic_club_slug,
            "name": config.synthetic_marker_value,
        },
        "readiness": {},
        "sessionProgress": {},
        "aiUsage": {},
    }
    detail = {
        "sessionId": config.synthetic_session_id,
        "sessionNumber": 999999,
        "title": config.synthetic_marker_value,
        "bookTitle": config.synthetic_marker_value,
        "bookAuthor": config.synthetic_marker_value,
        "bookLink": None,
        "bookImageUrl": None,
        "date": "2026-08-24",
        "startTime": "01:00:00",
        "endTime": "01:30:00",
        "questionDeadlineAt": "2026-08-24T00:00:00Z",
        "locationLabel": config.synthetic_marker_value,
        "meetingUrl": None,
        "meetingPasscode": None,
        "publication": {
            "publicSummary": config.synthetic_marker_value,
            "visibility": "PUBLIC",
            "siteVisibility": "PUBLIC_RECORD",
        },
        "state": "PUBLISHED",
        "attendees": [],
        "feedbackDocument": {"uploaded": False, "fileName": None, "uploadedAt": None},
        "visibility": "PUBLIC",
        "accessScope": "GUEST_READABLE",
        "siteVisibility": "PUBLIC_RECORD",
        "changeReceipt": None,
    }
    return club, detail


def _ownership_identity(helper: Any, environment: dict[str, str]) -> str:
    config = helper.validate_protected_config(environment)
    club, detail = _ownership_responses(config)
    return helper.validate_synthetic_ownership(club, detail, config)


def _rewrite_tar_member(source: Path, destination: Path, member_name: str, replacement: bytes) -> None:
    with tarfile.open(source, "r:") as archive, tarfile.open(destination, "w", format=tarfile.USTAR_FORMAT) as output:
        for member in archive:
            raw = b""
            if member.isreg():
                stream = archive.extractfile(member)
                if stream is None:
                    raise RuntimeError("regular tar member is unavailable")
                raw = stream.read()
            if member.name == member_name:
                raw = replacement
                member.size = len(raw)
            output.addfile(member, io.BytesIO(raw) if member.isreg() else None)


class _RedirectRecorder(http.server.BaseHTTPRequestHandler):
    cross_origin_location = ""
    public_redirect_location = ""
    source_cookies: list[str] = []
    sink_cookies: list[str] = []
    same_origin_final_cookies: list[str] = []
    public_source_hits = 0
    public_final_hits = 0

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler contract
        self.__class__.source_cookies.append(self.headers.get("Cookie", ""))
        length = int(self.headers.get("Content-Length", "0"))
        if length:
            self.rfile.read(length)
        self.send_response(302)
        self.send_header("Location", self.__class__.cross_origin_location)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802 - stdlib handler contract
        if self.path == "/public-redirect":
            self.__class__.public_source_hits += 1
            self.send_response(302)
            self.send_header("Location", self.__class__.public_redirect_location)
            self.end_headers()
            return
        if self.path == "/public-final":
            self.__class__.public_final_hits += 1
            self.send_response(200)
            self.end_headers()
            return
        if self.path == "/same-final":
            self.__class__.same_origin_final_cookies.append(self.headers.get("Cookie", ""))
        else:
            self.__class__.sink_cookies.append(self.headers.get("Cookie", ""))
        self.send_response(200)
        self.end_headers()

    def log_message(self, _format: str, *_args: object) -> None:
        return


class HostRolloutCacheEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.helper = _load_helper()

    def test_protected_config_requires_exact_https_distinct_synthetic_boundaries(self) -> None:
        config = self.helper.validate_protected_config(_environment())
        self.assertEqual(config.synthetic_session_id, "22222222-2222-4222-8222-222222222222")
        self.assertEqual(config.idempotency_key, "rollout-r2a-run-123-attempt-2")

        mutations = []
        for key in (
            "READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL",
            "READMATES_HOST_ROLLOUT_BFF_BASE_URL",
            "READMATES_HOST_ROLLOUT_CDN_BASE_URL",
            "READMATES_HOST_ROLLOUT_PUBLIC_CLUB_PATH",
            "READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH",
            "READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID",
            "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE",
            "READMATES_HOST_ROLLOUT_SYNTHETIC_EXPECTED_REVISION",
            "GITHUB_RUN_ID",
            "GITHUB_RUN_ATTEMPT",
            "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY",
            "READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE",
            "READMATES_HOST_ROLLOUT_EVIDENCE_HMAC_KEY",
        ):
            value = _environment()
            value.pop(key)
            mutations.append((f"missing {key}", value))
        for url in (
            "http://origin.rollout.internal.example.org",
            "https://localhost",
            "https://127.0.0.1",
            "https://fake.example",
            "https://boundary.test",
            "https://user:pass@origin.rollout.internal.example.org",
            "https://origin.rollout.internal.example.org/private",
        ):
            value = _environment()
            value["READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL"] = url
            mutations.append((url, value))
        value = _environment()
        value["READMATES_HOST_ROLLOUT_BFF_BASE_URL"] = value["READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL"]
        mutations.append(("duplicate boundary", value))
        for name, first, second in (
            (
                "default HTTPS port alias",
                "https://same.rollout.internal.example.org",
                "https://same.rollout.internal.example.org:443",
            ),
            (
                "case and trailing-dot alias",
                "https://SAME.rollout.internal.example.org.",
                "https://same.rollout.internal.example.org",
            ),
            (
                "IDNA alias",
                "https://b\u00fccher.rollout.internal.example.org",
                "https://xn--bcher-kva.rollout.internal.example.org",
            ),
        ):
            value = _environment()
            value["READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL"] = first
            value["READMATES_HOST_ROLLOUT_BFF_BASE_URL"] = second
            mutations.append((name, value))
        value = _environment()
        value["READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH"] = "/api/public/clubs/member-club/sessions/22222222-2222-4222-8222-222222222222"
        mutations.append(("non synthetic path", value))
        value = _environment()
        value["READMATES_HOST_ROLLOUT_PUBLIC_SESSION_PATH"] = value["READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH"]
        mutations.append(("same stable and revoked session", value))
        for name, value in mutations:
            with self.subTest(name=name), self.assertRaises(self.helper.CacheEvidenceError):
                self.helper.validate_protected_config(value)

    def test_origin_canonicalization_normalizes_default_port_idna_case_and_trailing_dot(self) -> None:
        environment = _environment()
        environment["READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL"] = "https://ORIGIN.rollout.internal.example.org.:443/"
        config = self.helper.validate_protected_config(environment)
        self.assertEqual(config.origin_base_url, "https://origin.rollout.internal.example.org")

    def test_hmac_key_never_enters_subprocess_argv_and_idempotency_is_non_secret_run_derived(self) -> None:
        environment = _environment()
        environment["READMATES_HOST_ROLLOUT_SYNTHETIC_IDEMPOTENCY_KEY"] = "secret:must:not:be:used"
        config = self.helper.validate_protected_config(environment)
        self.assertEqual(config.idempotency_key, "rollout-r2a-run-123-attempt-2")
        self.assertRegex(config.idempotency_key, r"^[A-Za-z0-9._-]{8,128}$")
        with mock.patch.object(self.helper.subprocess, "run", side_effect=AssertionError("HMAC used subprocess argv")):
            identity = self.helper._hmac_identity("bounded-payload", config.hmac_key)
        self.assertRegex(identity, r"^hmac-sha256:[0-9a-f]{64}$")

    def test_reconciliation_url_contains_only_the_run_derived_operational_identifier(self) -> None:
        config = self.helper.validate_protected_config(_environment())

        class Response(io.BytesIO):
            def __init__(self, value: dict[str, Any], *, marker: str = "") -> None:
                super().__init__(json.dumps(value).encode())
                self.status = 200
                self.headers = {"X-Readmates-Rollout-Synthetic-Marker": marker}

            def __enter__(self) -> "Response":
                return self

            def __exit__(self, *_args: object) -> None:
                self.close()

        club, detail = _ownership_responses(config)
        transition = {"sessionId": config.synthetic_session_id, "state": "CLOSED"}
        receipt = {
            "status": "COMMITTED",
            "receipt": {
                "operation": "SESSION_REVERSE",
                "resourceId": config.synthetic_session_id,
                "resultingVersions": {"sessionRevision": config.expected_revision + 1},
                "projection": {"state": "CLOSED", "siteVisibility": "PRIVATE"},
            },
        }
        responses = [
            Response(club),
            Response(detail),
            Response(transition),
            Response(receipt),
        ]
        with mock.patch.object(self.helper, "_open_privileged", side_effect=responses) as opened:
            self.helper.mutate_synthetic_target(config)
        urls = [call.args[0].full_url for call in opened.call_args_list]
        self.assertTrue(urls[-1].endswith("/rollout-r2a-run-123-attempt-2"))
        self.assertNotIn(config.auth_cookie, "\n".join(urls))
        self.assertNotIn("secret:must:not:be:used", "\n".join(urls))

    def test_existing_host_detail_and_club_context_require_exact_synthetic_public_only_fixture(self) -> None:
        config = self.helper.validate_protected_config(_environment())
        valid_club, valid_detail = _ownership_responses(config)
        identity = self.helper.validate_synthetic_ownership(valid_club, valid_detail, config)
        self.assertRegex(identity, r"^hmac-sha256:[0-9a-f]{64}$")
        for name, mutate in (
            ("wrong club", lambda club, _detail: club["club"].update(clubId="55555555-5555-4555-8555-555555555555")),
            ("wrong slug", lambda club, _detail: club["club"].update(slug="member-club")),
            ("wrong target", lambda _club, detail: detail.update(sessionId="55555555-5555-4555-8555-555555555555")),
            ("content title", lambda _club, detail: detail.update(title="real member title")),
            ("wrong marker", lambda _club, detail: detail["publication"].update(publicSummary="not-the-marker")),
            ("attendee", lambda _club, detail: detail.update(attendees=[{"displayName": "member"}])),
            ("feedback", lambda _club, detail: detail.update(feedbackDocument={"uploaded": True, "fileName": "private.pdf", "uploadedAt": "2026-08-24T00:00:00Z"})),
            ("meeting", lambda _club, detail: detail.update(meetingUrl="https://meet.private.invalid")),
            ("not published", lambda _club, detail: detail.update(state="CLOSED")),
            ("not guest readable", lambda _club, detail: detail.update(accessScope="MEMBER_ONLY")),
            ("not public record", lambda _club, detail: detail.update(siteVisibility="HIDDEN")),
            ("missing publication", lambda _club, detail: detail.update(publication=None)),
            ("unknown detail field", lambda _club, detail: detail.update(memberName="private")),
        ):
            changed_club = json.loads(json.dumps(valid_club))
            changed_detail = json.loads(json.dumps(valid_detail))
            mutate(changed_club, changed_detail)
            with self.subTest(name=name), self.assertRaises(self.helper.CacheEvidenceError):
                self.helper.validate_synthetic_ownership(changed_club, changed_detail, config)

    def test_public_probes_reject_cross_and_same_origin_redirects_before_final_url(self) -> None:
        openssl = shutil.which("openssl")
        if openssl is None:
            self.fail("OpenSSL is required to create the local HTTPS redirect fixture")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            key = root / "fixture.key"
            certificate = root / "fixture.crt"
            subprocess.run(
                [
                    openssl,
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-keyout",
                    str(key),
                    "-out",
                    str(certificate),
                    "-subj",
                    "/CN=127.0.0.1",
                    "-addext",
                    "subjectAltName=IP:127.0.0.1",
                    "-days",
                    "1",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
            server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            server_context.load_cert_chain(certificate, key)
            servers: list[http.server.ThreadingHTTPServer] = []
            threads: list[threading.Thread] = []
            for _ in range(2):
                server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _RedirectRecorder)
                server.socket = server_context.wrap_socket(server.socket, server_side=True)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                servers.append(server)
                threads.append(thread)
            try:
                source, sink = servers
                source_origin = f"https://127.0.0.1:{source.server_port}"
                sink_origin = f"https://127.0.0.1:{sink.server_port}"
                opener = self.helper._no_redirect_opener(ssl_context=ssl._create_unverified_context())
                _RedirectRecorder.public_source_hits = 0
                _RedirectRecorder.public_final_hits = 0
                for name, location in (
                    ("cross-origin", f"{sink_origin}/public-final"),
                    ("same-origin", f"{source_origin}/public-final"),
                ):
                    expected = f"{source_origin}/public-redirect"
                    _RedirectRecorder.public_redirect_location = location
                    request = urllib.request.Request(expected, method="GET")
                    with self.subTest(name=name), self.assertRaises(self.helper.CacheEvidenceError):
                        self.helper._open_public_exact(request, f"prechange {name}", expected, opener=opener)
                self.assertEqual(_RedirectRecorder.public_source_hits, 2)
                self.assertEqual(_RedirectRecorder.public_final_hits, 0)
            finally:
                for server in servers:
                    server.shutdown()
                    server.server_close()
                for thread in threads:
                    thread.join(timeout=5)

    def test_privileged_requests_reject_cross_and_same_origin_redirects_without_forwarding_cookie(self) -> None:
        openssl = shutil.which("openssl")
        if openssl is None:
            self.fail("OpenSSL is required to create the local HTTPS redirect fixture")
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            key = root / "fixture.key"
            certificate = root / "fixture.crt"
            subprocess.run(
                [
                    openssl,
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-keyout",
                    str(key),
                    "-out",
                    str(certificate),
                    "-subj",
                    "/CN=127.0.0.1",
                    "-addext",
                    "subjectAltName=IP:127.0.0.1",
                    "-days",
                    "1",
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
            server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            server_context.load_cert_chain(certificate, key)

            servers: list[http.server.ThreadingHTTPServer] = []
            threads: list[threading.Thread] = []
            for _ in range(2):
                server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _RedirectRecorder)
                server.socket = server_context.wrap_socket(server.socket, server_side=True)
                thread = threading.Thread(target=server.serve_forever, daemon=True)
                thread.start()
                servers.append(server)
                threads.append(thread)
            try:
                source, sink = servers
                source_origin = f"https://127.0.0.1:{source.server_port}"
                sink_origin = f"https://127.0.0.1:{sink.server_port}"
                client_context = ssl._create_unverified_context()
                opener = self.helper._no_redirect_opener(ssl_context=client_context)
                _RedirectRecorder.source_cookies = []
                _RedirectRecorder.sink_cookies = []
                _RedirectRecorder.same_origin_final_cookies = []
                for name, location in (
                    ("cross-origin", f"{sink_origin}/sink"),
                    ("same-origin", f"{source_origin}/same-final"),
                ):
                    _RedirectRecorder.cross_origin_location = location
                    request = urllib.request.Request(
                        f"{source_origin}/revoke",
                        data=b"{}",
                        method="POST",
                        headers={"Cookie": "readmates_session=must-not-forward"},
                    )
                    with self.subTest(name=name), self.assertRaises(self.helper.CacheEvidenceError) as raised:
                        self.helper._open_privileged(
                            request,
                            "synthetic revoke",
                            source_origin,
                            opener=opener,
                        )
                    self.assertNotIn("must-not-forward", str(raised.exception))
                self.assertEqual(_RedirectRecorder.source_cookies, ["readmates_session=must-not-forward"] * 2)
                self.assertEqual(_RedirectRecorder.sink_cookies, [])
                self.assertEqual(_RedirectRecorder.same_origin_final_cookies, [])
            finally:
                for server in servers:
                    server.shutdown()
                    server.server_close()
                for thread in threads:
                    thread.join(timeout=5)

    def test_protected_config_rejects_wrong_context_and_unbounded_values(self) -> None:
        for key, replacement in (
            ("GITHUB_ACTIONS", "false"),
            ("GITHUB_RUN_ID", "0"),
            ("GITHUB_RUN_ATTEMPT", "0"),
            ("READMATES_HOST_ROLLOUT_LIVE_EVIDENCE", "local"),
            ("READMATES_HOST_ROLLOUT_REF_PROTECTED", "false"),
            ("READMATES_HOST_ROLLOUT_SYNTHETIC_EXPECTED_REVISION", "-1"),
            ("READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID", "not-a-uuid"),
            ("READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE", "member-data"),
            ("READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY", "x"),
            ("READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE", "Authorization=Bearer token"),
        ):
            value = _environment()
            value[key] = replacement
            with self.subTest(key=key), self.assertRaises(self.helper.CacheEvidenceError):
                self.helper.validate_protected_config(value)

    def test_time_window_uses_later_prime_or_policy_and_rejects_fake_wait(self) -> None:
        prime = datetime(2026, 8, 24, 1, 0, tzinfo=timezone.utc)
        policy = datetime(2026, 8, 24, 1, 1, tzinfo=timezone.utc)
        completed = datetime(2026, 8, 24, 1, 13, tzinfo=timezone.utc)
        self.helper.validate_time_window(prime, policy, completed)
        for name, values in (
            ("sub 720", (prime, policy, datetime(2026, 8, 24, 1, 12, 59, tzinfo=timezone.utc))),
            ("reverse", (policy, prime, completed)),
            ("future", (prime, policy, datetime(2099, 1, 1, tzinfo=timezone.utc))),
        ):
            with self.subTest(name=name), self.assertRaises(self.helper.CacheEvidenceError):
                self.helper.validate_time_window(*values, now=datetime(2026, 8, 24, 1, 14, tzinfo=timezone.utc))

    def test_profile_archive_round_trip_binds_same_profile_state_and_transport(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root / "profile"
            cache = profile / "Default/Cache/Cache_Data"
            cache.mkdir(parents=True)
            (cache / "data_0").write_bytes(b"public synthetic cached response")
            marker = profile / ".readmates-public-cache-prime-0123456789abcdef"
            marker.write_text("run-123-attempt-2-r2a-public-cache\n", encoding="utf-8")
            state = root / "primed-browser-state.json"
            state.write_text(
                json.dumps(
                    {
                        "schemaVersion": "readmates.public-cache.prime.v1",
                        "artifactId": "run-123-attempt-2-r2a-public-cache",
                        "profileNonce": "0123456789abcdef",
                        "primeUrl": "https://cdn.rollout.internal.example.org/api/bff/api/public/clubs/rollout-synthetic-fixture/sessions/22222222-2222-4222-8222-222222222222",
                        "oldGenerationEtag": '"public-record-g1-r7"',
                        "primedAt": "2026-08-24T01:00:00Z",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            archive = root / "profile.tar"
            binding = self.helper.package_profile(
                profile,
                state,
                archive,
                "run-123-attempt-2-r2a-public-cache",
                _environment(),
                _ownership_identity(self.helper, _environment()),
            )
            self.assertRegex(binding["transportDigest"], r"^sha256:[0-9a-f]{64}$")
            extracted = self.helper.extract_profile(
                archive,
                root / "extracted",
                binding,
                _environment(),
            )
            self.assertEqual(extracted["profileIdentity"], "run-123-attempt-2-r2a-public-cache")
            self.assertTrue(Path(extracted["profilePath"]).is_absolute())
            self.assertTrue(Path(extracted["statePath"]).is_absolute())

            wrong = dict(binding)
            wrong["transportDigest"] = "sha256:" + "0" * 64
            with self.assertRaises(self.helper.CacheEvidenceError):
                self.helper.extract_profile(archive, root / "wrong", wrong, _environment())
            wrong = dict(binding)
            wrong["profileIdentity"] = "fresh-profile"
            with self.assertRaises(self.helper.CacheEvidenceError):
                self.helper.extract_profile(archive, root / "fresh", wrong, _environment())

    def test_tampered_hmac_metadata_and_content_are_rejected_before_destination_creation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            profile = root / "profile"
            cache = profile / "Default/Cache/Cache_Data"
            cache.mkdir(parents=True)
            (cache / "data_0").write_bytes(b"public synthetic cached response")
            (profile / ".readmates-public-cache-prime-0123456789abcdef").write_text(
                "run-123-attempt-2-r2a-public-cache\n",
                encoding="utf-8",
            )
            state = root / "state.json"
            state.write_text(
                json.dumps(
                    {
                        "schemaVersion": "readmates.public-cache.prime.v1",
                        "artifactId": "run-123-attempt-2-r2a-public-cache",
                        "profileNonce": "0123456789abcdef",
                        "primeUrl": "https://cdn.rollout.internal.example.org/api/bff/api/public/clubs/rollout-synthetic-fixture/sessions/22222222-2222-4222-8222-222222222222",
                        "oldGenerationEtag": '"public-record-g1-r7"',
                        "primedAt": "2026-08-24T01:00:00Z",
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            archive = root / "profile.tar"
            binding = self.helper.package_profile(
                profile,
                state,
                archive,
                "run-123-attempt-2-r2a-public-cache",
                _environment(),
                _ownership_identity(self.helper, _environment()),
            )
            tampered_binding = dict(binding)
            tampered_binding.pop("transportDigest")
            tampered_binding.pop("primedAt")
            tampered_binding.pop("oldGenerationEtag")
            tampered_binding["targetIdentity"] = "hmac-sha256:" + "0" * 64
            tampered = root / "tampered.tar"
            _rewrite_tar_member(
                archive,
                tampered,
                "binding.json",
                (json.dumps(tampered_binding, sort_keys=True, separators=(",", ":")) + "\n").encode(),
            )
            expected = dict(binding)
            expected["transportDigest"] = self.helper._checksum(tampered)
            destination = root / "must-not-exist"
            with self.assertRaises(self.helper.CacheEvidenceError):
                self.helper.extract_profile(tampered, destination, expected, _environment())
            self.assertFalse(destination.exists(), "untrusted archive bytes were written before binding verification")

    def test_profile_archive_rejects_cookie_token_symlink_and_unsafe_members(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state.json"
            state.write_text("{}\n", encoding="utf-8")
            for name, relative, content in (
                ("token content", "Default/Cache/Cache_Data/data_0", b"Authorization: Bearer abcdefghijklmnopqrstuvwxyz"),
            ):
                profile = root / name.replace(" ", "-")
                target = profile / relative
                target.parent.mkdir(parents=True)
                target.write_bytes(content)
                with self.subTest(name=name), self.assertRaises(self.helper.CacheEvidenceError):
                    self.helper.package_profile(profile, state, root / f"{name}.tar", "profile-identity-0001", _environment())

            for name, member_name, member_type in (
                ("traversal", "../escape", tarfile.REGTYPE),
                ("absolute", "/escape", tarfile.REGTYPE),
                ("symlink", "profile/link", tarfile.SYMTYPE),
                ("cookie", "profile/Default/Cookies", tarfile.REGTYPE),
            ):
                archive = root / f"unsafe-{name}.tar"
                with tarfile.open(archive, "w") as tar:
                    member = tarfile.TarInfo(member_name)
                    member.type = member_type
                    member.size = 1 if member_type == tarfile.REGTYPE else 0
                    member.linkname = "/etc/passwd" if member_type == tarfile.SYMTYPE else ""
                    tar.addfile(member, io.BytesIO(b"x") if member.size else None)
                with self.subTest(name=name), self.assertRaises(self.helper.CacheEvidenceError):
                    self.helper.inspect_archive(archive)

    def test_mutation_receipt_is_exactly_bound_and_noop_or_target_mismatch_fails(self) -> None:
        config = self.helper.validate_protected_config(_environment())
        valid = {
            "status": "COMMITTED",
            "receipt": {
                "operation": "SESSION_REVERSE",
                "resourceId": config.synthetic_session_id,
                "resultingVersions": {"sessionRevision": 8},
                "projection": {"state": "CLOSED", "siteVisibility": "PRIVATE"},
            },
        }
        self.helper.validate_mutation_receipt(valid, config)
        mutations = []
        for name, transform in (
            ("noop", lambda value: value.update(status="NOT_EXECUTED")),
            ("target", lambda value: value["receipt"].update(resourceId="33333333-3333-4333-8333-333333333333")),
            ("revision", lambda value: value["receipt"]["resultingVersions"].update(sessionRevision=7)),
            ("operation", lambda value: value["receipt"].update(operation="SESSION_OPEN")),
            ("state", lambda value: value["receipt"]["projection"].update(state="OPEN")),
        ):
            changed = json.loads(json.dumps(valid))
            transform(changed)
            mutations.append((name, changed))
        for name, changed in mutations:
            with self.subTest(name=name), self.assertRaises(self.helper.CacheEvidenceError):
                self.helper.validate_mutation_receipt(changed, config)


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(HostRolloutCacheEvidenceTests)
    )
    raise SystemExit(0 if result.wasSuccessful() else 1)
