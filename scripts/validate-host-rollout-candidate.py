#!/usr/bin/env python3
from __future__ import annotations

import argparse
import io
import pathlib
import stat
import sys
import tarfile
import tempfile
import unittest
from unittest import mock


MAX_ARCHIVE_BYTES = 100 * 1024 * 1024
MAX_MEMBERS = 20_000


class CandidateError(ValueError):
    pass


def validate_candidate(path: pathlib.Path) -> None:
    try:
        info = path.lstat()
    except OSError as error:
        raise CandidateError("candidate archive is unavailable") from error
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= MAX_ARCHIVE_BYTES:
        raise CandidateError("candidate archive must be a bounded regular non-symlink file")
    try:
        with tarfile.open(path, mode="r:") as bundle:
            members = bundle.getmembers()
    except (OSError, tarfile.TarError) as error:
        raise CandidateError("candidate archive is invalid") from error
    if not 1 <= len(members) <= MAX_MEMBERS:
        raise CandidateError("candidate archive member count is invalid")
    canonical_names: set[str] = set()
    roots: set[str] = set()
    total = 0
    for member in members:
        name = member.name
        pure = pathlib.PurePosixPath(name)
        if not name or "\\" in name or pure.is_absolute() or ".." in pure.parts:
            raise CandidateError("candidate archive contains an escaping path")
        if not pure.parts or pure.parts[0] not in {"dist", "functions"}:
            raise CandidateError("candidate archive contains an unexpected root")
        roots.add(pure.parts[0])
        canonical_name = "/".join(pure.parts)
        if canonical_name in canonical_names:
            raise CandidateError("candidate archive contains a duplicate path")
        canonical_names.add(canonical_name)
        if member.issym() or member.islnk() or member.isdev() or member.isfifo():
            raise CandidateError("candidate archive contains a link or special file")
        if not (member.isfile() or member.isdir()):
            raise CandidateError("candidate archive member type is unsupported")
        if stat.S_IMODE(member.mode) & 0o6000:
            raise CandidateError("candidate archive contains privileged mode bits")
        if member.isfile():
            total += member.size
            if member.size < 0 or total > MAX_ARCHIVE_BYTES:
                raise CandidateError("candidate archive payload is oversized")
    if roots != {"dist", "functions"}:
        raise CandidateError("candidate archive roots are incomplete")


def _write_fixture(path: pathlib.Path, evil: tarfile.TarInfo | None = None) -> None:
    with tarfile.open(path, mode="w:") as bundle:
        for directory in ("dist", "functions"):
            member = tarfile.TarInfo(f"{directory}/")
            member.type = tarfile.DIRTYPE
            member.mode = 0o755
            bundle.addfile(member)
            body = b"fixture\n"
            file_member = tarfile.TarInfo(f"{directory}/fixture.txt")
            file_member.size = len(body)
            file_member.mode = 0o644
            bundle.addfile(file_member, io.BytesIO(body))
        if evil is not None:
            bundle.addfile(evil)


class CandidateValidationTests(unittest.TestCase):
    def test_valid_regular_candidate_passes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "candidate.tar"
            _write_fixture(path)
            validate_candidate(path)

    def test_absolute_parent_link_device_and_fifo_members_fail_closed(self) -> None:
        cases = []
        for name in ("/absolute", "dist/../escape"):
            member = tarfile.TarInfo(name)
            member.type = tarfile.DIRTYPE
            cases.append((name, member))
        for label, member_type in (
            ("symlink", tarfile.SYMTYPE),
            ("hardlink", tarfile.LNKTYPE),
            ("device", tarfile.CHRTYPE),
            ("fifo", tarfile.FIFOTYPE),
        ):
            member = tarfile.TarInfo(f"dist/{label}")
            member.type = member_type
            member.linkname = "dist/fixture.txt"
            cases.append((label, member))
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for index, (label, member) in enumerate(cases):
                path = root / f"candidate-{index}.tar"
                _write_fixture(path, member)
                with self.subTest(label=label), self.assertRaises(CandidateError):
                    validate_candidate(path)

    def test_canonical_duplicates_unexpected_roots_and_oversized_archives_fail_closed(self) -> None:
        cases = []
        for name in ("dist/fixture.txt", "dist//fixture.txt", "dist/./fixture.txt"):
            member = tarfile.TarInfo(name)
            member.type = tarfile.REGTYPE
            cases.append((name, member))
        unexpected = tarfile.TarInfo("unexpected/file.txt")
        unexpected.type = tarfile.REGTYPE
        cases.append(("unexpected-root", unexpected))
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for index, (label, member) in enumerate(cases):
                path = root / f"candidate-{index}.tar"
                _write_fixture(path, member)
                with self.subTest(label=label), self.assertRaises(CandidateError):
                    validate_candidate(path)

            oversized = root / "oversized.tar"
            _write_fixture(oversized)
            with mock.patch.object(sys.modules[__name__], "MAX_ARCHIVE_BYTES", oversized.stat().st_size - 1):
                with self.assertRaises(CandidateError):
                    validate_candidate(oversized)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate a deterministic host rollout Pages candidate archive")
    parser.add_argument("--candidate", type=pathlib.Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        suite = unittest.defaultTestLoader.loadTestsFromTestCase(CandidateValidationTests)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if result.wasSuccessful() else 1
    if args.candidate is None:
        parser.error("--candidate is required outside self-test mode")
    try:
        validate_candidate(args.candidate)
    except CandidateError as error:
        print(f"Host rollout candidate rejected: {error}", file=sys.stderr)
        return 1
    print("Host rollout candidate archive passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
