# Task 8.2 implementation report

- Plan: `docs/superpowers/plans/2026-08-30-platform-admin-operations-product-redesign.md`
- Start HEAD: `bbf13e8b5f1e422203ee91588e724fb78589c976`
- Immutable base and merge base: `8ddb02cdb21067cb58ad9e900850851599d1cdd9`
- ADR impact: `none` — these changes close test and release gates without changing the accepted platform-admin, space-transition, notification-delivery, or observability decisions.
- Scope: three server static-analysis findings, canonical integration resource stability and one concurrency defect exposed by the full gate, deterministic cursor tampering, canonical Docker CT stability, truthful release-readiness and public-safety evidence.

## Rulings

Ruling: the three Detekt findings are repaired by extracting current-meeting selection, candidate SQL, and test fixture setup rather than suppressing responsibility warnings — each extraction makes the existing boundary explicit without changing command or query semantics — 틀렸을 때 비용은 동작 회귀 또는 실제 복잡성 은폐다.

Ruling: reserved-keyword package declarations use the repository's exact per-file KtLint suppression rather than growing the architecture baseline or disabling a rule globally — `adapter.in` and `port.in` are required existing hexagonal package names, and the architecture ratchet correctly rejected new baseline debt — 틀렸을 때 비용은 신규 아키텍처 예외가 기준선에 영구 편입되는 것이다.

Ruling: ordinary server tests disable tracing and OTLP exporters while the one OpenTelemetry integration contract opts in explicitly — test telemetry is not product behavior, and production configuration remains unchanged — 틀렸을 때 비용은 관측성 계약을 시험하지 못하거나 테스트 JVM이 불필요한 processor/class metadata를 누적하는 것이다.

Ruling: the integration worker uses a bounded Spring context cache, a 50-class fork boundary, and a 3 GiB default maximum heap while preserving explicit heap overrides — Java 25 class metadata and Spring contexts accumulated to the former 1.5 GiB ceiling in the canonical suite, whereas bounded JVM generations completed all 1,421 tests — 틀렸을 때 비용은 CI 메모리 낭비 또는 전체 게이트의 재발성 OOM이다.

Ruling: stale notification leases are selected under `FOR UPDATE SKIP LOCKED` and only those exact IDs are reset — the canonical full suite exposed a real MySQL deadlock between broad stale-reset and concurrent claim operations; depending on transient retry luck is unsafe for the production scheduler — 틀렸을 때 비용은 처리량 저하 또는 만료 lease 회수 누락이다.

Ruling: the invalid-cursor test mutates a high-order signature character rather than the final base64 character's unused padding bits — both textual forms can decode to identical bytes at the tail, so the prior test did not reliably alter the signature — 틀렸을 때 비용은 정상 cursor를 invalid로 오판하거나 tamper 검증이 비결정적으로 통과하는 것이다.

Ruling: AvatarChip waits cheaply for image decode and performs the expensive full raster transparency inspection once — repeatedly rasterizing 270 images inside a poll caused the moving Docker timeout; no timeout, snapshot, or visual acceptance boundary is broadened — 틀렸을 때 비용은 실제 투명도 회귀를 놓치거나 CT timeout이 재발하는 것이다.

Ruling: novice comprehension is `not measured` because five actual first-time operators were unavailable, and no study report is created — synthetic results would be false evidence; this does not block ADR-0050 acceptance but blocks any claim that the 30-second goal was verified — 틀렸을 때 비용은 검증되지 않은 사용성 주장을 release evidence로 남기는 것이다.

Ruling: local public-release safety is green only for the repository fallback scanner — `gitleaks` is unavailable locally, so professional secret scanning remains not measured and is not claimed as passed — 틀렸을 때 비용은 fallback coverage를 완전한 secret scan으로 과장하는 것이다.

## RED, diagnosis, and GREEN

- RED: `/usr/bin/time -p ./scripts/server-ci-check.sh` — exit 1, real 30.21s; exactly three findings: `HostOperatingRoomCurrentService` ReturnCount, `HostOperatingRoomCandidateQueries` LongMethod, and `HostOperatingRoomCandidateDbTest` LongMethod.
- Static GREEN: `./server/gradlew -p server ktlintMainSourceSetCheck ktlintTestSourceSetCheck detekt` — exit 0. The first full CI retry with baseline additions exited 1 because the architecture ratchet detected baseline growth; the baseline change was reverted and exact file suppressions were used only for required keyword packages.
- Final server PR gate: `/usr/bin/time -p ./scripts/server-ci-check.sh` — exit 0; BUILD SUCCESSFUL in 41s; real 41.84s.
- Integration RED: the 1.5 GiB canonical worker saturated at about 1,568,832 KiB used heap; a Java 25 class histogram showed about 641 MB byte arrays, 138 MB classfile UTF-8 metadata, and 86 MB strings. With a 20-class fork boundary it reached all 1,421 tests but exposed a notification-claim deadlock and the ten-scan startup class still OOMed; exit 1, 1,421 tests, 2 failed, real 1,145.00s.
- Notification focused GREEN: `JdbcNotificationDeliveryAdapterTest` plus KtLint/Detekt — exit 0; BUILD SUCCESSFUL in 1m04s.
- Startup focused GREEN: `/usr/bin/time -p ./server/gradlew -p server integrationTest --tests '*AdminCommandDigestKeyStartupIntegrationTest'` — exit 0; 10 tests; real 58.06s.
- Cursor focused GREEN: `PlatformAdminClubRegistryCursorDbTest` — exit 0; real 70.86s.
- Telemetry contract GREEN: `SpringAiDependencyContractTest` — exit 0; 4s. `AiGenerationJobConsumerIntegrationTest` — exit 0; BUILD SUCCESSFUL in 25s; real 26.05s.
- Canonical integration GREEN: `/usr/bin/time -p ./server/gradlew -p server integrationTest` — exit 0; BUILD SUCCESSFUL in 12m48s; real 768.17s; 154 suites, 1,421 tests, 0 failures, 0 errors, 0 skipped.
- CT focused GREEN: the exact Docker AvatarChip subset with `--repeat-each=5` — exit 0; 35/35; 17.8s.
- Canonical Docker CT GREEN: `/usr/bin/time -p npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker` — exit 0; 104/104; real 156.39s. No snapshots were updated.
- Frontend lint: `/usr/bin/time -p npx --yes corepack@0.35.0 pnpm --dir front lint` — exit 0; real 15.14s; zero errors and two pre-existing Fast Refresh warnings.

## Release-readiness and side-effect boundary

- `python3 scripts/agent-preflight.py --intent release --base 8ddb02cdb21067cb58ad9e900850851599d1cdd9 ... --json` — exit 0; immutable base resolved and whole-branch/operator follow-up risk triggers were reviewed.
- The immutable-base committed-branch audit contains 414 changed paths and zero paths under server MySQL migrations, `front/functions/`, `deploy/`, `.github/workflows/`, server main resources, or the AI LLM provider adapter. No unexpected schema migration, BFF mutation, deploy, provider, production-data, email, or external side effect occurred.
- Conditional Task 8.2 documentation whitespace/public-safety gate — exit 0; novice report absent by design.
- `./scripts/build-public-release-candidate.sh` — exit 0; real 13.49s.
- `./scripts/public-release-check.sh .tmp/public-release-candidate` — exit 0; real 13.05s; fallback path/content checks passed, but `gitleaks` was unavailable as noted below.
- `git diff --check` — exit 0 before commit.

## Residual risk and release decision

- Blocker, High, Medium: none found in the Task 8.2 gate-closure surface.
- Low / not measured: five-person first-time-operator comprehension study and manual 30-second success counts; therefore the 30-second comprehension goal is not verified.
- Low / not measured: professional `gitleaks` scan in the local environment; repository fallback safety checks passed.
- Environment boundary: Docker Desktop remained at its existing 2 GiB/2 CPU allocation; no user container was stopped and no global Docker setting was changed. The production-neutral test changes passed within that boundary.
- No push, merge, deploy, provider call, real email, or production mutation was performed by this task.
