#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import hmac
import ipaddress
import io
import json
import os
import re
import shutil
import ssl
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Mapping, NamedTuple
from urllib.parse import urljoin, urlsplit


MAX_CONFIG_VALUE = 2048
MAX_PROFILE_FILES = 4096
MAX_PROFILE_FILE_BYTES = 32 * 1024 * 1024
MAX_PROFILE_BYTES = 64 * 1024 * 1024
MAX_STATE_BYTES = 32 * 1024
MAX_HTTP_BYTES = 256 * 1024
HTTP_TIMEOUT_SECONDS = 20
ARCHIVE_SCHEMA = "readmates.host-rollout.public-cache-profile.v1"
SYNTHETIC_CLUB = re.compile(r"^/api/public/clubs/(rollout-synthetic-[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?)$")
UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"
SYNTHETIC_MARKER_VALUE = re.compile(rf"^readmates-rollout-synthetic-{UUID}$")
PROFILE_ID = re.compile(r"^run-[1-9][0-9]{0,19}-attempt-[1-9][0-9]{0,2}-r2a-public-cache$")
MARKER = re.compile(r"^\.readmates-public-cache-prime-[A-Za-z0-9_-]{16,128}$")
DIGEST = re.compile(r"^sha256:[0-9a-f]{64}$")
HMAC_ID = re.compile(r"^hmac-sha256:[0-9a-f]{64}$")
ETAG = re.compile(r'^"[ -!#-~]{1,254}"$')
FORBIDDEN_CONTENT = (
    b"authorization: bearer ",
    b"proxy-authorization:",
    b"set-cookie:",
    b"readmates_session=",
    b"access_token",
    b"refresh_token",
    b"client_secret",
)


class CacheEvidenceError(ValueError):
    pass


class ProtectedConfig(NamedTuple):
    origin_base_url: str
    bff_base_url: str
    cdn_base_url: str
    public_club_path: str
    public_session_path: str
    revoked_session_path: str
    synthetic_club_slug: str
    synthetic_club_id: str
    synthetic_session_id: str
    synthetic_marker_value: str
    expected_revision: int
    run_id: str
    run_attempt: int
    idempotency_key: str
    synthetic_marker_identity: str
    auth_cookie: str
    hmac_key: str


def _required(environment: Mapping[str, str], name: str, *, sensitive: bool = False) -> str:
    value = environment.get(name, "").strip()
    if not value or len(value.encode("utf-8")) > MAX_CONFIG_VALUE or "\x00" in value or "\r" in value or "\n" in value:
        label = "protected secret" if sensitive else name
        raise CacheEvidenceError(f"{label} is missing or invalid")
    return value


def _canonical_https_origin(value: str, name: str, *, require_global: bool) -> str:
    try:
        parsed = urlsplit(value)
    except ValueError as error:
        raise CacheEvidenceError(f"{name} is not a valid HTTPS boundary") from error
    if (
        parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise CacheEvidenceError(f"{name} must be an origin-only HTTPS URL")
    raw_hostname = parsed.hostname.rstrip(".")
    if not raw_hostname:
        raise CacheEvidenceError(f"{name} must have a bounded hostname")
    try:
        address = ipaddress.ip_address(raw_hostname)
    except ValueError:
        address = None
    if address is not None:
        if require_global and not address.is_global:
            raise CacheEvidenceError(f"{name} must not use a local or private IP address")
        hostname = f"[{address.compressed}]" if address.version == 6 else address.compressed
    else:
        try:
            hostname = raw_hostname.encode("idna").decode("ascii").lower()
        except UnicodeError as error:
            raise CacheEvidenceError(f"{name} hostname is not valid IDNA") from error
        labels = hostname.split(".")
        if (
            len(hostname) > 253
            or len(labels) < 2
            or any(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) is None for label in labels)
        ):
            raise CacheEvidenceError(f"{name} hostname is invalid")
        if require_global and (
            hostname == "localhost"
            or hostname.endswith((".localhost", ".local", ".test", ".invalid", ".example"))
        ):
            raise CacheEvidenceError(f"{name} is not an actual protected boundary")
    try:
        port = parsed.port
    except ValueError as error:
        raise CacheEvidenceError(f"{name} port is invalid") from error
    port_suffix = "" if port in (None, 443) else f":{port}"
    return f"https://{hostname}{port_suffix}"


def _https_origin(value: str, name: str) -> str:
    return _canonical_https_origin(value, name, require_global=True)


def _synthetic_paths(environment: Mapping[str, str]) -> tuple[str, str, str, str, str]:
    club = _required(environment, "READMATES_HOST_ROLLOUT_PUBLIC_CLUB_PATH")
    stable = _required(environment, "READMATES_HOST_ROLLOUT_PUBLIC_SESSION_PATH")
    revoked = _required(environment, "READMATES_HOST_ROLLOUT_REVOKED_SESSION_PATH")
    club_match = SYNTHETIC_CLUB.fullmatch(club)
    if club_match is None:
        raise CacheEvidenceError("public club path must use the reserved rollout-synthetic namespace")
    session_pattern = re.compile(rf"^{re.escape(club)}/sessions/({UUID})$")
    stable_match = session_pattern.fullmatch(stable)
    revoked_match = session_pattern.fullmatch(revoked)
    if stable_match is None or revoked_match is None or stable == revoked:
        raise CacheEvidenceError("synthetic session paths must be distinct UUID targets under the protected club")
    return club, stable, revoked, club_match.group(1), revoked_match.group(1)


def _expected_public_urls(config: ProtectedConfig) -> dict[str, str]:
    return {
        "originRevoked": f"{config.origin_base_url}{config.revoked_session_path}",
        "bffRevoked": f"{config.bff_base_url}/api/bff{config.revoked_session_path}",
        "cdnRevoked": f"{config.cdn_base_url}/api/bff{config.revoked_session_path}",
        "cdnClub": f"{config.cdn_base_url}/api/bff{config.public_club_path}",
        "cdnStableSession": f"{config.cdn_base_url}/api/bff{config.public_session_path}",
    }


def validate_protected_config(environment: Mapping[str, str] = os.environ) -> ProtectedConfig:
    if (
        environment.get("GITHUB_ACTIONS") != "true"
        or environment.get("READMATES_HOST_ROLLOUT_LIVE_EVIDENCE") != "protected"
        or environment.get("READMATES_HOST_ROLLOUT_REF_PROTECTED") != "true"
    ):
        raise CacheEvidenceError("cache evidence requires protected GitHub Actions authority")
    origins = [
        _https_origin(_required(environment, name), name)
        for name in (
            "READMATES_HOST_ROLLOUT_ORIGIN_BASE_URL",
            "READMATES_HOST_ROLLOUT_BFF_BASE_URL",
            "READMATES_HOST_ROLLOUT_CDN_BASE_URL",
        )
    ]
    if len(set(origins)) != 3:
        raise CacheEvidenceError("origin, BFF, and CDN boundaries must be distinct")
    club, stable, revoked, club_slug, session_id = _synthetic_paths(environment)
    club_id = _required(environment, "READMATES_HOST_ROLLOUT_SYNTHETIC_CLUB_ID")
    marker_value = _required(environment, "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_VALUE")
    if re.fullmatch(UUID, club_id) is None or SYNTHETIC_MARKER_VALUE.fullmatch(marker_value) is None:
        raise CacheEvidenceError("synthetic club or marker contract is invalid")
    revision_raw = _required(environment, "READMATES_HOST_ROLLOUT_SYNTHETIC_EXPECTED_REVISION")
    if re.fullmatch(r"[0-9]{1,18}", revision_raw) is None:
        raise CacheEvidenceError("synthetic expected revision is invalid")
    revision = int(revision_raw)
    run_id = _required(environment, "GITHUB_RUN_ID")
    run_attempt = _required(environment, "GITHUB_RUN_ATTEMPT")
    if (
        re.fullmatch(r"[1-9][0-9]{0,19}", run_id) is None
        or re.fullmatch(r"[1-9][0-9]{0,2}", run_attempt) is None
        or int(run_attempt) > 100
    ):
        raise CacheEvidenceError("protected run identity is invalid")
    key = f"rollout-r2a-run-{run_id}-attempt-{run_attempt}"
    if re.fullmatch(r"[A-Za-z0-9._-]{8,128}", key) is None:
        raise CacheEvidenceError("derived idempotency identifier is invalid")
    marker_identity = _required(environment, "READMATES_HOST_ROLLOUT_SYNTHETIC_MARKER_IDENTITY")
    if HMAC_ID.fullmatch(marker_identity) is None:
        raise CacheEvidenceError("synthetic ownership marker identity is invalid")
    cookie = _required(environment, "READMATES_HOST_ROLLOUT_SYNTHETIC_AUTH_COOKIE", sensitive=True)
    if re.fullmatch(r"readmates_session=[A-Za-z0-9._~+/=-]{16,1024}", cookie) is None:
        raise CacheEvidenceError("protected auth cookie contract is invalid")
    hmac_key = _required(environment, "READMATES_HOST_ROLLOUT_EVIDENCE_HMAC_KEY", sensitive=True)
    if len(hmac_key.encode("utf-8")) < 32:
        raise CacheEvidenceError("protected HMAC key is too short")
    expected_marker_identity = _hmac_identity(
        f"synthetic-owner\n{club_id}\n{club_slug}\n{session_id}\n{marker_value}\n",
        hmac_key,
    )
    if not hmac.compare_digest(marker_identity, expected_marker_identity):
        raise CacheEvidenceError("synthetic ownership marker identity is mismatched")
    return ProtectedConfig(
        origins[0],
        origins[1],
        origins[2],
        club,
        stable,
        revoked,
        club_slug,
        club_id,
        session_id,
        marker_value,
        revision,
        run_id,
        int(run_attempt),
        key,
        marker_identity,
        cookie,
        hmac_key,
    )


def _parse_timestamp(value: str, label: str) -> datetime:
    if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", value) is None:
        raise CacheEvidenceError(f"{label} is not a bounded UTC timestamp")
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise CacheEvidenceError(f"{label} is invalid") from error


def validate_time_window(
    prechange: datetime,
    policy: datetime,
    completed: datetime,
    *,
    now: datetime | None = None,
) -> None:
    current = now or datetime.now(timezone.utc)
    if any(value.tzinfo is None or value.utcoffset() != timedelta(0) for value in (prechange, policy, completed, current)):
        raise CacheEvidenceError("cache evidence timestamps must be UTC")
    if policy < prechange:
        raise CacheEvidenceError("policy deployment predates browser prime")
    if completed < max(prechange, policy) + timedelta(seconds=720):
        raise CacheEvidenceError("720-second cache lifetime was not completed")
    if completed > current + timedelta(seconds=5):
        raise CacheEvidenceError("cache wait completion is in the future")


def _checksum(path: Path) -> str:
    executable = shutil.which("sha256sum") or shutil.which("shasum")
    if executable is None:
        raise CacheEvidenceError("platform SHA-256 verifier is unavailable")
    command = [executable, str(path)] if Path(executable).name == "sha256sum" else [executable, "-a", "256", str(path)]
    try:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.SubprocessError) as error:
        raise CacheEvidenceError("platform SHA-256 verification failed") from error
    digest = result.stdout.split(maxsplit=1)[0].lower() if result.stdout else ""
    if re.fullmatch(r"[0-9a-f]{64}", digest) is None:
        raise CacheEvidenceError("platform SHA-256 output is invalid")
    return f"sha256:{digest}"


def _digest_bytes(payload: bytes, prefix: str = "sha256") -> str:
    with tempfile.NamedTemporaryFile(prefix="readmates-cache-binding-", delete=True) as fixture:
        fixture.write(payload)
        fixture.flush()
        digest = _checksum(Path(fixture.name)).split(":", 1)[1]
    return f"{prefix}:{digest}"


def _hmac_identity(payload: str, key: str) -> str:
    digest = hmac.new(key.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"hmac-sha256:{digest}"


def _identities(config: ProtectedConfig) -> tuple[str, dict[str, str]]:
    target = _hmac_identity(f"target\n{config.revoked_session_path}\n", config.hmac_key)
    boundaries = {
        "origin": _hmac_identity(f"origin\n{config.origin_base_url}\n", config.hmac_key),
        "bff": _hmac_identity(f"bff\n{config.bff_base_url}\n", config.hmac_key),
        "cdn": _hmac_identity(f"cdn\n{config.cdn_base_url}\n", config.hmac_key),
    }
    return target, boundaries


def _profile_files(profile: Path) -> list[tuple[str, Path]]:
    try:
        info = profile.lstat()
    except OSError as error:
        raise CacheEvidenceError("primed browser profile is unavailable") from error
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise CacheEvidenceError("primed browser profile must be a real directory")
    files: list[tuple[str, Path]] = []
    total = 0
    for path in sorted(profile.rglob("*"), key=lambda item: item.as_posix()):
        relative = path.relative_to(profile).as_posix()
        item = path.lstat()
        if stat.S_ISLNK(item.st_mode):
            raise CacheEvidenceError("browser profile contains a symlink")
        if stat.S_ISDIR(item.st_mode):
            continue
        if not stat.S_ISREG(item.st_mode):
            raise CacheEvidenceError("browser profile contains a special file")
        allowed = relative.startswith("Default/Cache/Cache_Data/") or MARKER.fullmatch(relative) is not None
        if not allowed:
            continue
        if item.st_size < 0 or item.st_size > MAX_PROFILE_FILE_BYTES:
            raise CacheEvidenceError("browser profile file exceeds the allowed size")
        total += item.st_size
        if total > MAX_PROFILE_BYTES or len(files) >= MAX_PROFILE_FILES:
            raise CacheEvidenceError("browser profile exceeds the bounded transport size")
        raw = path.read_bytes()
        lowered = raw.lower()
        if any(needle in lowered for needle in FORBIDDEN_CONTENT):
            raise CacheEvidenceError("browser profile contains cookie or token material")
        files.append((relative, path))
    if not files or sum(1 for relative, _ in files if MARKER.fullmatch(relative)) != 1:
        raise CacheEvidenceError("browser profile must contain exactly one C1 public-cache marker")
    if not any(relative.startswith("Default/Cache/Cache_Data/") for relative, _ in files):
        raise CacheEvidenceError("browser profile does not contain the primed public HTTP cache")
    return files


def _parse_state(raw: bytes, profile_identity: str, config: ProtectedConfig) -> dict[str, Any]:
    if not 1 <= len(raw) <= MAX_STATE_BYTES:
        raise CacheEvidenceError("primed browser state is not bounded")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CacheEvidenceError("primed browser state is invalid JSON") from error
    if not isinstance(value, dict) or set(value) != {
        "schemaVersion", "artifactId", "profileNonce", "primeUrl", "oldGenerationEtag", "primedAt"
    }:
        raise CacheEvidenceError("primed browser state fields do not match the C1 contract")
    if value["schemaVersion"] != "readmates.public-cache.prime.v1" or value["artifactId"] != profile_identity:
        raise CacheEvidenceError("primed browser state identity is mismatched")
    expected_url = _expected_public_urls(config)["cdnRevoked"]
    if value["primeUrl"] != expected_url or ETAG.fullmatch(str(value["oldGenerationEtag"])) is None:
        raise CacheEvidenceError("primed browser state target or validator is mismatched")
    _parse_timestamp(str(value["primedAt"]), "primedAt")
    marker = f".readmates-public-cache-prime-{value['profileNonce']}"
    if MARKER.fullmatch(marker) is None:
        raise CacheEvidenceError("primed browser profile nonce is invalid")
    return value


def _load_state(path: Path, profile_identity: str, config: ProtectedConfig) -> dict[str, Any]:
    try:
        info = path.lstat()
        raw = path.read_bytes()
    except OSError as error:
        raise CacheEvidenceError("primed browser state is unavailable") from error
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode):
        raise CacheEvidenceError("primed browser state must be a bounded regular file")
    return _parse_state(raw, profile_identity, config)


def _canonical_profile_payload_digest(files: list[tuple[str, bytes]]) -> str:
    with tempfile.NamedTemporaryFile(prefix="readmates-profile-payload-", delete=True) as fixture:
        for relative, raw in files:
            fixture.write(f"{relative}\0{len(raw)}\0".encode("utf-8"))
            fixture.write(raw)
            fixture.write(b"\0")
        fixture.flush()
        return _checksum(Path(fixture.name))


def _canonical_profile_digest(files: list[tuple[str, Path]]) -> str:
    return _canonical_profile_payload_digest([(relative, path.read_bytes()) for relative, path in files])


def _tar_info(name: str, size: int, *, directory: bool = False) -> tarfile.TarInfo:
    info = tarfile.TarInfo(name + ("/" if directory and not name.endswith("/") else ""))
    info.type = tarfile.DIRTYPE if directory else tarfile.REGTYPE
    info.mode = 0o700 if directory else 0o600
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    info.mtime = 0
    info.size = 0 if directory else size
    return info


def package_profile(
    profile: Path,
    state: Path,
    archive: Path,
    profile_identity: str,
    environment: Mapping[str, str] = os.environ,
    ownership_response_identity: str | None = None,
) -> dict[str, Any]:
    config = validate_protected_config(environment)
    expected_profile_identity = f"run-{config.run_id}-attempt-{config.run_attempt}-r2a-public-cache"
    if PROFILE_ID.fullmatch(profile_identity) is None or profile_identity != expected_profile_identity:
        raise CacheEvidenceError("profile identity is not bound to a protected run and attempt")
    if HMAC_ID.fullmatch(str(ownership_response_identity or "")) is None:
        raise CacheEvidenceError("synthetic ownership response identity is not trusted")
    files = _profile_files(profile)
    state_value = _load_state(state, profile_identity, config)
    marker = profile / f".readmates-public-cache-prime-{state_value['profileNonce']}"
    if marker.read_text(encoding="utf-8").strip() != profile_identity:
        raise CacheEvidenceError("primed profile marker is not bound to the state identity")
    state_digest = _checksum(state)
    profile_digest = _canonical_profile_digest(files)
    target_identity, boundaries = _identities(config)
    binding = {
        "schemaVersion": ARCHIVE_SCHEMA,
        "profileIdentity": profile_identity,
        "profileContentDigest": profile_digest,
        "stateDigest": state_digest,
        "targetIdentity": target_identity,
        "boundaryIdentities": boundaries,
        "syntheticMarkerIdentity": config.synthetic_marker_identity,
        "ownershipResponseIdentity": ownership_response_identity,
    }
    if archive.exists() or archive.is_symlink():
        raise CacheEvidenceError("profile archive output must be new")
    archive.parent.mkdir(parents=True, exist_ok=True)
    binding_raw = (json.dumps(binding, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    with tarfile.open(archive, "w", format=tarfile.USTAR_FORMAT) as output:
        for directory in ("profile", "state"):
            output.addfile(_tar_info(directory, 0, directory=True))
        for relative, path in files:
            name = f"profile/{relative}"
            raw = path.read_bytes()
            output.addfile(_tar_info(name, len(raw)), fileobj=io.BytesIO(raw))
        state_raw = state.read_bytes()
        output.addfile(_tar_info("state/primed-browser-state.json", len(state_raw)), fileobj=io.BytesIO(state_raw))
        output.addfile(_tar_info("binding.json", len(binding_raw)), fileobj=io.BytesIO(binding_raw))
    result = dict(binding)
    result["transportDigest"] = _checksum(archive)
    result["primedAt"] = state_value["primedAt"]
    result["oldGenerationEtag"] = state_value["oldGenerationEtag"]
    return result


def _canonical_member_name(name: str) -> str:
    pure = PurePosixPath(name)
    if not name or "\\" in name or pure.is_absolute() or ".." in pure.parts:
        raise CacheEvidenceError("profile archive contains an unsafe path")
    normalized = pure.as_posix().rstrip("/")
    if normalized in ("", "."):
        raise CacheEvidenceError("profile archive contains an empty path")
    return normalized


def _read_archive_bytes(archive: Path) -> bytes:
    try:
        info = archive.lstat()
    except OSError as error:
        raise CacheEvidenceError("profile archive is unavailable") from error
    maximum = MAX_PROFILE_BYTES + MAX_STATE_BYTES + 1024 * 1024
    if not stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode) or not 1 <= info.st_size <= maximum:
        raise CacheEvidenceError("profile archive is not a bounded regular file")
    if not hasattr(os, "O_NOFOLLOW"):
        raise CacheEvidenceError("platform cannot securely open the profile archive")
    try:
        descriptor = os.open(archive, os.O_RDONLY | os.O_NOFOLLOW)
        with os.fdopen(descriptor, "rb") as source:
            opened = os.fstat(source.fileno())
            if not stat.S_ISREG(opened.st_mode) or opened.st_dev != info.st_dev or opened.st_ino != info.st_ino:
                raise CacheEvidenceError("profile archive changed during secure open")
            raw = source.read(maximum + 1)
    except OSError as error:
        raise CacheEvidenceError("profile archive cannot be opened safely") from error
    if len(raw) != info.st_size or len(raw) > maximum:
        raise CacheEvidenceError("profile archive changed or exceeds its bounded size")
    return raw


def _inspect_archive_bytes(raw_archive: bytes) -> tuple[list[tarfile.TarInfo], dict[str, bytes]]:
    members: list[tarfile.TarInfo] = []
    payload: dict[str, bytes] = {}
    seen: set[str] = set()
    total = 0
    try:
        with tarfile.open(fileobj=io.BytesIO(raw_archive), mode="r:") as source:
            for member in source:
                canonical = _canonical_member_name(member.name)
                if canonical in seen:
                    raise CacheEvidenceError("profile archive contains an equivalent duplicate member")
                seen.add(canonical)
                if not (member.isdir() or member.isreg()) or member.issym() or member.islnk() or member.isdev() or member.isfifo():
                    raise CacheEvidenceError("profile archive contains a link or special member")
                if member.size < 0 or member.size > MAX_PROFILE_FILE_BYTES:
                    raise CacheEvidenceError("profile archive member exceeds the size limit")
                total += member.size
                if total > MAX_PROFILE_BYTES + MAX_STATE_BYTES or len(members) >= MAX_PROFILE_FILES + 16:
                    raise CacheEvidenceError("profile archive exceeds the bounded transport contract")
                allowed = (
                    canonical in {"profile", "state", "state/primed-browser-state.json", "binding.json"}
                    or canonical.startswith("profile/Default/Cache/Cache_Data/")
                    or re.fullmatch(r"profile/\.readmates-public-cache-prime-[A-Za-z0-9_-]{16,128}", canonical) is not None
                )
                if not allowed:
                    raise CacheEvidenceError("profile archive contains an unexpected member")
                members.append(member)
                if member.isreg():
                    stream = source.extractfile(member)
                    if stream is None:
                        raise CacheEvidenceError("profile archive regular member cannot be read")
                    member_payload = stream.read(MAX_PROFILE_FILE_BYTES + 1)
                    if len(member_payload) != member.size:
                        raise CacheEvidenceError("profile archive member size is inconsistent")
                    payload[canonical] = member_payload
    except (OSError, tarfile.TarError) as error:
        raise CacheEvidenceError("profile archive cannot be parsed safely") from error
    required = {"profile", "state", "state/primed-browser-state.json", "binding.json"}
    if not required.issubset(seen):
        raise CacheEvidenceError("profile archive is incomplete")
    return members, payload


def inspect_archive(archive: Path) -> list[tarfile.TarInfo]:
    members, _ = _inspect_archive_bytes(_read_archive_bytes(archive))
    return members


def _validated_archive_payload(
    raw_archive: bytes,
    expected: Mapping[str, Any],
    config: ProtectedConfig,
) -> tuple[list[tarfile.TarInfo], dict[str, bytes], dict[str, Any], dict[str, Any]]:
    members, payload = _inspect_archive_bytes(raw_archive)
    required_expected = {
        "profileIdentity",
        "transportDigest",
        "profileContentDigest",
        "stateDigest",
        "targetIdentity",
        "boundaryIdentities",
        "syntheticMarkerIdentity",
        "ownershipResponseIdentity",
    }
    if not required_expected.issubset(expected):
        raise CacheEvidenceError("trusted profile transport bindings are incomplete")
    protected_profile_identity = f"run-{config.run_id}-attempt-{config.run_attempt}-r2a-public-cache"
    if expected.get("profileIdentity") != protected_profile_identity:
        raise CacheEvidenceError("trusted profile identity is not bound to the protected run")
    boundary_identities = expected.get("boundaryIdentities")
    if (
        PROFILE_ID.fullmatch(str(expected.get("profileIdentity", ""))) is None
        or any(DIGEST.fullmatch(str(expected.get(key, ""))) is None for key in ("transportDigest", "profileContentDigest", "stateDigest"))
        or HMAC_ID.fullmatch(str(expected.get("targetIdentity", ""))) is None
        or HMAC_ID.fullmatch(str(expected.get("syntheticMarkerIdentity", ""))) is None
        or HMAC_ID.fullmatch(str(expected.get("ownershipResponseIdentity", ""))) is None
        or not isinstance(boundary_identities, dict)
        or set(boundary_identities) != {"origin", "bff", "cdn"}
        or any(HMAC_ID.fullmatch(str(value)) is None for value in boundary_identities.values())
        or len(set(boundary_identities.values())) != 3
    ):
        raise CacheEvidenceError("trusted profile transport binding format is invalid")
    try:
        binding = json.loads(payload["binding.json"].decode("utf-8"))
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CacheEvidenceError("profile binding metadata is invalid") from error
    binding_fields = {
        "schemaVersion",
        "profileIdentity",
        "profileContentDigest",
        "stateDigest",
        "targetIdentity",
        "boundaryIdentities",
        "syntheticMarkerIdentity",
        "ownershipResponseIdentity",
    }
    if not isinstance(binding, dict) or set(binding) != binding_fields or binding.get("schemaVersion") != ARCHIVE_SCHEMA:
        raise CacheEvidenceError("profile binding metadata fields are invalid")
    for key in binding_fields - {"schemaVersion"}:
        if binding.get(key) != expected.get(key):
            raise CacheEvidenceError("profile binding metadata does not match trusted job outputs")
    target_identity, boundaries = _identities(config)
    if (
        binding["targetIdentity"] != target_identity
        or binding["boundaryIdentities"] != boundaries
        or binding["syntheticMarkerIdentity"] != config.synthetic_marker_identity
    ):
        raise CacheEvidenceError("profile target, boundary, or ownership identity is mismatched")
    state_raw = payload.get("state/primed-browser-state.json", b"")
    if _digest_bytes(state_raw) != binding["stateDigest"]:
        raise CacheEvidenceError("profile state digest is mismatched")
    state_value = _parse_state(state_raw, binding["profileIdentity"], config)
    profile_payloads: list[tuple[str, bytes]] = []
    for name, raw in sorted(payload.items()):
        if not name.startswith("profile/"):
            continue
        relative = name.removeprefix("profile/")
        if any(needle in raw.lower() for needle in FORBIDDEN_CONTENT):
            raise CacheEvidenceError("browser profile contains cookie or token material")
        profile_payloads.append((relative, raw))
    markers = [(name, raw) for name, raw in profile_payloads if MARKER.fullmatch(name)]
    if len(markers) != 1 or not any(name.startswith("Default/Cache/Cache_Data/") for name, _ in profile_payloads):
        raise CacheEvidenceError("profile archive does not contain the exact public cache and marker")
    expected_marker = f".readmates-public-cache-prime-{state_value['profileNonce']}"
    try:
        marker_value = markers[0][1].decode("utf-8", errors="strict").strip()
    except UnicodeDecodeError as error:
        raise CacheEvidenceError("profile archive marker is not valid UTF-8") from error
    if markers[0][0] != expected_marker or marker_value != binding["profileIdentity"]:
        raise CacheEvidenceError("profile archive marker is not bound to the carried state")
    if _canonical_profile_payload_digest(profile_payloads) != binding["profileContentDigest"]:
        raise CacheEvidenceError("profile content digest is mismatched")
    return members, payload, binding, state_value


def extract_profile(
    archive: Path,
    destination: Path,
    expected: Mapping[str, Any],
    environment: Mapping[str, str] = os.environ,
) -> dict[str, str]:
    config = validate_protected_config(environment)
    raw_archive = _read_archive_bytes(archive)
    if not DIGEST.fullmatch(str(expected.get("transportDigest", ""))) or _digest_bytes(raw_archive) != expected["transportDigest"]:
        raise CacheEvidenceError("profile transport digest is mismatched")
    if destination.exists() or destination.is_symlink():
        raise CacheEvidenceError("profile extraction destination must be new")
    members, payload, binding, state_value = _validated_archive_payload(raw_archive, expected, config)
    destination.mkdir(parents=True, mode=0o700)
    try:
        for member in members:
            relative = _canonical_member_name(member.name)
            target = destination / relative
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o700)
                continue
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with target.open("xb") as output:
                output.write(payload[relative])
            target.chmod(0o600)
    except (OSError, tarfile.TarError) as error:
        raise CacheEvidenceError("profile archive extraction failed") from error
    profile = destination / "profile"
    state = destination / "state/primed-browser-state.json"
    return {
        "profileIdentity": binding["profileIdentity"],
        "profilePath": str(profile.resolve()),
        "statePath": str(state.resolve()),
        "oldGenerationEtag": state_value["oldGenerationEtag"],
    }


def validate_mutation_receipt(value: Any, config: ProtectedConfig) -> None:
    if not isinstance(value, dict) or value.get("status") != "COMMITTED" or not isinstance(value.get("receipt"), dict):
        raise CacheEvidenceError("synthetic mutation did not produce a committed receipt")
    receipt = value["receipt"]
    versions = receipt.get("resultingVersions")
    projection = receipt.get("projection")
    if (
        receipt.get("operation") != "SESSION_REVERSE"
        or receipt.get("resourceId") != config.synthetic_session_id
        or not isinstance(versions, dict)
        or versions.get("sessionRevision") != config.expected_revision + 1
        or not isinstance(projection, dict)
        or projection.get("state") != "CLOSED"
        or projection.get("siteVisibility") != "PRIVATE"
    ):
        raise CacheEvidenceError("synthetic mutation receipt is not bound to the exact revoke transition")


def _bounded_json_response(response: Any, label: str) -> Any:
    raw = response.read(MAX_HTTP_BYTES + 1)
    if not 1 <= len(raw) <= MAX_HTTP_BYTES:
        raise CacheEvidenceError(f"{label} response is empty or oversized")
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CacheEvidenceError(f"{label} response is not valid JSON") from error


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        _request: urllib.request.Request,
        _file_pointer: Any,
        _code: int,
        _message: str,
        _headers: Any,
        _new_url: str,
    ) -> None:
        return None


def _no_redirect_opener(*, ssl_context: ssl.SSLContext | None = None) -> urllib.request.OpenerDirector:
    handlers: list[Any] = [_NoRedirect()]
    if ssl_context is not None:
        handlers.append(urllib.request.HTTPSHandler(context=ssl_context))
    return urllib.request.build_opener(*handlers)


def _request_origin(url: str) -> str:
    try:
        parsed = urlsplit(url)
    except ValueError as error:
        raise CacheEvidenceError("privileged request URL is invalid") from error
    return _canonical_https_origin(f"{parsed.scheme}://{parsed.netloc}", "privileged request", require_global=False)


def _open_privileged(
    request: urllib.request.Request,
    label: str,
    expected_origin: str,
    *,
    opener: urllib.request.OpenerDirector | None = None,
) -> Any:
    canonical_expected = _canonical_https_origin(expected_origin, "privileged BFF", require_global=False)
    if _request_origin(request.full_url) != canonical_expected or not request.full_url.startswith(canonical_expected + "/"):
        raise CacheEvidenceError(f"{label} request escaped the exact BFF origin")
    selected = opener or _no_redirect_opener()
    try:
        response = selected.open(request, timeout=HTTP_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as error:
        if 300 <= error.code < 400:
            raise CacheEvidenceError(f"{label} rejected an HTTP redirect") from error
        raise CacheEvidenceError(f"{label} request failed") from error
    except (OSError, urllib.error.URLError) as error:
        raise CacheEvidenceError(f"{label} request failed") from error
    if 300 <= response.status < 400 or response.geturl() != request.full_url:
        response.close()
        raise CacheEvidenceError(f"{label} response URL is not exact")
    return response


def _open_public_exact(
    request: urllib.request.Request,
    label: str,
    expected_url: str,
    *,
    opener: urllib.request.OpenerDirector | None = None,
) -> Any:
    if (
        request.full_url != expected_url
        or _request_origin(request.full_url) != _request_origin(expected_url)
        or request.has_header("Cookie")
        or request.has_header("Authorization")
    ):
        raise CacheEvidenceError(f"{label} request is not the exact unauthenticated public URL")
    selected = opener or _no_redirect_opener()
    try:
        response = selected.open(request, timeout=HTTP_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as error:
        if 300 <= error.code < 400:
            raise CacheEvidenceError(f"{label} rejected an HTTP redirect") from error
        raise CacheEvidenceError(f"{label} request failed") from error
    except (OSError, urllib.error.URLError) as error:
        raise CacheEvidenceError(f"{label} request failed") from error
    if 300 <= response.status < 400 or response.geturl() != expected_url:
        response.close()
        raise CacheEvidenceError(f"{label} response URL is not exact")
    return response


def validate_synthetic_ownership(club_value: Any, detail_value: Any, config: ProtectedConfig) -> str:
    club_fields = {"schema", "generatedAt", "club", "readiness", "sessionProgress", "aiUsage"}
    club_identity_fields = {"clubId", "slug", "name"}
    if (
        not isinstance(club_value, dict)
        or set(club_value) != club_fields
        or club_value.get("schema") != "host.club_operations_snapshot.v1"
        or not isinstance(club_value.get("generatedAt"), str)
        or len(club_value["generatedAt"]) > 64
        or not all(isinstance(club_value.get(field), dict) for field in ("readiness", "sessionProgress", "aiUsage"))
        or not isinstance(club_value.get("club"), dict)
        or set(club_value["club"]) != club_identity_fields
    ):
        raise CacheEvidenceError("synthetic host club context response is invalid")
    try:
        generated_at = datetime.fromisoformat(club_value["generatedAt"].replace("Z", "+00:00"))
    except ValueError as error:
        raise CacheEvidenceError("synthetic host club context timestamp is invalid") from error
    if generated_at.tzinfo is None:
        raise CacheEvidenceError("synthetic host club context timestamp is invalid")
    club = club_value["club"]
    if (
        club["clubId"] != config.synthetic_club_id
        or club["slug"] != config.synthetic_club_slug
        or club["name"] != config.synthetic_marker_value
    ):
        raise CacheEvidenceError("synthetic target is outside the protected host club context")

    detail_fields = {
        "sessionId",
        "sessionNumber",
        "title",
        "bookTitle",
        "bookAuthor",
        "bookLink",
        "bookImageUrl",
        "date",
        "startTime",
        "endTime",
        "questionDeadlineAt",
        "locationLabel",
        "meetingUrl",
        "meetingPasscode",
        "publication",
        "state",
        "attendees",
        "feedbackDocument",
        "visibility",
        "accessScope",
        "siteVisibility",
        "changeReceipt",
    }
    if not isinstance(detail_value, dict) or set(detail_value) != detail_fields:
        raise CacheEvidenceError("synthetic host session detail response fields are invalid")
    publication = detail_value.get("publication")
    feedback = detail_value.get("feedbackDocument")
    if (
        not isinstance(publication, dict)
        or set(publication) != {"publicSummary", "visibility", "siteVisibility"}
        or not isinstance(feedback, dict)
        or set(feedback) != {"uploaded", "fileName", "uploadedAt"}
    ):
        raise CacheEvidenceError("synthetic target publication or feedback contract is invalid")
    marker_fields = (
        detail_value.get("title"),
        detail_value.get("bookTitle"),
        detail_value.get("bookAuthor"),
        detail_value.get("locationLabel"),
        publication.get("publicSummary"),
    )
    if (
        detail_value.get("sessionId") != config.synthetic_session_id
        or not isinstance(detail_value.get("sessionNumber"), int)
        or isinstance(detail_value.get("sessionNumber"), bool)
        or not 1 <= detail_value["sessionNumber"] <= 999999999
        or any(value != config.synthetic_marker_value for value in marker_fields)
        or detail_value.get("bookLink") is not None
        or detail_value.get("bookImageUrl") is not None
        or detail_value.get("meetingUrl") is not None
        or detail_value.get("meetingPasscode") is not None
        or detail_value.get("changeReceipt") is not None
        or detail_value.get("attendees") != []
        or feedback != {"uploaded": False, "fileName": None, "uploadedAt": None}
        or detail_value.get("state") != "PUBLISHED"
        or detail_value.get("visibility") != "PUBLIC"
        or detail_value.get("accessScope") != "GUEST_READABLE"
        or detail_value.get("siteVisibility") != "PUBLIC_RECORD"
        or publication.get("visibility") != "PUBLIC"
        or publication.get("siteVisibility") != "PUBLIC_RECORD"
        or re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", str(detail_value.get("date", ""))) is None
        or re.fullmatch(r"[0-9]{2}:[0-9]{2}(?::[0-9]{2})?", str(detail_value.get("startTime", ""))) is None
        or re.fullmatch(r"[0-9]{2}:[0-9]{2}(?::[0-9]{2})?", str(detail_value.get("endTime", ""))) is None
        or not isinstance(detail_value.get("questionDeadlineAt"), str)
        or len(detail_value["questionDeadlineAt"]) > 64
    ):
        raise CacheEvidenceError("synthetic target is not the exact public-only content-free fixture")
    try:
        deadline = datetime.fromisoformat(detail_value["questionDeadlineAt"].replace("Z", "+00:00"))
    except ValueError as error:
        raise CacheEvidenceError("synthetic target deadline is invalid") from error
    if deadline.tzinfo is None:
        raise CacheEvidenceError("synthetic target deadline is invalid")

    normalized = {
        "club": {"clubId": club["clubId"], "slug": club["slug"], "name": club["name"]},
        "session": detail_value,
        "paths": {
            "club": config.public_club_path,
            "stableSession": config.public_session_path,
            "revokedSession": config.revoked_session_path,
        },
    }
    payload = json.dumps(normalized, sort_keys=True, separators=(",", ":"))
    return _hmac_identity(f"synthetic-ownership-response\n{payload}\n", config.hmac_key)


def verify_synthetic_ownership(config: ProtectedConfig) -> str:
    club_url = f"{config.bff_base_url}/api/bff/api/host/club-operations"
    club_request = urllib.request.Request(club_url, method="GET", headers={"Cookie": config.auth_cookie})
    with _open_privileged(club_request, "synthetic host club context", config.bff_base_url) as response:
        if response.status != 200:
            raise CacheEvidenceError("synthetic host club context did not return the exact success status")
        club_value = _bounded_json_response(response, "synthetic host club context")
    detail_url = f"{config.bff_base_url}/api/bff/api/host/sessions/{config.synthetic_session_id}"
    detail_request = urllib.request.Request(detail_url, method="GET", headers={"Cookie": config.auth_cookie})
    with _open_privileged(detail_request, "synthetic host session detail", config.bff_base_url) as response:
        if response.status != 200:
            raise CacheEvidenceError("synthetic host session detail did not return the exact success status")
        detail_value = _bounded_json_response(response, "synthetic host session detail")
    return validate_synthetic_ownership(club_value, detail_value, config)


def probe_prechange(config: ProtectedConfig) -> tuple[str, str]:
    ownership_response_identity = verify_synthetic_ownership(config)
    expected_urls = _expected_public_urls(config)
    etag = ""
    for label, expected_url in (
        ("origin", expected_urls["originRevoked"]),
        ("bff", expected_urls["bffRevoked"]),
        ("cdn", expected_urls["cdnRevoked"]),
    ):
        request = urllib.request.Request(expected_url, method="GET")
        with _open_public_exact(request, f"prechange {label}", expected_url) as response:
            if response.status != 200:
                raise CacheEvidenceError("synthetic target is not readable at every prechange boundary")
            if label == "cdn":
                etag = response.headers.get("ETag", "")
                cache_control = response.headers.get("Cache-Control", "").lower()
                if ETAG.fullmatch(etag) is None or "max-age=120" not in cache_control or "stale-while-revalidate=600" not in cache_control:
                    raise CacheEvidenceError("prechange CDN target does not expose the exact old cache policy")
    return etag, ownership_response_identity


def mutate_synthetic_target(config: ProtectedConfig) -> str:
    verify_synthetic_ownership(config)
    url = urljoin(config.bff_base_url + "/", f"api/bff/api/host/sessions/{config.synthetic_session_id}/unpublish")
    body = json.dumps(
        {
            "idempotencyKey": config.idempotency_key,
            "expected": {"sessionRevision": config.expected_revision},
            "command": {"reasonCode": "CONTENT_CORRECTION", "reasonNote": "protected synthetic rollout evidence"},
        },
        separators=(",", ":"),
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Cookie": config.auth_cookie,
            "Origin": config.bff_base_url,
            "Referer": config.bff_base_url + "/",
            "X-Readmates-Client-Contract": "v3",
        },
    )
    with _open_privileged(request, "synthetic revoke", config.bff_base_url) as response:
        if response.status != 200:
            raise CacheEvidenceError("synthetic revoke did not return the exact success status")
        transition = _bounded_json_response(response, "synthetic revoke")
    if not isinstance(transition, dict) or transition.get("sessionId") != config.synthetic_session_id or transition.get("state") != "CLOSED":
        raise CacheEvidenceError("synthetic revoke response is not bound to the target transition")
    reconciliation_url = urljoin(
        config.bff_base_url + "/",
        f"api/bff/api/host/mutations/SESSION_REVERSE/{config.synthetic_session_id}/{config.idempotency_key}",
    )
    reconciliation_request = urllib.request.Request(
        reconciliation_url,
        method="GET",
        headers={"Cookie": config.auth_cookie},
    )
    with _open_privileged(
        reconciliation_request,
        "synthetic revoke reconciliation",
        config.bff_base_url,
    ) as response:
        if response.status != 200:
            raise CacheEvidenceError("synthetic revoke reconciliation did not return the exact success status")
        value = _bounded_json_response(response, "synthetic revoke reconciliation")
    validate_mutation_receipt(value, config)
    sanitized = {
        "status": value["status"],
        "operation": value["receipt"]["operation"],
        "resultingRevision": value["receipt"]["resultingVersions"]["sessionRevision"],
        "state": value["receipt"]["projection"]["state"],
        "siteVisibility": value["receipt"]["projection"]["siteVisibility"],
        "targetIdentity": _identities(config)[0],
    }
    return _digest_bytes((json.dumps(sanitized, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8"))


def _append_outputs(path: Path, values: Mapping[str, str]) -> None:
    if not path.is_absolute() or not path.exists() or path.is_symlink():
        raise CacheEvidenceError("GitHub output file is unavailable")
    with path.open("a", encoding="utf-8") as output:
        for key, value in values.items():
            if "\n" in value or "\r" in value:
                raise CacheEvidenceError("GitHub output value is invalid")
            output.write(f"{key}={value}\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Transport protected C1 browser-cache evidence without private state leakage")
    sub = parser.add_subparsers(dest="mode", required=True)
    validate = sub.add_parser("validate-config")
    validate.add_argument("--probe", action="store_true")
    validate.add_argument("--github-output", type=Path, required=True)
    package = sub.add_parser("package-profile")
    package.add_argument("--profile", type=Path, required=True)
    package.add_argument("--state", type=Path, required=True)
    package.add_argument("--archive", type=Path, required=True)
    package.add_argument("--profile-identity", required=True)
    package.add_argument("--ownership-response-identity", required=True)
    package.add_argument("--github-output", type=Path, required=True)
    extract = sub.add_parser("extract-profile")
    extract.add_argument("--archive", type=Path, required=True)
    extract.add_argument("--destination", type=Path, required=True)
    extract.add_argument("--profile-identity", required=True)
    extract.add_argument("--transport-digest", required=True)
    extract.add_argument("--profile-content-digest", required=True)
    extract.add_argument("--state-digest", required=True)
    extract.add_argument("--target-identity", required=True)
    extract.add_argument("--boundary-identities", required=True)
    extract.add_argument("--synthetic-marker-identity", required=True)
    extract.add_argument("--ownership-response-identity", required=True)
    extract.add_argument("--old-generation-etag", required=True)
    extract.add_argument("--transport-artifact-id", required=True)
    extract.add_argument("--github-output", type=Path, required=True)
    mutate = sub.add_parser("mutate-synthetic-target")
    mutate.add_argument("--github-output", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        config = validate_protected_config()
        if args.mode == "validate-config":
            target, boundaries = _identities(config)
            outputs = {
                "target-identity": target,
                "boundary-identities": json.dumps(boundaries, sort_keys=True, separators=(",", ":")),
                "synthetic-marker-identity": config.synthetic_marker_identity,
            }
            expected_urls = _expected_public_urls(config)
            outputs.update(
                {
                    "expected-origin-revoked-url": expected_urls["originRevoked"],
                    "expected-bff-revoked-url": expected_urls["bffRevoked"],
                    "expected-cdn-revoked-url": expected_urls["cdnRevoked"],
                    "expected-cdn-club-url": expected_urls["cdnClub"],
                    "expected-cdn-stable-session-url": expected_urls["cdnStableSession"],
                }
            )
            if args.probe:
                old_generation_etag, ownership_response_identity = probe_prechange(config)
                outputs["old-generation-etag"] = old_generation_etag
                outputs["ownership-response-identity"] = ownership_response_identity
            _append_outputs(args.github_output, outputs)
        elif args.mode == "package-profile":
            actual_ownership_identity = verify_synthetic_ownership(config)
            if not hmac.compare_digest(actual_ownership_identity, args.ownership_response_identity):
                raise CacheEvidenceError("synthetic ownership changed after browser prime")
            binding = package_profile(
                args.profile,
                args.state,
                args.archive,
                args.profile_identity,
                ownership_response_identity=actual_ownership_identity,
            )
            _append_outputs(
                args.github_output,
                {
                    "profile-identity": binding["profileIdentity"],
                    "profile-transport-digest": binding["transportDigest"],
                    "profile-content-digest": binding["profileContentDigest"],
                    "profile-state-digest": binding["stateDigest"],
                    "target-identity": binding["targetIdentity"],
                    "boundary-identities": json.dumps(binding["boundaryIdentities"], sort_keys=True, separators=(",", ":")),
                    "synthetic-marker-identity": binding["syntheticMarkerIdentity"],
                    "ownership-response-identity": binding["ownershipResponseIdentity"],
                    "pre-change-cached-at": binding["primedAt"],
                    "old-generation-etag": binding["oldGenerationEtag"],
                },
            )
        elif args.mode == "extract-profile":
            if re.fullmatch(r"[1-9][0-9]{0,19}", args.transport_artifact_id) is None:
                raise CacheEvidenceError("transport artifact ID is invalid")
            try:
                boundary_identities = json.loads(args.boundary_identities)
            except json.JSONDecodeError as error:
                raise CacheEvidenceError("boundary identity binding is invalid") from error
            expected = {
                "profileIdentity": args.profile_identity,
                "transportDigest": args.transport_digest,
                "profileContentDigest": args.profile_content_digest,
                "stateDigest": args.state_digest,
                "targetIdentity": args.target_identity,
                "boundaryIdentities": boundary_identities,
                "syntheticMarkerIdentity": args.synthetic_marker_identity,
                "ownershipResponseIdentity": args.ownership_response_identity,
            }
            result = extract_profile(args.archive, args.destination, expected)
            if result["oldGenerationEtag"] != args.old_generation_etag:
                raise CacheEvidenceError("old generation validator is mismatched")
            _append_outputs(
                args.github_output,
                {
                    "profile-path": result["profilePath"],
                    "state-path": result["statePath"],
                    "profile-identity": result["profileIdentity"],
                    "old-generation-etag": result["oldGenerationEtag"],
                    "transport-artifact-id": args.transport_artifact_id,
                },
            )
        else:
            _append_outputs(args.github_output, {"mutation-receipt-digest": mutate_synthetic_target(config)})
    except CacheEvidenceError as error:
        print(f"Host rollout cache evidence failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
