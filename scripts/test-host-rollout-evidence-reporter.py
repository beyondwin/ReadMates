#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import stat
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
REPORTER_PATH = REPO_ROOT / "scripts/host-rollout-evidence-reporter.py"


def _load_reporter() -> Any:
    spec = importlib.util.spec_from_file_location("readmates_host_rollout_reporter", REPORTER_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("host rollout reporter module is unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class HostRolloutEvidenceReporterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reporter = _load_reporter()
        self.config = {
            "schemaVersion": "readmates.host-rollout.test-contract.v1",
            "groups": {
                "compatibility": {
                    "commands": [
                        {
                            "id": "real-suite",
                            "argv": ["corepack", "pnpm", "--dir", "front", "test"],
                            "timeoutSeconds": 60,
                            "requiredPaths": ["front/package.json"],
                            "cases": ["case-a", "case-b"],
                        }
                    ]
                }
            },
        }

    def test_contract_rejects_noop_empty_skipped_and_missing_prerequisites(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "front").mkdir()
            (root / "front/package.json").write_text("{}\n", encoding="utf-8")
            self.reporter.validate_contract(self.config, root, require_paths=True)

            mutations = []
            value = json.loads(json.dumps(self.config))
            value["groups"]["compatibility"]["commands"][0]["argv"] = ["true"]
            mutations.append(("noop", value))
            value = json.loads(json.dumps(self.config))
            value["groups"]["compatibility"]["commands"][0]["requiredPaths"] = []
            mutations.append(("empty spec", value))
            value = json.loads(json.dumps(self.config))
            value["groups"]["compatibility"]["commands"][0]["argv"].append("--skip")
            mutations.append(("skipped suite", value))
            value = json.loads(json.dumps(self.config))
            value["groups"]["compatibility"]["commands"][0]["requiredPaths"] = ["front/missing.spec.ts"]
            mutations.append(("missing prerequisite", value))
            for name, mutation in mutations:
                with self.subTest(name=name), self.assertRaises(self.reporter.ReporterError):
                    self.reporter.validate_contract(mutation, root, require_paths=True)

    def test_default_contract_uses_the_real_bff_path_in_artifact_and_live_modes(self) -> None:
        config = self.reporter.load_config()
        deploy_command = next(
            command
            for command in config["groups"]["cache-safety"]["commands"]
            if command["id"] == "deploy-r2a-cache-policy"
        )
        actual_path = "front/functions/api/bff/[[path]].ts"
        self.assertIn(actual_path, deploy_command["requiredPaths"])
        self.assertNotIn("front/functions/api/[[path]].ts", deploy_command["requiredPaths"])
        self.assertTrue((REPO_ROOT / actual_path).is_file())
        self.reporter.validate_contract(config, REPO_ROOT, require_paths=False)

        live_fixture = json.loads(json.dumps(config))
        live_fixture["groups"] = {
            "cache-safety": {
                "commands": [deploy_command],
            }
        }
        live_fixture["groups"]["cache-safety"]["commands"][0]["requiredPaths"] = [actual_path]
        self.reporter.validate_contract(live_fixture, REPO_ROOT, require_paths=True)
        self.assertEqual(self.reporter.main(["check-config", "--artifact-ready"]), 0)
        with tempfile.TemporaryDirectory() as directory:
            fixture_path = Path(directory) / "live-contract.json"
            fixture_path.write_text(json.dumps(live_fixture), encoding="utf-8")
            self.assertEqual(self.reporter.main(["--config", str(fixture_path), "check-config"]), 0)

    def test_report_rejects_missing_duplicate_unknown_and_fabricated_results(self) -> None:
        valid = {
            "schemaVersion": "readmates.host-rollout.test-report.v1",
            "group": "compatibility",
            "commands": [{"id": "real-suite", "result": "PASS", "source": "structured-test-reporter"}],
            "cases": [
                {"id": "case-a", "result": "PASS", "commandId": "real-suite"},
                {"id": "case-b", "result": "PASS", "commandId": "real-suite"},
            ],
            "completedAt": "2026-08-24T01:00:00Z",
        }
        self.reporter.validate_report(valid, "compatibility", self.config)
        mutations = []
        value = json.loads(json.dumps(valid))
        value["cases"].pop()
        mutations.append(("missing", value))
        value = json.loads(json.dumps(valid))
        value["cases"].append(value["cases"][0])
        mutations.append(("duplicate", value))
        value = json.loads(json.dumps(valid))
        value["cases"][0]["id"] = "unknown"
        mutations.append(("unknown", value))
        value = json.loads(json.dumps(valid))
        value["commands"][0]["source"] = "static-pass-array"
        mutations.append(("fabricated", value))
        for name, mutation in mutations:
            with self.subTest(name=name), self.assertRaises(self.reporter.ReporterError):
                self.reporter.validate_report(mutation, "compatibility", self.config)

    def test_report_timestamp_must_be_inside_actual_command_window(self) -> None:
        started = datetime(2026, 8, 24, 1, 0, tzinfo=timezone.utc)
        completed = datetime(2026, 8, 24, 1, 1, tzinfo=timezone.utc)
        self.reporter.validate_command_window({"completedAt": "2026-08-24T01:00:30Z"}, started, completed)
        for timestamp in ("2025-08-24T01:00:30Z", "2099-08-24T01:00:30Z"):
            with self.subTest(timestamp=timestamp), self.assertRaises(self.reporter.ReporterError):
                self.reporter.validate_command_window({"completedAt": timestamp}, started, completed)

    def test_canonical_source_set_detects_exact_path_content_mode_and_delete_but_allows_siblings(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.email", "fixture@example.invalid"], check=True)
            subprocess.run(["git", "-C", str(root), "config", "user.name", "Fixture"], check=True)
            (root / "front").mkdir()
            owned = root / "front/owned.ts"
            owned.write_text("export const value = 1\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "front/owned.ts"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "C1"], check=True)
            checkpoint = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True, text=True, capture_output=True
            ).stdout.strip()
            subprocess.run(["git", "-C", str(root), "commit", "--allow-empty", "-qm", "candidate"], check=True)
            unchanged = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True, text=True, capture_output=True
            ).stdout.strip()
            baseline = self.reporter.canonical_source_set(root, checkpoint, checkpoint, ["front/owned.ts"])
            self.assertEqual(baseline, self.reporter.canonical_source_set(root, checkpoint, unchanged, ["front/owned.ts"]))

            drifted_candidates = []
            owned.write_text("export const value = 2\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "front/owned.ts"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "modified"], check=True)
            drifted_candidates.append(("modified", subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True, text=True, capture_output=True
            ).stdout.strip(), ["front/owned.ts"]))
            subprocess.run(["git", "-C", str(root), "checkout", "-q", unchanged], check=True)
            os.chmod(owned, os.stat(owned).st_mode | stat.S_IXUSR)
            subprocess.run(["git", "-C", str(root), "add", "front/owned.ts"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "mode"], check=True)
            drifted_candidates.append(("mode", subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True, text=True, capture_output=True
            ).stdout.strip(), ["front/owned.ts"]))
            subprocess.run(["git", "-C", str(root), "checkout", "-q", unchanged], check=True)
            subprocess.run(["git", "-C", str(root), "rm", "-q", "front/owned.ts"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "deleted"], check=True)
            drifted_candidates.append(("deleted", subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True, text=True, capture_output=True
            ).stdout.strip(), ["front/owned.ts"]))
            subprocess.run(["git", "-C", str(root), "checkout", "-q", unchanged], check=True)
            added = root / "front/added.ts"
            added.write_text("export const added = true\n", encoding="utf-8")
            subprocess.run(["git", "-C", str(root), "add", "front/added.ts"], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "added"], check=True)
            sibling_candidate = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True, text=True, capture_output=True
            ).stdout.strip()
            self.assertEqual(
                baseline,
                self.reporter.canonical_source_set(root, checkpoint, sibling_candidate, ["front/owned.ts"]),
            )

            for name, candidate, relevant_paths in drifted_candidates:
                with self.subTest(name=name), self.assertRaises(self.reporter.ReporterError):
                    self.reporter.canonical_source_set(root, checkpoint, candidate, relevant_paths)


if __name__ == "__main__":
    result = unittest.TextTestRunner(verbosity=2).run(
        unittest.defaultTestLoader.loadTestsFromTestCase(HostRolloutEvidenceReporterTests)
    )
    raise SystemExit(0 if result.wasSuccessful() else 1)
