# Stage 5 Task 4 Gate Fix 2 Brief

- Base: `a3a24b668f083b2b7bd013c7af374a96f5cd505c`
- Finding: `HealthControllerTest` is not isolated. A fresh `integrationTest --tests com.readmates.shared.adapter.in.web.HealthControllerTest` run fails 4/4 because `spring.flyway.enabled=false` leaves the new Testcontainers database without tables required by startup validators. The full suite only hides this through prior-class migration order.
- Scope: make this test self-contained without weakening the production startup validators or changing production behavior.
- TDD: preserve the exact isolated RED, implement the smallest test-fixture correction, then prove the exact isolated class GREEN.
- Allowed source surface: `server/src/test/kotlin/com/readmates/shared/adapter/in/web/HealthControllerTest.kt` and, only if unavoidable, narrowly shared test support under `server/src/test/kotlin/com/readmates/support/`.
- Evidence surface: this brief, a focused report and SHA-256 manifest under the current Stage 5 ledger directory.
- Required checks: exact isolated integration class, relevant formatting/static check, `git diff --check`, public-safety scan, manifest verification.
- Forbidden: production code, migrations, unrelated tests/docs, external mockup tree, broad full-suite reruns.
- Commit exactly: `test(host): isolate health integration fixture`
