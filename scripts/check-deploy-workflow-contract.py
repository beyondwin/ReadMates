#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKFLOW = REPO_ROOT / ".github/workflows/deploy-server.yml"

VALID_WORKFLOW = r'''name: Deploy Server Image
on:
  workflow_dispatch:
    inputs:
      image_tag:
        required: true
        type: string
concurrency:
  group: ${{ github.workflow }}-${{ inputs.image_tag || github.ref_name }}
jobs:
  build-and-push:
    steps:
      - uses: actions/checkout@example
        with:
          ref: ${{ inputs.image_tag || github.ref }}
          fetch-depth: 0
      - id: image
        env:
          DISPATCH_IMAGE_TAG: ${{ inputs.image_tag || '' }}
        run: |
          release_tag="${DISPATCH_IMAGE_TAG:-${GITHUB_REF_NAME}}"
          if [[ ! "$release_tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            exit 1
          fi
          if [[ "$(git cat-file -t "$release_tag" 2>/dev/null || true)" != "tag" ]]; then
            exit 1
          fi
          tag_commit="$(git rev-list -n 1 "$release_tag")"
          head_commit="$(git rev-parse HEAD)"
          if [[ "$tag_commit" != "$head_commit" ]]; then
            exit 1
          fi
          echo "tag=$release_tag" >> "$GITHUB_OUTPUT"
      - id: build
        uses: docker/build-push-action@example
      - uses: aquasecurity/trivy-action@example
        with:
          image-ref: ${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}
      - name: Promote scanned digest to release tag
        run: |
          docker buildx imagetools create \
            --tag "${{ steps.image.outputs.name }}:${{ steps.image.outputs.tag }}" \
            "${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}"
'''


def validate_deploy_server_workflow(source: str) -> list[str]:
    """Return every missing fail-closed deploy invariant."""
    errors: list[str] = []

    def require_contains(snippet: str, error: str) -> None:
        if snippet not in source:
            errors.append(error)

    dispatch_input = re.search(
        r"workflow_dispatch:\s*\n"
        r"\s+inputs:\s*\n"
        r"\s+image_tag:\s*\n"
        r"(?:\s+[^\n]+\n)*?"
        r"\s+required:\s*true\s*\n"
        r"(?:\s+[^\n]+\n)*?"
        r"\s+type:\s*string\s*(?:\n|$)",
        source,
    )
    if dispatch_input is None:
        errors.append("workflow_dispatch image_tag must be a required string")

    require_contains(
        "group: ${{ github.workflow }}-${{ inputs.image_tag || github.ref_name }}",
        "concurrency must use the canonical release tag",
    )
    require_contains(
        "ref: ${{ inputs.image_tag || github.ref }}",
        "checkout must resolve the dispatch tag or pushed tag ref",
    )
    require_contains("fetch-depth: 0", "checkout must fetch full tag history")
    require_contains(
        "DISPATCH_IMAGE_TAG: ${{ inputs.image_tag || '' }}",
        "dispatch image tag must be passed to the release verifier",
    )
    require_contains(
        'release_tag="${DISPATCH_IMAGE_TAG:-${GITHUB_REF_NAME}}"',
        "release tag must have one canonical shell value",
    )
    require_contains(
        r'^v[0-9]+\.[0-9]+\.[0-9]+$',
        "release tag must use exact release semver",
    )
    require_contains(
        'git cat-file -t "$release_tag"',
        "release source must be an annotated tag",
    )
    require_contains(
        'tag_commit="$(git rev-list -n 1 "$release_tag")"',
        "release tag commit must be resolved",
    )
    require_contains(
        'head_commit="$(git rev-parse HEAD)"',
        "checked out tag commit must be compared with HEAD",
    )
    require_contains(
        '[[ "$tag_commit" != "$head_commit" ]]',
        "tag commit and checked out HEAD must fail closed on mismatch",
    )
    require_contains(
        'echo "tag=$release_tag" >> "$GITHUB_OUTPUT"',
        "verified release tag must own the published image tag",
    )
    require_contains(
        "image-ref: ${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}",
        "Trivy must scan the built image digest",
    )
    require_contains(
        '"${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}"',
        "promotion must promote the scanned digest",
    )

    return errors


class DeployWorkflowContractTests(unittest.TestCase):
    def test_valid_workflow_passes(self) -> None:
        self.assertEqual(validate_deploy_server_workflow(VALID_WORKFLOW), [])

    def test_broken_contracts_fail_independently(self) -> None:
        cases = (
            (
                "branch checkout",
                VALID_WORKFLOW.replace(
                    "ref: ${{ inputs.image_tag || github.ref }}",
                    "ref: ${{ github.ref }}",
                ),
                "checkout must resolve the dispatch tag or pushed tag ref",
            ),
            (
                "shallow checkout",
                VALID_WORKFLOW.replace("          fetch-depth: 0\n", ""),
                "checkout must fetch full tag history",
            ),
            (
                "generic Docker tag",
                VALID_WORKFLOW.replace(
                    r'^v[0-9]+\.[0-9]+\.[0-9]+$',
                    r'^[A-Za-z0-9_.-]+$',
                ),
                "release tag must use exact release semver",
            ),
            (
                "lightweight tag",
                VALID_WORKFLOW.replace("git cat-file -t", "git rev-parse"),
                "release source must be an annotated tag",
            ),
            (
                "unchecked head",
                VALID_WORKFLOW.replace("git rev-parse HEAD", "git rev-parse HEAD~1"),
                "checked out tag commit must be compared with HEAD",
            ),
            (
                "branch concurrency",
                VALID_WORKFLOW.replace(
                    "${{ inputs.image_tag || github.ref_name }}",
                    "${{ github.ref }}",
                    1,
                ),
                "concurrency must use the canonical release tag",
            ),
            (
                "different promoted digest",
                VALID_WORKFLOW.replace(
                    '"${{ steps.image.outputs.name }}@${{ steps.build.outputs.digest }}"',
                    '"${{ steps.image.outputs.name }}:scan-candidate"',
                    1,
                ),
                "promotion must promote the scanned digest",
            ),
        )

        for name, source, expected_error in cases:
            with self.subTest(name=name):
                self.assertIn(expected_error, validate_deploy_server_workflow(source))


def run_self_tests() -> int:
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(DeployWorkflowContractTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate the server deploy workflow release contract")
    parser.add_argument("--workflow", type=Path, default=DEFAULT_WORKFLOW)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        return run_self_tests()

    try:
        source = args.workflow.read_text(encoding="utf-8")
    except OSError as error:
        print(f"deploy workflow contract: cannot read {args.workflow}: {error}", file=sys.stderr)
        return 1

    errors = validate_deploy_server_workflow(source)
    if errors:
        for error in errors:
            print(f"deploy workflow contract: {error}", file=sys.stderr)
        return 1

    print(f"Deploy workflow contract passed: {args.workflow}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
