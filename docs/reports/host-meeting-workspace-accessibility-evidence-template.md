# Host meeting workspace manual screen-reader evidence template

This tracked file defines the evidence shape only. Do not enter operator names, account or member data, machine identifiers, local paths, private URLs, timestamps, result values, or free-form notes here.

## Protected artifact contract

- Evidence kind: `accessibility`
- Schema: `host-client-rollout-evidence/v1`
- Command id: `manual-screen-reader-evidence`
- Required cases: `voiceover-safari-host-workspace`, `nvda-chrome-host-workspace`
- Provenance id: `D6`
- Stage binding: protected `R2b`, browser contract `v3`
- Verification: `python3 -B scripts/verify-host-client-rollout-evidence.py --manifest <protected-manifest> --attestation <protected-bundle> --kind accessibility`

The verifier accepts only the exact bounded command, cases, provenance, protected source ref, candidate identity, digests, and GitHub attestation binding. A local copy of this template, an automated browser result, or an unsigned manifest is not evidence.

## Operator-only checklist

Complete the following in the protected evidence process, not in this repository file:

- VoiceOver with Safari: landmark/navigation order, task changes, focus restoration, form names and states, status/error announcements, conflict recovery, bulk confirmation, and publication correction.
- NVDA with Chrome: the same lifecycle, attendance, recovery, keyboard, and announcement surfaces.
- Record only bounded PASS/FAIL results for the two required cases; do not include spoken text transcripts, user content, screenshots, recordings, or free-form observations in the manifest.

Until both protected cases have real externally reviewed results and a valid attestation, manual screen-reader coverage is `not measured` and must not be reported as passed.
