# Stage 5 Task 2 review fix 2 brief

Fix only the remaining public-safety IMPORTANT from review fix round 1, from base `3e4f30fe2348da5f438204c93af57fec9669b761`.

## Finding

`task-2-report.md` and `task-2-review-fix-1-report.md` persisted the machine-local Node path `<machine-local-node24-bin>`. The targeted scan checked only one user-home path form and then incorrectly claimed no public-safety finding.

## Required closure

1. Replace every machine-local absolute launcher path in the two reports with the established public-safe `<node24-bin>` placeholder while preserving the exact remaining command tokens, source hashes, results and finding closure.
2. State once that `<node24-bin>` denotes the locally resolved Node 24 `bin` directory and that the private machine path is intentionally not persisted.
3. Extend the recorded targeted scan to detect common local absolute roots generically, without embedding another concrete private machine path. Run it across both reports, their briefs/manifests and the Task 2 changed surface.
4. Do not rerun behavior tests, edit production/test code, alter the already-closed reconciliation evidence or reopen any other Task 2 finding.
5. Run `git diff --check`, the corrected public-safety scan and a delta SHA-256 manifest. Force-add ignored brief/report/manifest and commit exactly `docs(host): sanitize lifecycle recovery evidence`.

Return exact replaced occurrence count, scan command/result, manifest digest and commit SHA. Preserve the unrelated external mockup.
