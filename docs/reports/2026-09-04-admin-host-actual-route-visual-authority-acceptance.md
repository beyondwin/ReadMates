# Admin·Host 실제 route 시각 권위 수락 기록

작성일: 2026-09-04. 이 문서는 실제 authenticated route를 최종 시각 권위로 사용한 뒤의 **정직한 마감 기록**이다. **전체 수락이 아니다.** ADR-0053은 `Proposed`로 남는다.

이 보고서는 2026-09-02 두 보고서(`test:ct:approved` component fixture 기반)를 대체하는 현재 권위 기록이다. 이전 보고서의 결과는 역사적 근거로 보존한다.

## Source binding

| 항목 | 값 |
| --- | --- |
| Branch | `feat/admin-host-actual-route-visual-authority` |
| HEAD | `c04ac0672e825cdfbbc304050c2a720c07bc2c58` (`fix: bind host 409 recovery to refreshed detail`) |
| Base | `origin/main` `595ebf057c9d45ecb294c6b4d851e307eda4eda2` |
| Design | `docs/superpowers/specs/2026-09-04-admin-host-actual-route-visual-authority-convergence-design.md` |
| ADR-0053 | `Proposed` — 이 기록으로 `Accepted`로 올리지 않는다 |
| Manifest | `front/tests/e2e/support/approved-mockup-manifest.ts` (18 entries) |
| `maxDiffPixelRatio` | 18/18 **0.02** fail-closed. 0.10/0.15 font-raster ceiling과 mask는 없다. |
| Candidate | 실제 authenticated route (`admin-approved-routes.spec.ts` / `host-approved-routes.spec.ts`) |
| Renderer | `mcr.microsoft.com/playwright:v1.61.1-jammy`, Chrome/149.0.7827.55, Playwright 1.61.1, Node 24.17.0, pnpm 11.13.1, DPR 1, Pretendard Variable |
| Package manager | `CI=true npx --yes corepack@0.35.0 pnpm --dir front ...` |
| Docker | 격리 Colima context (기본 context를 바꾸지 않았다) |

18개 `referenceSha256`는 모두 manifest 값과 일치한다(18/18 match). 승인 PNG는 이 작업에서 수정하지 않았다.

## Step 1 — 정식 frontend gate 결과

실행한 명령과 exit code만 적는다. **건너뛴 명령은 PASS가 아니다.**

| # | 명령 | exit | 결과 |
| --- | --- | ---: | --- |
| 1 | `pnpm --dir front lint` | **1** | **FAIL** — error 4건, warning 5건 |
| 2 | `pnpm --dir front test` | 0 | PASS — 480 files / 4754 tests |
| 3 | `pnpm --dir front build` | 0 | PASS |
| 4 | `pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts` | 0 | PASS — 15 tests |
| 5 | `pnpm --dir front test:ct:docker` | **1** | **FAIL** — 159 passed / 18 failed |
| 6 | `pnpm --dir front test:e2e:approved-routes:docker` | **1** | **not_passed_0.02** — 18/18 strict pixel fail-closed |
| 7 | `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true pnpm --dir front test:e2e:visual-authority-browsers` | **1** | **FAIL** — 12 passed / 9 failed |
| 8 | `pnpm --dir front exec playwright test <5 specs> --project=chromium` | **1** | **FAIL** — 12 passed / 7 failed / 2 did not run |

명령 6은 `DOCKER_CONTEXT` 격리 context에서 두 번 실행했고 두 번 모두 exit 1과 동일한 비율을 냈다. `pnpm install --frozen-lockfile`은 성공했다.

### 1. lint FAIL 상세 (error 4건)

모두 이 branch가 새로 만들거나 수정한 파일이다. `origin/main`에는 없다.

| 파일 | 위치 | 규칙 |
| --- | --- | --- |
| `front/features/host/route/host-dashboard-route.tsx` | 531:8 | `react-hooks/refs` — render 중 ref 접근 |
| `front/tests/e2e/support/host-approved-route-fixtures.ts` | 571:9 | `@typescript-eslint/no-unused-vars` (`closing`) |
| `front/tests/e2e/support/host-approved-route-fixtures.ts` | 725:7 | `no-useless-assignment` (`clubSlug`) |
| `front/tests/performance/visual-authority-docker.ts` | 4:3 | `@typescript-eslint/no-unused-vars` (`APPROVED_MOCKUPS`) |

`host-dashboard-route.tsx`의 `react-hooks/refs`는 `feat: converge host operating room actual routes`에서 들어왔다. 이 Task는 문서 마감 범위이므로 제품 코드를 고치지 않았다. 남은 위험으로 기록한다.

### 2. `test:ct:docker` FAIL 상세 (18건)

Component CT는 **보조 회귀 suite**다. 최종 수락 권위가 아니다. 실패는 snapshot pixel drift만이 아니라 semantic 계약 파손을 포함한다. **CT snapshot을 갱신해 흡수하지 않았다.**

| 유형 | 예 |
| --- | --- |
| geometry delta | `main` height delta 9.36–113.83px가 4px 초과; `body` y delta 37.34px 초과; `first-row` width delta 7.00px가 2px 초과 |
| semantic 파손 | `getByRole("status")` strict mode violation (2 elements); `나머지 3명` 미표시; `새 긴급 신호 1건` 미표시 |
| tracked snapshot | `admin-shell-mobile-390.png`, `admin-shell-long-copy-320.png`, `editorial-ledger-emergency-takedown-390.png` 크기·픽셀 불일치 |

실패 파일: `features/host/ui/approved-host-ledgers.ct.tsx` (6), `features/host/ui/operating-room/host-operating-room-responsive.ct.tsx` (5), `features/platform-admin/ui/admin-editorial-ledger.ct.tsx` (5), `features/platform-admin/route/admin-shell-layout.ct.tsx` (2).

### 3. cross-browser smoke FAIL 상세 (9건)

`admin-editorial-ledger-browser-smoke.spec.ts` 3개 테스트가 `chromium` / `firefox-admin` / `webkit-mobile-admin` 3개 project에서 모두 실패한다. Host workspace smoke는 통과했다.

- `오늘 할 일` heading이 2개로 해석되어 strict mode violation.
- `클럽` heading과 `운영 처리 기록` heading을 찾지 못함.
- `확인함` 버튼이 enabled 되지 않음.

### 4. focused E2E FAIL 상세 (7건 + 2 did not run)

- `admin-editorial-ledger-browser-smoke.spec.ts` 3건 (위와 같은 원인).
- `admin-today.spec.ts` 2건 — 운영 queue와 768px drill-in.
- `host-lifecycle-operating-room.spec.ts` 1건.
- `host-workbox-stage4.spec.ts` 1건 — `작업함` listitem이 40개를 기대하나 **4개**다. 이는 새 first-viewport 4건 cap과 기존 spec 기대치가 어긋난 것이다.

기존 Admin/Host E2E·CT spec이 새 밀도·disclosure 계약으로 갱신되지 않았다. 이 보고서는 이를 **미해결 잔여**로 기록한다.

## Step 2 — 18개 authority 산출물 검토

각 id마다 `<id>-reference.png`, `<id>-candidate.png`, `<id>-overlay.png`, `<id>-diff.png`, `<id>-report.json`을 확인했다. **18/18 artifact set이 5/5로 완전**하고 schema 필수 필드 누락이 없다. `mask`는 18/18 `null`이며 renderer fingerprint는 18/18 완전하다. `regions`가 빈 id는 없다.

| id | viewport | mismatchPixelRatio | vs 0.02 | major 4px 최대 | repeated 2px 최대 | 가로 overflow | 기본 노출 cap | geometry | typography | firstViewport | interactions | requestAudit | mask | artifacts | verdict |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin-today-desktop` | 1672×941 | 0.040485 | not_passed_0.02 | 0.00px | 없음 | 0px | 3/3 PASS | 5/5 | 4/4 | 3/3 | 4/4 | u0/e0/p0 PASS | null | 5/5 | fail |
| `admin-clubs-desktop` | 1672×941 | 0.048751 | not_passed_0.02 | 0.00px | 0.00px | 0px | n/a | 6/6 | 4/4 | 3/3 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `admin-service-desktop` | 1672×941 | 0.039769 | not_passed_0.02 | 0.00px | 0.00px | 0px | n/a | 5/5 | 4/4 | 3/3 | 2/2 | u0/e0/p0 PASS | null | 5/5 | fail |
| `admin-records-desktop` | 1672×941 | 0.030981–0.031964 | not_passed_0.02 | 0.00px | 0.00px | 0px | n/a | 5/5 | 4/4 | 2/2 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `admin-space-switcher-desktop` | 1672×941 | 0.050846 | not_passed_0.02 | 1.00px | 없음 | 0px | n/a | 5/5 | 4/4 | 3/3 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `admin-today-mobile` | 390×844 | 0.056522 | not_passed_0.02 | 1.00px | 1.00px | 0px | 3/3 PASS | 5/5 | 4/4 | 3/3 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `admin-work-detail-mobile` | 390×844 | 0.064735 | not_passed_0.02 | 2.05px | 없음 | 0px | n/a | 5/5 | 4/4 | 3/3 | 1/1 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-prep-desktop` | 1536×1024 | 0.064720 | not_passed_0.02 | 2.34px | 없음 | 0px | 4/4 PASS | 8/8 | 5/5 | 4/4 | 4/4 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-live-desktop` | 1536×1024 | 0.065125 | not_passed_0.02 | 2.34px | 없음 | 0px | 4/4 PASS | 8/8 | 5/5 | 4/4 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-closing-desktop` | 1536×1024 | 0.066710 | not_passed_0.02 | 2.34px | 없음 | 0px | 4/4 PASS | 8/8 | 5/5 | 4/4 | 4/4 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-meetings-desktop` | 1536×1024 | 0.047223 | not_passed_0.02 | 0.41px | 없음 | 0px | n/a | 5/5 | 5/5 | 3/3 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-people-desktop` | 1536×1024 | 0.060568 | not_passed_0.02 | 0.73px | 없음 | 0px | n/a | 5/5 | 4/4 | 3/3 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-records-desktop` | 1536×1024 | 0.051338 | not_passed_0.02 | 0.44px | 없음 | 0px | n/a | 5/5 | 4/4 | 2/2 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-settings-desktop` | 1536×1024 | 0.047317 | not_passed_0.02 | 0.41px | 없음 | 0px | n/a | 5/5 | 4/4 | 2/2 | 2/2 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-schedule-review-desktop` | 1536×1024 | 0.076399 | not_passed_0.02 | 0.41px | 없음 | 0px | n/a | 5/5 | 4/4 | 3/3 | 1/1 | u0/e0/**p1** PASS | null | 5/5 | fail |
| `host-prep-mobile` | 390×832 | 0.130747 | not_passed_0.02 | 0.66px | 없음 | 0px | 3/3 PASS | 7/7 | 4/4 | 4/4 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-live-mobile` | 390×832 | 0.141802 | not_passed_0.02 | 0.64px | 없음 | 0px | 3/3 PASS | 8/8 | 4/4 | 5/5 | 3/3 | u0/e0/p0 PASS | null | 5/5 | fail |
| `host-person-mobile` | 390×832 | 0.079076 | not_passed_0.02 | 0.47px | 없음 | 0px | n/a | 5/5 | 3/3 | 3/3 | 2/2 | u0/e0/p0 PASS | null | 5/5 | fail |

`requestAudit`는 18/18에서 unmatched 0건, effecting 0건이다. `host-schedule-review-desktop`만 preview 1건을 기록하며, 이는 검증된 POST preview 하나이고 confirm/send 요청은 없다.

### id별 hash·검토자 receipt

아래 hash는 **두 번째(최신) docker 실행의 첫 시도(attempt 0)** `<id>-report.json`에서 그대로 읽은 값이다. 값을 만들어 쓰지 않았다. Renderer fingerprint는 18/18 동일하므로 §Source binding의 한 줄을 공유한다: `mcr.microsoft.com/playwright:v1.61.1-jammy`, Chrome/149.0.7827.55, Playwright 1.61.1, Node 24.17.0, pnpm 11.13.1, DPR 1, Pretendard Variable.

| id | referenceSha256 | candidateSha256 (attempt 0) | 재시도 간 candidate 안정성 | mask | 검토자 |
| --- | --- | --- | --- | --- | --- |
| `admin-today-desktop` | `5d4d778850e45bce7449002c186ccea6fa7f830d1cee76ff38a904b1971ea76b` | `fa2d1042242ac65f279b55077c69a2d374c2e207bfa14d7e231624de86bff572` | 3시도 중 2종 (비율 동일) | null | `pending_controller_whole_branch` |
| `admin-clubs-desktop` | `273f2fbfc4df955ce837b0120cb9b518f10991be546c218d707ded9a32d67c91` | `6d5edc4a9d85129849e28289329a7e431a9c6b187435b27f223f1cd8e12af941` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `admin-service-desktop` | `6b6af23ba5eb6b25437d5ff2bdbe50f9d9dcbf8e62092705ed28485a1a584b2b` | `2428bbd90042c7d5787d619da410bfb4da9af198f3096f314561decf2a61b54d` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `admin-records-desktop` | `0d318e14a7757e279cb4595a3bfc299335a6262a95edf23ed5c719b62940cbd3` | `767078ccbd0a080ff858fc38ba84f55b75c3946b5dc39272ae61f4d11bd9d477` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `admin-space-switcher-desktop` | `dfc9222888cf41cdd4f0e3c03c260be349f5fe3120068486f0151fc1a07578a8` | `cfba80010de5ac4e1016b4e880f3b7091592f125f91c97862c039838165f0b37` | 3시도 중 2종 (비율 동일) | null | `pending_controller_whole_branch` |
| `admin-today-mobile` | `c3171752bfd56d7957dea6cfb06f4031692113024a0bf3b2bcc452f61b6d9aeb` | `71ee11d5322f9e8f719a3bf751d76ad37fce55999fd5b7ecacbd8e5a3b8d3c68` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `admin-work-detail-mobile` | `a6098cbb77c991197e7e03e2b803438342a66daad3d83c46b2dc74b90de16291` | `ba97bbf61b8f88684a9f8fe8d485ad92190023ac95ac54e467fd0f613edf358f` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-prep-desktop` | `fc5f8fd00301d90f3616c335306ca9cf99c59293589841ca3601afdbb04c25a9` | `37e2912ed0ea56610285064c9a816eed776856e85554d8a68c0eec61a9e2cc6c` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-live-desktop` | `9a0b50081506f266eccff15606e2e74da0b926b699166d9ce56020c8b263ff15` | `6626951af01722a55d385409da8fedbbe61584d961a07869b4c2ebe3fcdb1a11` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-closing-desktop` | `be94c7e1adc587d27c6f5e37b2a2f61f658d47e067b44961f8bb6e527542ac08` | `4a3f69cd51da85d08402230b9ea0563f67381e956e6ade533ebd01be04464f0c` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-meetings-desktop` | `7385c5f2369be3b3fcbfe7a87f737a4325802890e3dff2d9892161e0eed28f94` | `d90c57ea41ca42aee92d5d4fa1da39deeedbff257de39aa65f8259b72e40bf45` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-people-desktop` | `a1b2afb663cc9cdf304563f189bc2306908eb9da28cb3da9cd94d47ba908c50f` | `1e28fcb52093577b7dfc54f55b2d9e340ccab22dc294f177926d517e60391d80` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-records-desktop` | `8ca899b88148f9491149017653d7d71e8b8d34642f4f8b92c794b5f3717254cf` | `04e3861d1ff2139f7b731d36db08bcb43fcaa5dc83e0d349f2716d6689b28ae8` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-settings-desktop` | `80cb99506f90337660fcf42857d5f556e8a92a9932cf0e3f9f15e39180675b95` | `40f22e048c4089a2ec9a721e3861885b1a5bb7d9544025aa0ec44da5963704eb` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-schedule-review-desktop` | `ca58ef916dd5487dca5811f395ed44792febfa86a4c3bf60f4bd5f9333a0bd61` | `00e9cbf1497063d238120fcd1f37a6028b44a0d5dc60a4075dc50caa11d9bf31` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-prep-mobile` | `fde68389cc111e6c9cfe06543a50ac749cca937f65f3cd4f07d7369796e3ec3a` | `b92b272487aa2ea7a7a6815bd1a0ed60c32c8cebf8eea6d4870f5d075943436c` | 3시도 동일 | null | `pending_controller_whole_branch` |
| `host-live-mobile` | `b3fd160481039d28857ee9de88593c897f4ee9a51a19de99fb395453ee4e33d5` | `456dd2c10b041413116cf9210f258c5278a11b52cfc4fdb65bb46eeee513934e` | 3시도 중 3종 (비율 동일) | null | `pending_controller_whole_branch` |
| `host-person-mobile` | `12c542d4d409f2390c987acbb2c0bed886fa874bfe256f4fda8653df1afe44c5` | `01c8ea98b8f0a271fc629e61e3a777cb46d1cfbfa6b6da62c177a5bb75811a02` | 3시도 동일 | null | `pending_controller_whole_branch` |

`referenceSha256`는 18/18 manifest 값과 일치한다. `candidateSha256`는 실제 authenticated route capture의 hash이며 승인 reference와 같아지지 않는다(strict pixel이 18/18 `not_passed_0.02`이므로 당연하다).

**candidate byte 안정성 주의:** `admin-today-desktop`, `admin-space-switcher-desktop`, `host-live-mobile` 세 id는 같은 실행 안에서 재시도마다 candidate PNG byte가 달랐다. 세 id 모두 `mismatchPixelRatio`는 소수점 6자리까지 동일했으므로 측정값은 재현되지만 capture byte는 완전 결정적이지 않다. 이 값들을 immutable receipt로 쓰려면 원인(폰트 raster 타이밍 또는 PNG 인코딩 비결정성)을 먼저 확인해야 한다.

**보존 주의:** `front/test-results/`는 gitignore이며 `pnpm --dir front test:ct:docker`가 실행되면 지워진다. 위 hash는 저장소가 아니라 이 보고서가 보존하는 유일한 기록이다. 재생성하려면 `pnpm --dir front test:e2e:approved-routes:docker`를 CT 이후에 실행해야 한다.

읽는 법:

- **composition·geometry·typography·first viewport·interaction·request audit는 18/18 통과**했다. major region은 4px, 반복 정렬은 2px 안에 있고 가로 overflow는 0px다.
- **strict pixel은 18/18 `not_passed_0.02`다.** 이것은 PASS가 아니다. 18/18 strict pixel PASS라고 주장하지 않는다.
- 잔여 비율은 승인 AI PNG와 Pretendard·icon raster 차이로 남아 있다. **0.10/0.15 ceiling을 복원하지 않았고 mask를 추가하지 않았다.** `verdict`는 18/18 `fail`이다.
- 두 차례 docker 실행에서 비율이 재현됐다. `admin-records-desktop`(0.030981/0.031964)과 `host-prep-mobile`(0.130747/0.130746)만 시도 간 미세 변동이 있었다.

### 독립 검토 상태

`independent_review: pending_controller_whole_branch`.

이 기록을 작성한 좌석은 산출물 schema·완전성·측정값을 기계적으로 감사했을 뿐, 자신이 구현에 관여한 slice를 스스로 시각 PASS로 승인할 수 없다. **18개 화면에 대한 구현자 좌석발 PASS를 기록하지 않는다.** 독립 시각 검토는 branch 전체 검토 단계에서 수행한다.

## Step 3 — 사람 30초 발견성

**`pending_external_human_evidence`.**

5인 participant가 역할당 30초, 구현 설명 없이 Admin 우선 업무와 `전체 보기`, Host 현재 단계와 다음 행동, 보조 목적지를 식별하는 측정을 하지 않았다. R1–R5 표를 채우지 않는다. 자동화 테스트나 AI 검토를 사람 증거로 대신 쓰지 않는다.

| reviewer | admin seconds/result | host seconds/result | disclosure seconds/result |
| --- | --- | --- | --- |

## Step 4 — 실제 브라우저 확대와 보조기술

| 항목 | 상태 |
| --- | --- |
| Chrome toolbar 200% — Admin Today desktop | `not_measured` |
| Chrome toolbar 200% — Host prep desktop | `not_measured` |
| VoiceOver with Safari | `not_measured` |
| NVDA with Chrome | `not_measured` |

실제 Chrome toolbar 확대에서 CSS viewport, scroll/client width, 주 행동, queue/작업함 disclosure, visible focus, screenshot을 측정하지 않았다. 자동화 stress의 200% proxy는 실제 toolbar 확대 측정이 아니다. VoiceOver/NVDA heading·landmark·state announcement·focus order도 측정하지 않았다.

## Step 5 — 원격 CI

**`pending_remote_ci`.**

push·merge·PR 생성 권한이 이 작업 범위에 없다. 원격 CI 실행 기록이 없다. 로컬 parity로 CI 성공을 추정하지 않는다.

## 의도한 차이

- Pixel gate 기본값은 18/18 `0.02` fail-closed다. threshold를 올리지 않았고 mask를 추가하지 않았다.
- Broad font-raster 예외 API(`allowFontRasterException`, `fontRasterExceptionMaxRatio`, `skipMismatchRatioAssertion`)는 코드에서 제거됐고 unit 검사가 재도입을 막는다.
- Admin Today는 우선 업무 3건을 기본 노출하고 초과분은 URL로 주소 지정되는 `전체 보기`로 이동한다.
- Host 작업함은 desktop 4건 / mobile 3건을 기본 노출하고 초과분은 `작업함 모두 보기`로 이동한다.
- Component CT와 tracked snapshot은 보조 회귀 근거이며 최종 승인 receipt를 만들지 않는다. `test:ct:approved` package script는 존재하지 않는다.
- 승인 PNG는 runtime image가 아니다. snapshot 갱신만으로 합격하지 않는다.

## 잔여 위험과 릴리스 경계

이 기록은 **full acceptance가 아니다.**

1. **strict pixel `not_passed_0.02` (18/18).** composition/geometry/typography/first viewport/interaction/request audit는 통과했지만 승인 AI PNG 대비 raster 잔여가 남는다.
2. **`pnpm --dir front lint` FAIL (error 4건).** 그중 하나는 제품 route 파일의 `react-hooks/refs`다.
3. **`test:ct:docker` FAIL (18건).** geometry·semantic·tracked snapshot이 새 composition과 어긋난다. snapshot을 갱신해 덮지 않았다.
4. **cross-browser smoke FAIL (9건)과 focused E2E FAIL (7건 + 2 did not run).** 기존 Admin heading/`확인함` 계약과 Host 작업함 40건 기대치가 새 밀도·disclosure 계약으로 갱신되지 않았다. `front/tests/e2e/host-authority-loss.spec.ts`는 focused set에 없어 **이번 수렴에서 실행하지 않았다.** 통과로 읽지 않는다.
5. **사람 30초 gate `pending_external_human_evidence`.**
6. **Chrome 200%·VoiceOver/Safari·NVDA/Chrome `not_measured`.**
7. **원격 CI `pending_remote_ci`.**
8. **Candidate capture가 byte 단위로 완전 결정적이지 않다.** `admin-today-desktop`, `admin-space-switcher-desktop`, `host-live-mobile` 세 id는 같은 실행의 재시도 간 candidate PNG hash가 달랐다(비율은 동일). immutable receipt를 주장하기 전에 원인을 확인해야 한다.
9. ADR-0053은 `Proposed`로 유지한다. 위 9개 항목 중 하나라도 열려 있으면 `Accepted`로 올리지 않는다.

API/BFF/server/deploy는 이 작업에서 바꾸지 않았다. 공개 저장소에 실제 회원 데이터·secret·private domain·로컬 절대 경로·OCID·token 형태 예시를 넣지 않았다. Playwright 산출물(`front/test-results/`, `playwright-report/`)은 gitignore이며 커밋하지 않는다.

릴리스 경계: 실제 authenticated route가 18개 reference 전부의 candidate가 됐고 broad raster 예외는 사라졌다. 그러나 strict pixel, lint, CT, cross-browser, focused E2E, 사람 gate, 보조기술, 원격 CI가 열려 있다. **시각 계약을 닫지 않으며 ADR-0053을 수락하지 않는다.**
