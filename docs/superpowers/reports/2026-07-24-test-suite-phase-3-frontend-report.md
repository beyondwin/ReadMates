# 테스트 스위트 효과성 최적화 Phase 3 Frontend/BFF 보고서

## 결론

Phase 3는 시작 커밋 `bc140818`에서 runtime 후보 `ac1ac8fd`까지
frontend/BFF와 OAuth return-state 테스트만 강화했다. 최종 검증은
runtime 후보 `ac1ac8fd`에서 실행했으며, 이 보고서 커밋은 runtime을
바꾸지 않는 report-only descendant다.

- 33개 후보의 최종 결정은 `retain` 27, `strengthen` 6이다.
- `split`, `move-layer`, `consolidate`, `delete`는 모두 0이므로 Task 7은
  의도적으로 tracked cleanup을 만들지 않았다.
- frontend 실행 파일은 188개로 유지됐고, 실행 케이스는 1,475개에서
  1,488개로 13개 늘었다.
- lint, coverage, build, server PR gate, 계획에 적힌 Playwright 명령,
  그리고 정확히 두 auth/BFF 파일만 고른 보충 Playwright 명령이 모두
  통과했다.
- R01/R02/R03과 R10의 browser-facing 범위는 same-HEAD unit/browser
  증거로 확인됐다.
- 제품 코드, production route/API/auth 계약, coverage threshold,
  retry, timeout, worker, snapshot, visual baseline은 변경하지 않았다.

이 보고서의 증거 범위는 저장소와 로컬 MySQL/Spring/Vite/Chromium
실행이다. 외부 OAuth provider, 배포, live production 상태를 검증했다고
주장하지 않는다.

## 시작점과 집계

- Phase 3 시작 커밋: `bc140818`
- 최종 runtime 후보: `ac1ac8fd`
- 현재 제품 visibility 계약: `PUBLIC`, `MEMBER`, `HOST_ONLY`
- actor 판정: `ATTENDEE`는 별도 visibility가 아니라 `MEMBER` 안의 actor
  차원이다.
- 파일/케이스 before: Task 1의 clean coverage run, 188 files / 1,475 cases
- 파일/케이스 after: Task 8의 final coverage run, 188 files / 1,488 cases
- 역사적 Phase 1 비교값 183 files / 1,425 cases는 현재 Phase 3
  before-state로 대체하지 않았다.

| 지표 | Phase 3 before | Phase 3 after | 변화 |
| --- | ---: | ---: | ---: |
| Vitest files | 188 | 188 | 0 |
| Vitest cases | 1,475 | 1,488 | +13 |
| 실패 | 0 | 0 | 0 |
| 최종 skip | 0 | 0 | 0 |

## 33개 후보 결정

결정 원본은
`docs/superpowers/reports/2026-07-24-test-suite-phase-3-frontend-decisions.tsv`
이다. 33개 path가 고유하고 disposition 합계가 정확히 33이다.

| Decision | 수 | 적용 |
| --- | ---: | --- |
| `retain` | 27 | 고유 user/query/adapter/architecture 실패 모드 유지 |
| `strengthen` | 6 | BFF trust, query cache, polling 증거 강화 |
| `split` | 0 | 승인된 분할 없음 |
| `move-layer` | 0 | 승인된 이동 없음 |
| `consolidate` | 0 | 승인된 통합 없음 |
| `delete` | 0 | 승인된 삭제 없음 |

| 후보 path | 결정 |
| --- | --- |
| `front/features/current-session/queries/current-session-queries.test.tsx` | `strengthen` |
| `front/features/host/aigen/api/aigen-api.test.ts` | `retain` |
| `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx` | `strengthen` |
| `front/features/host/aigen/queries/aigen-job-queries.test.tsx` | `strengthen` |
| `front/features/host/aigen/ui/AiGenerateTab.draft-restoration.test.tsx` | `retain` |
| `front/features/host/aigen/ui/AiGenerateTab.test.tsx` | `retain` |
| `front/features/host/queries/host-session-queries.hooks.test.tsx` | `strengthen` |
| `front/features/host/queries/host-session-queries.test.ts` | `retain` |
| `front/features/host/queries/host-session-record-queries.test.tsx` | `strengthen` |
| `front/features/host/route/host-session-editor-route.test.tsx` | `retain` |
| `front/features/host/ui/session-editor/session-record-draft-panel.test.tsx` | `retain` |
| `front/features/platform-admin/queries/platform-admin-ai-ops-queries.test.tsx` | `retain` |
| `front/features/platform-admin/queries/platform-admin-queries.test.tsx` | `retain` |
| `front/features/platform-admin/ui/admin-support-workbench.test.tsx` | `retain` |
| `front/tests/lighthouse/lighthouse-runner.test.ts` | `retain` |
| `front/tests/unit/archive-page.test.tsx` | `retain` |
| `front/tests/unit/auth-context.test.tsx` | `retain` |
| `front/tests/unit/cloudflare-bff.test.ts` | `strengthen` |
| `front/tests/unit/current-session.test.tsx` | `retain` |
| `front/tests/unit/frontend-boundaries.test.ts` | `retain` |
| `front/tests/unit/host-dashboard.test.tsx` | `retain` |
| `front/tests/unit/host-invitations.test.tsx` | `retain` |
| `front/tests/unit/host-members.test.tsx` | `retain` |
| `front/tests/unit/host-notifications.test.tsx` | `retain` |
| `front/tests/unit/host-session-editor.test.tsx` | `retain` |
| `front/tests/unit/member-home.test.tsx` | `retain` |
| `front/tests/unit/member-session-detail-page.test.tsx` | `retain` |
| `front/tests/unit/my-page.test.tsx` | `retain` |
| `front/tests/unit/notes-feed-page.test.tsx` | `retain` |
| `front/tests/unit/readmates-fetch.test.ts` | `retain` |
| `front/tests/unit/responsive-navigation.test.tsx` | `retain` |
| `front/tests/unit/spa-layout.test.tsx` | `retain` |
| `front/tests/unit/spa-router.test.tsx` | `retain` |

## 적용한 강화와 보존한 실패 모드

### BFF trust boundary

`cloudflare-bff.test.ts`와 `cloudflare-oauth-proxy.test.ts`는 hostile
browser header와 configured API-base query가 upstream trust context에
들어가지 않음을 확인한다. server-derived BFF secret, client IP, host,
route-selected club slug만 전달되고, invalid slug는 upstream 호출 전에
거부된다.

응답 경계는 manual redirect status와 `Location`, 여러 `Set-Cookie`의
개수와 `Expires`/`Path`/`HttpOnly`/`Secure`/`SameSite` 속성을 보존하면서
모든 `Domain`을 제거한다. 내부 `x-readmates-*` 응답 header와
secret/token/browser sentinel은 public response에서 제거된다.

최종 same-HEAD BFF focused suite는 3 files / 62 cases로 통과했다.
`proxy-bff-secret.test.ts`는 별도 consolidation 승인이 없어서 그대로
남았고 secret selection/fallback 실패 모드를 보존한다.

### OAuth return state

`OAuthReturnStateTest`는 고정된 public-safe fixture에서 relative target
round-trip과 payload/signature tampering, expiry, malformed/invalid
Base64, protocol-relative, backslash, user-info, unsupported scheme,
external/inactive host, invite token/club mismatch를 구분한다. invalid
상태는 public method 계약에 따라 `DEFAULT_RETURN_TARGET` 또는 `null`로
수렴한다.

server PR gate의 최종 JUnit 결과에서 이 클래스는 7 cases, 실패/오류/skip
0이다. OAuth proxy는 malformed state를 opaque하게 전달하고 backend의
safe fallback redirect를 보존한다.

### Query cache contract

네 query test는 feature API mock을 outbound boundary에만 남기고 실제
`QueryClient`의 normalized key와 구체적 cached value를 관찰한다.
선택 club/session의 성공 invalidation/removal와 다른 club/session의
보존, 실패 응답 뒤 전체 cache snapshot 무변경을 확인한다.

최종 구성은 4 files / 39 cases다. spy call shape에만 의존하던 assertion은
실제 cache 값, removal, `isInvalidated` 관찰로 대체됐다.

### AI polling

`useAiGenerationJob.test.tsx`는 fake timer를 매 case 전후로 설치/복구하고
disabled, terminal, `COMMITTING`, `COMMIT_RETRY`, initial/later cadence,
1,999ms no-early-poll, transient failure recovery를 virtual time으로
검증한다. 실제 sleep과 5초 wallclock `waitFor`는 남아 있지 않다.

## R01/R02/R03/R10 증거

| Risk | Unit/server 증거 | Browser 증거 | Phase 3 판정 |
| --- | --- | --- | --- |
| R01 | BFF 3 files / 62 cases가 hostile trusted headers, cookie Domain stripping, redirect/status, internal response-header stripping, secret/token 부재를 확인 | `google-auth-invite-flow` 1 case와 full local E2E의 auth/BFF 흐름 통과 | browser-facing contract verified |
| R02 | `OAuthReturnStateTest` 7 cases와 OAuth proxy malformed-state case가 unsafe return target과 fallback을 확인 | Google invite acceptance 흐름 통과 | verified |
| R03 | ordinary/OAuth BFF가 browser club host/slug를 덮어쓰고 route/server context만 전달함을 확인 | `multi-club-flow` 4 cases가 public slug isolation, shared-session club choice, role-preserving switch, target-club-only invite activation을 확인 | verified |
| R10 | frontend observability 4 files / 13 cases가 low-cardinality sanitization, short hashes, invalid/high-cardinality drop, bounded batch, raw-stack 제거, BFF internal-header stripping을 확인. server PR gate에서 observability controller/service/metrics 7 unit cases도 통과 | 계획의 exact E2E 실행에 포함된 `frontend-observability-local-proxy`가 202 forwarding 경계를 통과 | Phase 3 관찰 증거 기록 완료. observability proxy 독립 실행, config/profile validator, label/cardinality policy와 독립 script/config 결과는 Phase 4 소유 |

R10 unit 묶음은 다음 네 파일이다.

- `front/shared/observability/frontend-observability-client.test.ts`
- `front/shared/observability/frontend-observability-contracts.test.ts`
- `front/src/app/route-observability.test.ts`
- `front/tests/unit/functions/frontend-observability-bff.test.ts`

## cleanup 결과

| 종류 | 변경 파일 | 보존한 실패 모드 |
| --- | --- | --- |
| split | 없음 | 27 retain 파일의 user/adapter/architecture contract 유지 |
| move-layer | 없음 | 원래 truthful layer 유지 |
| consolidate | 없음 | 후보 간 exact duplicate가 입증되지 않음 |
| delete | 없음 | 독립 실패 모드 삭제 없음 |

Task 7은 decision ledger를 다시 파싱해 33 unique path, `retain=27`,
`strengthen=6`, cleanup disposition 0을 확인했다. 따라서 empty commit을
만들지 않았다. 같은 HEAD에서 node/jsdom full lane 188 files / 1,488
cases, frontend boundary 8 cases, Zod fixture export/drift check도 통과했다.

## 최종 same-HEAD 게이트

Node `v24.18.0`, Corepack `0.35.0`, pnpm `11.13.1`을 사용했다.

| Gate | 결과 | wallclock |
| --- | --- | ---: |
| `pnpm --dir front lint` | PASS, ESLint finding 0 | 8.04s |
| `pnpm --dir front test:coverage` | PASS, 188 files / 1,488 cases | 14.35s |
| `pnpm --dir front build` | PASS, 535 modules, Vite build 230ms | 1.06s |
| `./scripts/server-ci-check.sh` | PASS, 962 unit + 25 architecture, failure/error 0, skip 1 | 15.65s |
| 계획의 exact `pnpm --dir front test:e2e -- <두 파일>` | PASS, 90 cases | 84.89s |
| 보충 `pnpm --dir front exec playwright test <두 파일>` | PASS, 정확히 5 cases | 10.99s |

server gate는 `unitTest`, `architectureTest`, `detekt`, JaCoCo report와
verification을 실제 실행했고 ktlint를 포함한 11개 task는
`UP-TO-DATE`로 검증했다. 최종 JaCoCo line coverage는
11,347 / 25,234 = 44.97%로, 변경하지 않은 minimum `0.23`을 만족했다.

계획에 적힌 exact E2E 명령은 기존 `test:e2e` script가 이미
`playwright test`를 제공하는 상태에서 추가 `--`를 전달해 두 path
filter가 아니라 전체 90-case suite를 선택했다. 명령 자체는 90/90으로
통과했고 target 5 cases도 포함했다. 선택성을 별도로 증명하기 위해
설정, retry, timeout, worker를 바꾸지 않고 `pnpm exec playwright test`
보충 명령으로 두 파일만 실행해 5/5 통과를 확인했다. 이는
`UNVERIFIED_ENV`가 아니라 기존 command-shape 관찰이다.

## coverage와 시간

| Coverage | before | after | threshold |
| --- | ---: | ---: | ---: |
| Statements | 82.50% (`8051/9758`) | 82.50% (`8051/9758`) | 79 |
| Branches | 78.10% (`6461/8272`) | 78.09% (`6460/8272`) | 75 |
| Functions | 83.15% (`2572/3093`) | 83.15% (`2572/3093`) | 80 |
| Lines | 83.20% (`7693/9246`) | 83.20% (`7693/9246`) | 80 |

Task 1의 bootstrap-bearing 최초 coverage 실행과 clean before run 사이에도
branch numerator가 1 차이 났다. 최종 1 branch 차이는 production
denominator, file count, 다른 numerator가 모두 같은 상태의 기존 local
coverage nondeterminism이며 coverage regression으로 해석하지 않는다.

| 표본 | min | median | max |
| --- | ---: | ---: | ---: |
| AI polling focused wallclock, 3회 | 1.31s | 1.32s | 1.33s |
| AI polling Vitest duration, 3회 | 517ms | 528ms | 531ms |

full coverage wallclock은 before 23.22s, after 14.35s였고 Vitest duration은
21.92s에서 13.18s였다. lint는 10.79s에서 8.04s, build는 1.73s에서
1.06s였다. 모두 한 로컬 환경의 소수 표본이므로 통계적으로 유의한
성능 개선을 주장하지 않는다. deterministic polling의 근거는 시간
단축률이 아니라 세 번의 동일 결과와 real sleep 제거다.

## retry, flake, 경고

- Task 6 최종 polling 3회와 Task 8 최종 gate에서 test retry,
  re-execution, open timer, unhandled error는 관찰되지 않았다.
- Task 1의 dependency bootstrap-bearing coverage run은 성공했지만
  설치 시간을 제외한 clean timing을 위해 한 번 더 실행했다. 실패
  retry가 아니다.
- Task 4의 최초 ktlint finding과 Task 5/6 개발 중 잘못된 test expectation은
  테스트/format만 수정한 뒤 focused gate를 다시 실행했다. 최종
  evidence run의 flake가 아니다.
- server gate에는 기존 Java native-access와 deprecated Unsafe 경고가
  남아 있다. gate 결과에는 영향을 주지 않았다.
- Playwright exact command의 전체-suite 선택은 위에서 분리한 기존
  argument-shape 문제다. 테스트 실패나 환경 prerequisite 실패는
  없었다.

## 변경하지 않은 계약

`bc140818..ac1ac8fd`의 runtime diff는 test source에만 있고 production
frontend, Functions, server Kotlin, migration, package script, build
configuration은 바뀌지 않았다.

- product behavior, route contract, API schema 변경 없음
- production auth/visibility/club-context policy 변경 없음
- frontend coverage threshold `80/79/80/75` 변경 없음
- server JaCoCo minimum `0.23` 변경 없음
- Playwright/Vitest/Gradle retry, timeout, worker, heap, fork 변경 없음
- snapshot 또는 visual baseline 변경 없음
- real member/deployment/provider data 추가 없음

Task 8 implementer는 별도 runner/executor 또는 다른 skill workflow를
호출하지 않았고, orchestration은 `subagent-driven-development`로
유지됐다.

## acceptance와 잔여 위험

Acceptance matrix에서 BFF/OAuth, club context, actor/authorization,
async/cache, UI/runtime-state 행을 선택했다. 이 Phase의 test-only
변경은 persistence/migration, cursor, deploy/public-release behavior를
바꾸지 않았으므로 해당 행은 제외했다.

`UNVERIFIED_ENV`는 없다. Phase 4가 넘겨받는 것은 환경 실패가 아니라
계획대로의 전체 browser/visual evidence 확장과 R10 observability
proxy, config/profile validator, label/cardinality policy, 독립
script/config 결과 검증이다.

남은 evidence boundary는 다음과 같다.

- 실제 외부 Google OAuth provider와 production deployment는 호출하지
  않았다.
- R10 observability proxy, production config/profile validator,
  label/cardinality policy와 독립 script/config 결과는 Phase 4가
  검증하고 닫는다. Phase 5는 그 결과를 fresh final gate와 defect
  injection으로 재검증하고 남은 residual을 조정·대조한다.
- Phase 2에서 기록한 Redis best-effort stale-cache risk와 외부
  provider/mail network 미검증은 Phase 3 test-only 변경으로 제거되지
  않았다.
- E2E focused wrapper를 다시 사용할 때는 기존 script의 추가 `--`
  전달이 전체 suite를 선택한다는 점을 고려해야 한다.
