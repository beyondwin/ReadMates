# Admin·Host Pixel Fidelity Acceptance

작성일: 2026-09-02. 이 문서는 Task 10 자동화 증거 snapshot이다. 전체 수락이 아니다. ADR-0053은 `Proposed`로 남는다.

## Source binding

| 항목 | 값 |
| --- | --- |
| Branch | `codex/admin-host-pixel-fidelity` |
| HEAD | `a5ed52721444ac9bd4de323c46fcb0ead4a6e0c3` (`fix(front): restore host continuity clicks and clubs overflow`) |
| Plan base | `19fd5a4ff6fcd078cf5f96b8c44191123d6bd5f4` |
| ADR-0053 | `Proposed` — Task 11은 사람 30초 gate가 비어 있는 동안 Accept하지 않는다 |
| Manifest | `front/tests/e2e/support/approved-mockup-manifest.ts` |
| `maxDiffPixelRatio` | 모든 18 id에서 **0.02** (manifest를 올리지 않음) |
| Font-raster ceiling | Admin·Host desktop `0.10`; `host-prep-mobile` / `host-live-mobile` / `host-person-mobile` `0.15` |

승인 PNG SHA-256는 이번 `test:ct:approved` report의 `referenceSha256`와 manifest가 일치했다.

| id | role | reference | sha256 |
| --- | --- | --- | --- |
| `admin-today-desktop` | admin | `design/mockups/2026-08-30-admin-operations-redesign/01-today-desktop.png` | `5d4d778850e45bce7449002c186ccea6fa7f830d1cee76ff38a904b1971ea76b` |
| `admin-clubs-desktop` | admin | `design/mockups/2026-08-30-admin-operations-redesign/02-clubs-desktop.png` | `273f2fbfc4df955ce837b0120cb9b518f10991be546c218d707ded9a32d67c91` |
| `admin-service-desktop` | admin | `design/mockups/2026-08-30-admin-operations-redesign/03-service-status-desktop.png` | `6b6af23ba5eb6b25437d5ff2bdbe50f9d9dcbf8e62092705ed28485a1a584b2b` |
| `admin-records-desktop` | admin | `design/mockups/2026-08-30-admin-operations-redesign/04-processing-records-desktop.png` | `0d318e14a7757e279cb4595a3bfc299335a6262a95edf23ed5c719b62940cbd3` |
| `admin-space-switcher-desktop` | admin | `design/mockups/2026-08-30-admin-operations-redesign/05-space-switcher-desktop.png` | `dfc9222888cf41cdd4f0e3c03c260be349f5fe3120068486f0151fc1a07578a8` |
| `admin-today-mobile` | admin | `design/mockups/2026-08-30-admin-operations-redesign/06-today-mobile.png` | `c3171752bfd56d7957dea6cfb06f4031692113024a0bf3b2bcc452f61b6d9aeb` |
| `admin-work-detail-mobile` | admin | `design/mockups/2026-08-30-admin-operations-redesign/07-work-detail-mobile.png` | `a6098cbb77c991197e7e03e2b803438342a66daad3d83c46b2dc74b90de16291` |
| `host-prep-desktop` | host | `docs/development/host-redesign-mockups/07-host-lifecycle-operating-room-approved.png` | `fc5f8fd00301d90f3616c335306ca9cf99c59293589841ca3601afdbb04c25a9` |
| `host-live-desktop` | host | `docs/development/host-redesign-mockups/08-host-operating-room-live-approved.png` | `9a0b50081506f266eccff15606e2e74da0b926b699166d9ce56020c8b263ff15` |
| `host-closing-desktop` | host | `docs/development/host-redesign-mockups/09-host-operating-room-closing-approved.png` | `be94c7e1adc587d27c6f5e37b2a2f61f658d47e067b44961f8bb6e527542ac08` |
| `host-meetings-desktop` | host | `docs/development/host-redesign-mockups/10-host-meetings-library-approved.png` | `7385c5f2369be3b3fcbfe7a87f737a4325802890e3dff2d9892161e0eed28f94` |
| `host-people-desktop` | host | `docs/development/host-redesign-mockups/11-host-people-ledger-approved.png` | `a1b2afb663cc9cdf304563f189bc2306908eb9da28cb3da9cd94d47ba908c50f` |
| `host-records-desktop` | host | `docs/development/host-redesign-mockups/12-host-records-ledger-approved.png` | `8ca899b88148f9491149017653d7d71e8b8d34642f4f8b92c794b5f3717254cf` |
| `host-settings-desktop` | host | `docs/development/host-redesign-mockups/13-host-invites-settings-approved.png` | `80cb99506f90337660fcf42857d5f556e8a92a9932cf0e3f9f15e39180675b95` |
| `host-schedule-review-desktop` | host | `docs/development/host-redesign-mockups/14-host-unread-schedule-review-approved.png` | `ca58ef916dd5487dca5811f395ed44792febfa86a4c3bf60f4bd5f9333a0bd61` |
| `host-prep-mobile` | host | `docs/development/host-redesign-mockups/15-mobile-host-operating-room-prep-approved.png` | `fde68389cc111e6c9cfe06543a50ac749cca937f65f3cd4f07d7369796e3ec3a` |
| `host-live-mobile` | host | `docs/development/host-redesign-mockups/16-mobile-host-live-attendance-approved.png` | `b3fd160481039d28857ee9de88593c897f4ee9a51a19de99fb395453ee4e33d5` |
| `host-person-mobile` | host | `docs/development/host-redesign-mockups/17-mobile-host-person-detail-approved.png` | `12c542d4d409f2390c987acbb2c0bed886fa874bfe256f4fda8653df1afe44c5` |

명령:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:approved
```

결과: **74 passed (6.9s)**. Playwright output의 18개 `*-report.json`을 이 표의 비율·geometry 근거로 사용했다. `front/test-results/`와 `playwright-report/`는 gitignore이며 커밋하지 않는다.

## Automated visual results (18 entries)

CT 게이트는 `allowFontRasterException` 때문에 18/18이 예외 ceiling 아래에서 통과했다. **0.02 대비는 18/18 FAIL**이다. leftover는 geometry/copy/disclosure 일치 이후 Pretendard·icon raster vs AI PNG로 park한다. manifest `maxDiffPixelRatio`는 0.02로 유지한다.

| id | mismatchPixelRatio | vs 0.02 | CT (exception) | ceiling | geometry | parked note |
| --- | ---: | --- | --- | ---: | --- | --- |
| `admin-today-desktop` | 0.036699 | FAIL | PASS | 0.10 | queue/docket 0px; recommended ≤0.24px (2px) | font/icon raster vs AI PNG |
| `admin-clubs-desktop` | 0.054106 | FAIL | PASS | 0.10 | header/nav 0px; finder/docket ≤1px; first-row ≤0.39px | font/icon raster vs AI PNG |
| `admin-service-desktop` | 0.043737 | FAIL | PASS | 0.10 | header/nav/table 0px; attention-row 0.47px | font/icon raster vs AI PNG |
| `admin-records-desktop` | 0.033425 | FAIL | PASS | 0.10 | header/nav 0px; list/docket 1px; first-row ≤0.20px | font/icon raster vs AI PNG |
| `admin-space-switcher-desktop` | 0.050164 | FAIL | PASS | 0.10 | header/nav/switcher 0px; menu 0.38px; account 0.50px | font/icon raster vs AI PNG |
| `admin-today-mobile` | 0.043302 | FAIL | PASS | 0.10 | header 0px; nav 1px; first-row 0.20px | font/icon raster vs AI PNG |
| `admin-work-detail-mobile` | 0.057311 | FAIL | PASS | 0.10 | back 0px; docket 0.05px; nav 1px | font/icon raster vs AI PNG |
| `host-prep-desktop` | 0.055856 | FAIL | PASS | 0.10 | body/workbox ≤1px (4px) | font/icon raster vs AI PNG |
| `host-live-desktop` | 0.056675 | FAIL | PASS | 0.10 | body/workbox ≤1px (4px) | font/icon raster vs AI PNG |
| `host-closing-desktop` | 0.058547 | FAIL | PASS | 0.10 | body/workbox ≤1px (4px) | font/icon raster vs AI PNG |
| `host-meetings-desktop` | 0.042098 | FAIL | PASS | 0.10 | JSON `regions: []` | font/icon raster vs AI PNG; no JSON region lock |
| `host-people-desktop` | 0.052569 | FAIL | PASS | 0.10 | JSON `regions: []` | font/icon raster vs AI PNG; no JSON region lock |
| `host-records-desktop` | 0.045518 | FAIL | PASS | 0.10 | JSON `regions: []` | font/icon raster vs AI PNG; no JSON region lock |
| `host-settings-desktop` | 0.046083 | FAIL | PASS | 0.10 | JSON `regions: []` | font/icon raster vs AI PNG; no JSON region lock |
| `host-schedule-review-desktop` | 0.062716 | FAIL | PASS | 0.10 | JSON `regions: []` | font/icon raster vs AI PNG; no JSON region lock |
| `host-prep-mobile` | 0.103080 | FAIL | PASS | 0.15 | JSON `regions: []` | font/icon raster vs AI PNG; host-mobile ceiling |
| `host-live-mobile` | 0.132187 | FAIL | PASS | 0.15 | JSON `regions: []` | font/icon raster vs AI PNG; host-mobile ceiling |
| `host-person-mobile` | 0.066113 | FAIL | PASS | 0.15 | JSON `regions: []` | font/icon raster vs AI PNG; host-mobile ceiling |

측정된 major/repeated region 최대 delta는 모두 4px / 2px 이내였다. 비율은 0.02를 넘지만 각 capture ceiling 이하다.

## Geometry and accessibility results

이번 `test:ct:approved` 74통과 안에 포함된 자동화 계약:

- Admin Today desktop 38:62 queue/docket과 Host desktop 68:32 body/workbox는 locator geometry가 4px 이내.
- Admin clubs/service/records/space-switcher의 header/nav와 등록된 2px 반복 영역이 tolerance 이내.
- Admin mobile header/nav/back/first-row가 4px/2px 이내.
- Host 운영실 semantic order `현재 모임 → 단계 → 다음 행동 → 준비 현황 → 작업함`.
- Admin heading `오늘 할 일`; 필터는 기본 접힘 (`필터와 신호 상태`).
- Host 작업함 기본 행에서 보류 combobox 0개; `세부 조작` disclosure 뒤에 둔다.
- 320–1440 중간 폭: 가로 overflow 없음, 44px target, wrapping, visible focus, reduced motion (approved script가 실행한 CT 파일 범위).
- nested live region 없음 (Today/Host shell CT).

Host `10–14`, `17`과 Host mobile prep/live는 comparison JSON에 region이 비어 있다. 해당 id의 4px/2px lock은 이 report만으로는 증명하지 못한다. 운영실 desktop만 JSON region을 남긴다.

키보드·focus·44px·reduced motion은 CT 자동화다. VoiceOver/NVDA 수동 증거는 아래 Manual assistive technology 절.

## Independent visual review

상태: `pending_controller_independent_review`.

이 Task 10 pass는 18개 각각에 대해 reference, candidate, 50% overlay, diff, JSON region delta를 독립 검토자가 끝까지 본 기록이 아니다. unreviewed exception을 PASS로 쓰지 않는다. 자동화 artifact는 Playwright `test-results/**/approved-mockup/`에 생성됐고 커밋하지 않았다.

## 30-second comprehension results

상태: `pending_external_human_evidence`.

다섯 명의 첫 사용자 30초 측정은 이 자동화 pass에서 수행하지 않았다. AI·구현자 dry-run은 사람 증거로 기록하지 않는다. 표에 R1–R5를 채우지 않는다. 이 절이 비어 있는 동안 전체 수락을 주장하지 않는다.

질문 (미실시):

1. Admin: “지금 가장 먼저 처리할 일은 무엇인가?”
2. Host: “현재 단계와 다음 행동은 무엇인가?”
3. Both: “필터 또는 보류 같은 보조 기능은 어디서 펼치는가?”

| reviewer | admin seconds/result | host seconds/result | disclosure seconds/result |
| --- | --- | --- | --- |

## Intentional differences

- 픽셀 게이트 기본값은 0.02로 유지한다. leftover는 geometry/copy/disclosure 이후 font/icon raster vs AI PNG로 park한다. threshold를 올리지 않았다.
- Admin Today 안전 조치 라벨은 제품 계약 `확인함` / `잠시 미룸` / `처리함`을 유지한다.
- Admin 필터·소스 상태와 Host 작업함 보류는 기본 접힌 disclosure다.
- Host live desktop 첫 viewport는 mockup 08 `PhaseStatusLedger`다. mockup 16 3-button attendance board는 mobile live에 둔다.
- Service operator health card는 DOM에 남기되 first viewport에서 clip한다.
- Host ledger/person 및 Host mobile prep/live comparison은 `regions: []`다.
- 승인 PNG는 runtime image가 아니다. tracked snapshot 갱신만으로 합격하지 않는다.

## Manual assistive technology evidence

| Case | Status |
| --- | --- |
| VoiceOver with Safari | `not measured` |
| NVDA with Chrome | `not measured` |

사람이 수행하기 전에는 `not measured`이며 passed로 보고하지 않는다.

## Residual risk and release boundary

이 보고서는 **full acceptance가 아니다.**

- 0.02 대비 18/18 FAIL. CT PASS는 parked font-raster exception이다.
- Independent visual review는 `pending_controller_independent_review`.
- 30초 5인 gate는 `pending_external_human_evidence`.
- ADR-0053은 `Proposed`. Task 11은 사람 gate가 비어 있는 동안 Accept하지 않는다.
- Host 9개 id는 JSON geometry lock이 없다.
- `CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct` (Docker, 175 tests / 1 worker)는 두 번 모두 vite build 직후 Playwright가 SIGKILL 되어 `exit 1`이었다 (~12s, ~19s). 175개 snapshot 비교는 완료되지 않았다. PASS로 기록하지 않는다.
- 이 Task는 `lint` / 전체 `test` / `build` / `test:e2e` / public-release scanner를 돌리지 않았다. Task 11 범위다.
- API/BFF/server/deploy는 변경하지 않았다. 공개 저장소에 실제 회원 데이터·secret·로컬 절대 경로를 넣지 않았다.

릴리스 경계: 자동화 비교 harness와 parked exception은 기록됐다. 사람 이해도 gate와 독립 overlay 검토가 끝나기 전에는 ADR-0053을 수락하거나 시각 계약을 닫지 않는다.
