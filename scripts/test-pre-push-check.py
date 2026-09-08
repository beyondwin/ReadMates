#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PrePushReleaseRoutingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="readmates-pre-push-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "scripts").mkdir()
        shutil.copy2(ROOT / "scripts/pre-push-check.sh", self.root / "scripts/pre-push-check.sh")
        (self.root / "package.json").write_text(json.dumps({"packageManager": "pnpm@11.13.1"}))
        self.git("init", "-q")
        self.git("add", ".")
        self.git("commit", "-qm", "fixture base")
        self.base = self.git("rev-parse", "HEAD").strip()

    def git(self, *arguments: str) -> str:
        return subprocess.check_output(
            ["git", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
             "-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", *arguments],
            cwd=self.root, env=self.fixture_env(), text=True, stderr=subprocess.STDOUT,
        )

    def stage(self, name: str) -> None:
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("fixture\n")
        self.git("add", name)

    def fixture_env(self) -> dict[str, str]:
        # A hook may export Git paths for the calling repository.
        return {key: value for key, value in os.environ.items()
                if not key.startswith(("GIT_", "READMATES_PRE_PUSH_"))}

    def dry_run(self) -> str:
        env = self.fixture_env()
        env["READMATES_PRE_PUSH_BASE"] = self.base
        return subprocess.check_output(
            ["bash", "scripts/pre-push-check.sh", "--dry-run"],
            cwd=self.root, env=env, text=True, stderr=subprocess.STDOUT,
        )

    def test_large_committed_change_list_keeps_public_release_gate(self) -> None:
        self.stage("docs/guide.md")
        generated = self.root / "front/generated"
        generated.mkdir(parents=True)
        for number in range(3000):
            (generated / f"{number:04d}-{'x' * 100}.ts").write_text("fixture\n")
        self.git("add", "front")
        self.git("commit", "-qm", "large fixture change")
        output = self.dry_run()
        self.assertIn("==> Run public release check", output)
        self.assertNotIn("Public release check skipped", output)

    def test_staged_document_selects_public_release_gate(self) -> None:
        self.stage("docs/guide.md")
        self.assertIn("==> Run public release check", self.dry_run())

    def test_frontend_only_change_does_not_select_public_release_gate(self) -> None:
        self.stage("front/example.ts")
        self.assertIn("No release-sensitive paths changed", self.dry_run())


if __name__ == "__main__":
    unittest.main()
