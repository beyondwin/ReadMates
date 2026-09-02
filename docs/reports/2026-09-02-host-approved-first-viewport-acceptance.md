# Host Approved First-Viewport Acceptance

작성일: 2026-09-03. 이 문서는 Task 10 자동화·독립 시각 검토 snapshot이다. 전체 수락이 아니다. ADR-0053은 `Proposed`로 남는다. 첫 화면 독립 시각 검토는 11/11 PASS-with-font-raster다. 사람 30초 5인 gate는 아직 `pending_external_human_evidence`다.

## Source binding

| 항목 | 값 |
| --- | --- |
| Branch | `codex/host-approved-first-viewport` |
| Review HEAD | `c84bfae73b186d34193e23ca4bb9410cfd7f430d` (`fix(front): put Host people names and prep-mobile workbox in first viewport`) |
| Spec | `docs/superpowers/specs/2026-09-02-host-approved-first-viewport-design.md` — 합격은 첫 화면 구성·카피·순서·펼침. `maxDiffPixelRatio` `0.02`는 측정값이지 합격 게이트가 아니다. |
| ADR-0053 | `Proposed` — Accept하지 않는다 |
| Manifest | `front/tests/e2e/support/approved-mockup-manifest.ts` |
| `maxDiffPixelRatio` | 모든 Host 11 id에서 **0.02** (manifest를 올리지 않음) |
| Font-raster ceiling | Host desktop `0.10`; `host-prep-mobile` / `host-live-mobile` / `host-person-mobile` `0.15` |
| Reviewer | Tasks 2–9를 구현하지 않은 독립 검토자 |

재점수 두 id의 `referenceSha256`는 manifest와 일치했다. 나머지 9 id SHA는 이전 `test:ct:approved` snapshot과 같다. JSON `regions`는 비어 있지 않다.

| id | role | reference | sha256 |
| --- | --- | --- | --- |
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
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/approved-host-ledgers.ct.tsx --project=chromium -g "people ledger"
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test --config=playwright-ct.config.ts features/host/ui/operating-room/host-operating-room-responsive.ct.tsx --project=chromium -g "prep locks the approved mobile operating room"
```

이 재점수는 위 두 focused CT만 다시 찍었다. 검토 전(skip-ratio): 각 1 passed. CT PASS를 시각 PASS로 읽지 않는다. 독립 검토가 두 id의 첫 화면 IA를 합격한 뒤에만 `allowFontRasterException: true`와 `skipMismatchRatioAssertion: false`를 켰고, 예외 켠 뒤 같은 두 명령을 재실행했다: 각 1 passed (people 0.058909 < 0.10, prep-mobile 0.132047 < 0.15). 이전 9/11 IA-pass id의 비율·geometry는 기존 `test:ct:approved` snapshot을 유지한다. `front/test-results/`와 `playwright-report/`는 gitignore이며 커밋하지 않는다.

## Automated visual results (Host 11 entries)

**0.02 대비는 11/11 FAIL**이다. 독립 검토가 첫 화면 구성을 합격한 11 id만 `allowFontRasterException: true`와 `skipMismatchRatioAssertion: false`다. manifest `maxDiffPixelRatio`는 0.02로 유지한다. `host-people-desktop` / `host-prep-mobile` 재점수 전에는 skip-ratio였고, 첫 화면 IA 합격 뒤에만 폰트 예외를 켰다.

| id | mismatchPixelRatio | vs 0.02 | CT after review flags | ceiling | geometry | parked note |
| --- | ---: | --- | --- | ---: | --- | --- |
| `host-prep-desktop` | 0.058926 | FAIL | PASS (font exception) | 0.10 | body/workbox ≤1px (4px) | font/icon raster vs AI PNG after IA pass |
| `host-live-desktop` | 0.059577 | FAIL | PASS (font exception) | 0.10 | body/workbox ≤1px (4px) | font/icon raster vs AI PNG after IA pass |
| `host-closing-desktop` | 0.061112 | FAIL | PASS (font exception) | 0.10 | body/workbox ≤1px (4px) | font/icon raster vs AI PNG after IA pass |
| `host-meetings-desktop` | 0.045867 | FAIL | PASS (font exception) | 0.10 | header 0px; nav ≤0.46px; main ≤0.27px (4px) | font/icon raster vs AI PNG after IA pass |
| `host-people-desktop` | 0.058909 | FAIL | PASS (font exception) | 0.10 | header 0px; nav ≤0.46px; main ≤0.43px (4px) | font/icon raster vs AI PNG after IA pass |
| `host-records-desktop` | 0.053579 | FAIL | PASS (font exception) | 0.10 | header 0px; nav ≤0.46px; main ≤0.13px (4px) | font/icon raster vs AI PNG after IA pass |
| `host-settings-desktop` | 0.045520 | FAIL | PASS (font exception) | 0.10 | header 0px; nav ≤0.46px; main ≤0.21px (4px) | font/icon raster vs AI PNG after IA pass |
| `host-schedule-review-desktop` | 0.074489 | FAIL | PASS (font exception) | 0.10 | header 0px; nav ≤0.46px; main ≤0.32px (4px) | font/icon raster vs AI PNG after IA pass |
| `host-prep-mobile` | 0.132047 | FAIL | PASS (font exception) | 0.15 | nav 0px; main ≤0.07px (4px) | font/icon raster vs AI PNG after IA pass; host-mobile ceiling |
| `host-live-mobile` | 0.139196 | FAIL | PASS (font exception) | 0.15 | nav 0px; main/board ≤0.16px (4px) | font/icon raster vs AI PNG after IA pass; host-mobile ceiling |
| `host-person-mobile` | 0.083719 | FAIL | PASS (font exception) | 0.15 | header ≤0.10px; nav 0px; main ≤0.27px (4px) | font/icon raster vs AI PNG after IA pass; host-mobile ceiling |

측정된 major region 최대 delta는 모두 4px 이내였다. JSON `regions: []`인 Host id는 없다. 비율은 0.02를 넘지만 IA-pass 11 id는 각 capture ceiling 이하다. 아래 독립 검토는 parked font-raster exception을 **11/11**에 인정한다.

## Geometry and accessibility results

이번 `test:ct:approved` 74통과 안에 포함된 자동화 계약:

- Host desktop 운영실 body/workbox locator geometry가 4px 이내.
- Host ledger/person header/nav/main과 Host mobile nav/main/board가 등록되어 4px 이내.
- Host 운영실 semantic order `현재 모임 → 단계 → 다음 행동 → 준비 현황 → 작업함`.
- Host 작업함 기본 행에서 보류 combobox 0개; `세부 조작` disclosure 뒤에 둔다.
- 320–1440 중간 폭: 가로 overflow 없음, 44px target(live compact 출석 choice 40px / undo 36px leftover), wrapping, visible focus, reduced motion (approved script가 실행한 CT 파일 범위).

키보드·focus·44px·reduced motion은 CT 자동화다. VoiceOver/NVDA 수동 증거는 아래 Manual assistive technology 절.

## Independent visual review

상태: **PASS-with-font-raster (11/11)**. 구현 슬라이스를 작성하지 않은 검토자가 Host 11개 전부 reference, candidate, 50% overlay, diff, JSON region delta를 봤다. 11/11 artifact set이 있고 `referenceSha256`는 manifest와 같다. JSON region은 11/11 비어 있지 않고 4px 이내. Pixel 0.02 FAIL는 spec FAIL가 아니다. `host-people-desktop`과 `host-prep-mobile`은 FAIL fix 뒤 같은 검토자가 다시 점수했다.

**11/11 PASS-with-font-raster.** 첫 화면 IA/copy/order/disclosure는 승인 PNG와 맞다. parked CT font-raster exception은 11 id에 적용한다. 사람 30초 5인 gate와 ADR-0053 Accept는 이 점수로 닫지 않는다.

| id | verdict | reason |
| --- | --- | --- |
| `host-prep-desktop` | PASS-with-font-raster | 운영실·준비실 selected, 표지 셀, `모임 정보`/`일정 편집`/`변경 이력`, 주 행동 `대상과 문구 검토`, 준비 현황 4행+icons/`보기`, 채워진 작업함 4행. 보류는 접힘(스펙). leftover는 Pretendard/icon halo, BookCover fallback(named), `작업함` vs `호스트 작업함`, `자세히 보기` vs `멤버 보기`. |
| `host-live-desktop` | PASS-with-font-raster | 현장 selected, 주 행동 `출석 확인 시작`/`모임 진행 보기`, mockup 08 현장 현황 원장, 출석 미확인 작업함. 3버튼 출석판 없음. leftover는 font/icon raster + 표지 fallback. |
| `host-closing-desktop` | PASS-with-font-raster | 마감실 selected, 주 행동 `기록 초안 검토`, 마감 현황 1–5와 `보기`, 채워진 작업함. 보류 접힘. leftover는 font/icon raster, `일정 편집` vs mockup `기록 미리보기`. |
| `host-meetings-desktop` | PASS-with-font-raster | 일정과 모임 selected, 목록/달력, 전체/준비 중 칩, 예정·지난 행, 시안과 같은 책 제목. leftover는 목록/달력 boxed vs underline, `새 모임 만들기` 본문 버튼, footer `말소된 모임 보기` 미노출, font halo. |
| `host-people-desktop` | PASS-with-font-raster | 사람 selected, `이름으로 찾기`, 칩, `가입 승인 대기 2명`, `가입 승인 검토`, 원장 열. 대기 이름 윤서진/최도윤과 원장 이름(김하늘·박서윤·이도현·정수아·한지우·오민재), 관리 `열기`가 1536×1024 안에 보인다. leftover는 초대 경로 빈 칸(named), `열기` 텍스트(chevron 없음), 열 아이콘 부재, 검토 outline 버튼, font halo. |
| `host-records-desktop` | PASS-with-font-raster | 기록 selected, 다음 행동 카드, 5행 기록 원장, `마감실 열기`, 마감 작업 항목. leftover는 다음 행동 카드가 전폭이 아님, footer 게시 이력, chip pills, font halo. 출석/소감/피드백 칸은 named exception. |
| `host-settings-desktop` | PASS-with-font-raster | `초대와 설정` current, `새 초대 링크`, 활성/만료 예정/중지 테이블, 클럽 설정 행, `클럽 운영 종료`. leftover는 `새 초대 링크`가 hero 버튼이 아니라 칩, `revision`/`설정 저장`, 복사 없음(named), font halo. |
| `host-schedule-review-desktop` | PASS-with-font-raster | 운영실 current, 두 열 대상·문구, `4명에게 안내 보내기`가 1536×1024 안에 있음. 겹침/한 열 붕괴 없음. leftover는 heading `일정 미열람 검토` vs PNG `일정 미열람 안내`. 변경 내용 / 최근 접속 / 보류는 named empty cells. |
| `host-prep-mobile` | PASS-with-font-raster | 표지, `멤버 시야`, 주 행동 `대상과 문구 검토`, 01–04, 하단 내비. 채워진 `지금` 행(일정 미열람 확인, 가입 승인 검토)이 390×832 탭 바 위에 있다. leftover는 작업함 제목 클립, 세 번째 `지금` 행/`작업함 모두 보기`가 탭 바에 가림, `자세히 보기` vs chevron, `지금 4+`, 보류 접힘(스펙), BookCover fallback, font halo. |
| `host-live-mobile` | PASS-with-font-raster | 3버튼 출석판, 8/12·확인 필요 3·나머지 3명, 시안 인원/avatar/`진행 중`/`멤버 시야`, 하단 내비, bulk/undo가 첫 viewport 안. leftover는 버튼 내부 check/X/? glyph, 표지 fallback, 운영실 house vs pen icon, font halo. **a11y leftover:** live compact choice 40px, undo bar 36px. 44px로 올리면 mockup-16 closer(7행·bulk·undo)가 탭 바 아래로 밀린다. 이 보드의 모든 390 control이 44px라고 주장하지 않는다. |
| `host-person-mobile` | PASS-with-font-raster | `← 사람 목록으로`, FOLIO/tenure, 01–04 현재 일정/참석 응답/실제 출석/멤버십, 하단 내비 사람 selected. 멤버 `내 클럽` 홈 셸이 아니라 Host person destination. leftover는 club switcher `내 클럽` 라벨, 책 제목/seen-revision named empty cells, font halo. |

공통 leftover (FAIL 사유 아님): club switcher `내 클럽` vs PNG `읽는사이 · 호스트 운영실`; 온실 표지 BookCover fallback(named); Pretendard·icon halo vs AI PNG.

## 30-second comprehension results

사람 5인 gate는 **`pending_external_human_evidence`**. 표에 R1–R5 사람을 채우지 않는다. AI dry-run은 사람 증거가 아니다. 이 절이 사람 측정 없이 비어 있는 동안 전체 수락을 주장하지 않는다.

질문:

1. Host: “현재 단계와 다음 행동은 무엇인가?”
2. Host: “필터 또는 보류 같은 보조 기능은 어디서 펼치는가?”

| reviewer | host seconds/result | disclosure seconds/result |
| --- | --- | --- |

## Intentional differences

- 픽셀 게이트 기본값은 0.02로 유지한다. threshold를 올리지 않았다. 독립 검토가 font-raster leftover로 인정한 것은 IA-pass 11 id다.
- Host 작업함 보류는 기본 접힌 disclosure다. PNG에 보류 버튼이 보여도 스펙 `보류는 접힘`을 따른다.
- Host live desktop 첫 viewport는 mockup 08 `PhaseStatusLedger`다. mockup 16 3-button attendance board는 mobile live에 둔다.
- Host live-mobile compact 출석 choice는 40px, undo bar는 36px다. 44px 복원은 mockup-16 closer를 탭 바 아래로 밀어 첫 viewport 계약을 깨므로 named leftover로 남긴다. `front/DESIGN.md`는 이 보드의 모든 390 control이 44px라고 주장하지 않는다.
- Named empty cells (FAIL 단독 사유 아님): Greenhouse BookCover fallback; pending 초대 경로; 출석/소감/피드백 facts 없음; invitation `복사` without sharePath; schedule-review 변경 내용 / 최근 접속 / 보류; person book titles / seen-revision.
- 승인 PNG는 runtime image가 아니다. tracked snapshot 갱신만으로 합격하지 않는다.

## Manual assistive technology evidence

| Case | Status |
| --- | --- |
| VoiceOver with Safari | `not measured` |
| NVDA with Chrome | `not measured` |

사람이 수행하기 전에는 `not measured`이며 passed로 보고하지 않는다.

## Residual risk and release boundary

이 보고서는 **full acceptance가 아니다.**

- 0.02 대비 11/11 FAIL. IA-pass 11 id의 CT PASS는 parked font-raster exception이다.
- Independent visual review는 **PASS-with-font-raster (11/11)**. `host-people-desktop`과 `host-prep-mobile` 재점수는 첫 화면 IA 합격이다.
- Host 첫 화면 구성 11/11은 맞다. 전체 수락은 아니다.
- 사람 30초 5인 gate는 `pending_external_human_evidence`. AI dry-run은 사람 증거가 아니다.
- ADR-0053은 `Proposed`. Accept하지 않는다.
- 이 재점수는 두 focused CT와 해당 capture flag·acceptance report만 만졌다. `lint` / 전체 `test` / `build` / `test:e2e` / `test:ct:approved` / public-release scanner는 돌리지 않았다. Task 11 범위다.
- API/BFF/server/deploy는 변경하지 않았다. 공개 저장소에 실제 회원 데이터·secret·로컬 절대 경로를 넣지 않았다. Admin 파일은 수정하지 않았다.

릴리스 경계: Host 11장 첫 화면 독립 시각 검토는 11/11 PASS-with-font-raster다. ADR-0053을 수락하지 않는다. 사람 30초 gate가 비어 있는 동안 전체 수락을 주장하지 않는다.
