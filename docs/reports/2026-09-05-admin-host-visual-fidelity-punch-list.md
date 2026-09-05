# Admin·Host visual fidelity punch list (2026-09-05)

비율은 측정값 그대로. 0.02 초과는 fail.

Phase 0 기준선. 관측은 `docs/superpowers/specs/2026-09-05-admin-host-visual-fidelity-next-slice-design.md` §4.2를 E/A/B/C/D·결함 열로 나눈 것이다. `0단계 ratio`는 Task 3 Jammy 재캡처 `summary.json`(`pct`)을 그대로 둔다. `1단계 ratio`와 `structure`는 Task 12b Jammy 재캡처 `summary.json`(`pct`, `structurePass`)을 그대로 옮겼다. `2단계`는 Task 18 host 5 id Jammy 재캡처 실측이다. `3단계`는 Task 21 admin 7 id Jammy 재캡처 `pct` / `structurePass`이다. `4단계`는 Task 27 전체 18 id Jammy 재캡처다. `summary.json`에 없던 `admin-records-desktop`·`host-records-desktop`은 같은 실행의 `report.json`에서 같은 `pct`/`structurePass` 공식으로 옮겼다.

| 칸 | 정의 | 조치 |
| --- | --- | --- |
| E | 구성 잔여 | 고친다 (A보다 먼저) |
| A | 시각 토큰 | 고친다 |
| B | 제품 예외(spec §6) | 유지 |
| C | 픽스처·데이터 | runtime PNG 고정 금지; fixture 결함만 고친다 |
| D | AI raster | PASS로 위장하지 않음 |
| 결함 | 즉시 잘못으로 보이는 것 | E/A 수정 또는 fixture 결함으로 처리 |
| structure | `structurePass` | `false`/`true` · fail/pass |

ADR impact: none (관측·비율 기록만). ADR-0045 update / ADR-0053 Proposed는 유지.

## 18장 분류표

| id | 시안 | E(구성) | A(토큰) | B | C | D | 결함 | 0단계 ratio | 1단계 ratio | 2단계 | 3단계 | 4단계 | structure |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `admin-today-desktop` | 01 | — | 활성 내비 파란 체크 아이콘, 페이지 제목 28→20 위계, 상태 띠 위치 | 공간 전환 크롬, `전체 10건 보기` | 배지 `3` vs `10` | — | — | 4.05 · fail | 4.1 · fail | — | 4.1 · fail / structure true | 4.1 · fail / structure true | true · pass |
| `admin-clubs-desktop` | 02 | Task 19 탭·facts·review 반영. 잔여: docket `h1`가 오른쪽 패인에 있어 document-order fail | clubs docket h1 32 vs typo 24; wordmark 20/700 vs 12/650; body-copy selector 없음 | — | 라이브 멤버/기록 사실은 `—`일 수 있음(Task 19). 클럽 수 | — | — | 4.88 · fail | 4.91 · fail | — | 5.43 · fail / structure true | 5.43 · fail / structure true | true · pass |
| `admin-service-desktop` | 03 | Task 20 전폭 상태 표·행 요약·`기술 정보 펼치기` 반영. 화면 rule `passed:true` | wordmark 20/700 vs 12/650; body-copy selector 없음 | — | — | — | — | 3.98 · fail | 4.1 · fail | — | 3.77 · fail / structure true | 3.77 · fail / structure true | true · pass |
| `admin-records-desktop` | 04 | Task 21 검색+기간+상태 아이콘 행+5 섹션+`기술 정보 펼치기`. 잔여: detail `h1`가 오른쪽 패인에 있어 document-order fail | wordmark 20/700 vs 12/650; page-title line-height 37.2 vs 31.2; body-copy selector 없음 | 기간 기본 `이번 주`(7d). 시안 `오늘`에 `?range=24h`를 붙이지 않음 | 시계/행위자는 실측 `14:52 · 운영자`(픽스처 occurredAt/역할). 기간 라벨은 제품 기본값 | — | — | 3.2 · fail | 3.2 · fail | — | 3.41 · fail / structure true | 3.41 · fail / structure true | true · pass |
| `admin-space-switcher-desktop` | 05 | — | 메뉴 위치·폭, 아이콘(체크·사람), 계정 크롬(이름 + `계정` + 아바타) | — | — | — | 계정 라벨이 아바타 원과 겹침 | 5.08 · fail | 5.07 · fail | — | 5.07 · fail / structure false | 5.07 · fail / structure false | false · fail |
| `admin-today-mobile` | 06 | — | 헤더 간격(브랜드·switcher·계정), 상태 배너 tinted 띠, 페이지 제목 36→28px, 행 아이콘 수직 정렬, 탭 바 아이콘 크기·무게 | `전체 10건 보기` | — | — | — | 5.65 · fail | 6.08 · fail | — | 6.08 · fail / structure false | 6.08 · fail / structure false | false · fail |
| `admin-work-detail-mobile` | 07 | — | 뒤로 chevron 무게, 제목 간격, 하단 `기술 정보 펼치기` 정렬. 가장 근접한 화면 | — | — | — | — | 6.47 · fail | 13.23 · fail | — | 13.23 · fail / structure false | 13.23 · fail / structure false | false · fail |
| `host-prep-desktop` | 07 | 크롬(§4.1). 워크박스 행(색 원형 아이콘 + 수량·기한 + 화살표, `세부 조작` 없음), rail 하단 이벤트 줄(`어제 19:30 자동 리마인드 전달됨 · 변경 이력`), 단계 탭 compact + 구분선, 준비 현황 열(항목·현황·세부 내용·관리)과 구체 액션 라벨(`멤버 보기` 등), 다음에 할 일 `내일 09:00까지 보류` secondary + 상태 줄. 결정 필요였던 H1 필드(§5.3: 책 제목) | — | — | D-3 vs D+3. 탭 `지금 N`은 제품 전체 건수(시안 07 `지금 4`는 fixture 4건) | — | 워크박스 행 텍스트 겹침(`1 기한 지남세부 조작`) | 6.47 · fail | 6.33 · fail | 6.53 · fail | — | 6.53 · fail / structure true | true · pass |
| `host-live-desktop` | 08 | prep과 같음 + 배지 `오늘`, 현장 현황 4행(실제 출석·참석 응답·진행 순서·현장 메모)과 액션. 사각지대: candidate의 다음에 할 일이 prep 내용(`일정 미확인 멤버 검토`) — `resolveNextAction` phase 반영 확인, live에서는 출석 확인 | — | — | — | — | 다음에 할 일이 prep 내용(사각지대) | 6.51 · fail | 6.38 · fail | 6.69 · fail | — | 6.69 · fail / structure true | true · pass |
| `host-closing-desktop` | 09 | 크롬(§4.1). 워크박스 행·rail 하단 | 단계 번호 원형, 상태 색, `기록 미리보기` 헤더 액션, 다음에 할 일 note 아이콘, `내일 18:00까지 보류` secondary | — | — | — | — | 6.67 · fail | 6.54 · fail | 6.91 · fail | — | 6.91 · fail / structure true | true · pass |
| `host-meetings-desktop` | 10 | `목록/달력` 아이콘 토글, 상태 탭 underline, 행 밀도(시안 1행 60px 내), 상태 dot + 문구, 요약 열 값, `총 N개의 모임 · 말소된 모임 보기` 푸터, 이번 달 timeline dot·선, `달력에서 보기` 행. 시안에 없는 것: 페이지 헤더 `새 모임 만들기`(헤더 `새 모임`이 있음), breadcrumb `호스트 · 예정과 기록` | — | — | No.28이 다가오는·지난 모임에 동시 표시 | — | No.28 중복 표시(C/결함) | 4.72 · fail | 4.8 · fail | — | — | 4.47 · fail / structure false | false · fail |
| `host-people-desktop` | 11 | 가입 승인 대기가 카드가 아닌 평면 표(아바타·이름·경로·시각·검토) + 우측 CTA, 멤버 원장 열(멤버·상태·최신 일정(아이콘)·참석 응답(아이콘)·최근 접속·함께한 기간·관리 `열기 ›`), 상태 pill 최소화(초록 배지 벽 금지), 우측 `현재 일정 확인` 4행 + `미열람 멤버 보기`, 하단 info 문장. 시안에 없는 것: 행 내 `이름 변경`·`모임 제외`·`…` 버튼, `세부 조작` | — | — | — | — | — | 6.06 · fail | 6.39 · fail | — | — | 5.51 · fail / structure false | false · fail |
| `host-records-desktop` | 12 | 상태 탭 underline + 색 카운트, `내보내기` 아이콘, 다음 마감 배너(! 아이콘·3줄·CTA), 원장 열 값 색(작성 중·확인 필요·마감 필요), 우측 `마감 작업` 워크박스 행 3개(요약 카운트 아님), 하단 `게시 이력` 줄 | — | — | 출석·소감 `—` | — | — | 5.13 · fail | 5.3 · fail | — | — | 5.3 · fail / structure false | false · fail |
| `host-settings-desktop` | 13 | `새 초대 링크` 페이지 헤더 CTA(탭 행 아님), 초대 링크 탭 underline + 카운트, 링크 표 밀도·관리 열 구분선, 하단 `만료·중지된 링크 보기` + 이벤트 줄, 클럽 설정 행 밀도, `클럽 운영 종료` 행 + chevron. 시안에 없는 것: `revision 4`, `설정 저장`, `종료 검토`, `세부 조작` | — | — | — | — | — | 4.73 · fail | 4.87 · fail | — | — | 4.09 · fail / structure true | true · pass |
| `host-schedule-review-desktop` | 14 | E(전면): breadcrumb `운영실 / 일정 미열람 확인`, 제목 `일정 미열람 안내`, `현재 일정 revision · 변경 시각` 줄, `변경 내용` diff 표(시작 시간 →, 장소, 사유), 대상 표(헤더 체크박스·이름·최신 일정 상태·최근 접속, `전체 선택`, `제외된 N명 보기`), 우측 제목/본문 필드 + `72 / 140` 카운터 + `변경 내용 포함` 체크, `N명에게 안내 보내기` + `내일 09:00까지 보류`, `취소하고 운영실로`, info 문장, 하단 이전 안내 줄 | — | — | — | — | — | 7.64 · fail | 7.87 · fail | — | — | 6.6 · fail / structure true | true · pass |
| `host-prep-mobile` | 15 | 크롬(§4.1 모바일). 헤더(표지 이미지·책 제목·D-3·아이콘 facts·`멤버 시야`), 준비 현황 행(번호·아이콘·항목·값+설명·chevron, `자세히 보기` 없음), 다음에 할 일 텍스트 CTA + 보류, 워크박스 제목 `호스트 작업함` + 탭 + 행 아이콘, 탭 바 아이콘 | — | 출석 1행 캡 유지. firstViewport 3행 중 2행만 교차(3번째 행은 뷰포트 하단, B 아님) | — | — | — | 13.08 · fail | 12.97 · fail | 12.36 · fail | — | 13.25 · fail / structure true | true · pass |
| `host-live-mobile` | 16 | Task 18 fix: 선택 컨트롤은 아이콘+`choice.label`. `현장 운영` kicker, `출석 확인`, `진행 순서 보기 ›`, 토스트는 목록 다음. 남은 E: 헤더 밀도·3번째 작업함 행 firstViewport | 동 E/A 항목의 토큰·정렬. `phase-label` 14/600 크기는 맞음, 색만 fail | 출석 1행 + `출석 N명 모두 보기`(시안 16 여러 행에 맞추지 않음) | 배지 `진행 중` vs 시안-08 `오늘`. questions `{ state: "absent" }` 카운트 미배선(6개/분모는 CT 픽스처만) | — | 헤더 `을지로 북살롱`과 `멤버 시야` 겹침 잔여 가능; 다음에 할 일이 prep 내용 | 14.18 · fail | 14 · fail | 13.84 · fail | — | 13.84 · fail / structure true | true · pass |
| `host-person-mobile` | 17 | Task 27: `← 사람`, 108px 아바타, `FOLIO`/`…` more, 섹션 01–04 아이콘. 라이브는 API에 없는 folio 번호·tenure·가입 경로·세션 링크를 생략 | — | — | CT만 `FOLIO · 017` / `11개월` / 책 제목. 라이브는 `FOLIO`와 payload 사실만 | — | — | 7.91 · fail | 8.2 · fail | — | — | 7.29 · fail / structure true | true · pass |

## 0단계 요약

- Pixel mismatch: **18/18 fail** (모두 `pct` > 0.02).
- Structure contract: **18/18 `structurePass: false`**.
- 이후 Phase 재캡처 시 해당 단계 비율·`structure` 열만 갱신한다. 이미지는 커밋하지 않는다.

## 1단계 요약

Task 12b Jammy 재캡처 (`DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker`). Playwright **18 failed** (strict pixel, 모두 `pct` > 0.02). `summary.json` `pct`/`structurePass`를 `1단계 ratio`/`structure`에 그대로 옮김.

- Pixel mismatch: **18/18 fail**. 0단계 대비 비율 이동: **11/18 worse**, 6 improved, 1 flat. 큰 이동은 `admin-work-detail-mobile` 6.47 → 13.23 (상세에 셸 헤더·상태 띠가 남음).
- Structure contract: **1/18 `structurePass: true`** (`admin-today-desktop`만). 화면별 rule RED는 Phase 2–4 정상.
- 공유 크롬 rule(`nav-icons`, `header-status`, `utility-*`, `mobile-*`, `workbox-row-*`, `no-detail-ops-leak`): 해당 id 전부 `passed:true` (재캡처 후 구현 수정 없음). `workbox-footer`는 `workbox-row-*`가 아니며 운영실 화면별 잔여(Phase 2).

Phase 2 carry (Task 14, Task 18 fix 재실측): geometry는 갱신. `typo("phase-label", 14px/600)`는 desktop에서 17px/500–700으로 여전히 fail. mobile은 14/600/19.6 크기·무게는 맞고 색만 fail. `work-item-title`은 `__label` 클래스를 붙여 측정됨(이번 수신에서 typo fail 목록에 없음). 단계 탭 색·desktop 14px carry는 닫지 않음.

Task 17 C/A residue: 운영실 body grid는 `62fr / 38fr`이다. Task 18 실측은 1464px body에서 primary 908 / workbox 556이며 513px 열을 되돌리지 않았다.

## 2단계 요약 (Task 18 + fix round 1)

Jammy host 5 id (`READMATES_VISUAL_AUTHORITY_IDS=host-prep-desktop,host-live-desktop,host-closing-desktop,host-prep-mobile,host-live-mobile`). `DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker`. `summary.json` `pct`/`structurePass`를 `2단계`/`structure`(해당 5 id)에 그대로 옮김.

- Pixel mismatch: host 5/5 fail (모두 `pct` > 0.02). desktop workbox actual width 556, primary 908.
- Structure: host 5/5 `structurePass: true`. `HOST_OPERATING_ROOM` + 07·08·09·15·16 화면 rule `passed:true`. 1행 출석 보드 e2e actual `{19, 530, 352, 90}`.
- `defaultVisibleCount`: desktop 4/4. mobile expected 3, actual **2** (was 0). 3번째 행은 뷰포트 하단 — B로 재분류하지 않음.
- `geometryPass`/`typographyPass`: 5/5 false. phase-label·wordmark·page-title carry 유지.

CT this fix round: not re-run (Jammy host 5 only). Prior Task 18 full CT was 166/12.

## 3단계 요약 (Task 21)

Jammy admin 7 id (`READMATES_VISUAL_AUTHORITY_IDS=admin-today-desktop,admin-clubs-desktop,admin-service-desktop,admin-records-desktop,admin-space-switcher-desktop,admin-today-mobile,admin-work-detail-mobile`). `DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker`. `summary.json` `pct`/`structurePass`/`geometryPass`를 `3단계`/`structure`에 그대로 옮김.

- Pixel mismatch: admin 7/7 fail (모두 `pct` > 0.02). 기록 그대로 fail.
- Structure: 02·03·04 화면 rule 전부 `passed:true`. `structurePass` true: today-desktop, clubs, service, records. false: space-switcher, today-mobile, work-detail (Phase 1 잔여).
- Geometry: `ADMIN_LEDGER_*` list/docket and `ADMIN_SERVICE_TABLE_GEOMETRY` matched Jammy actuals ±2px (`260,86,537,855` / `797,86,875,855` / `378,110,1176,808`). Recapture `records-heading` failed (`817,139,835,37` vs actual `836.55,150.80,795.45,37.19`); remasured to `{ x: 837, y: 151, width: 795, height: 37 }`. clubs/service heading+table/evidence already within ±4px. today-desktop true. space-switcher·mobile 06–07 false. Did not re-run Jammy after heading remasure.
- CT verify: **163 passed, 15 failed**. Clubs / Service / Review audit desktop CT GREEN. Admin screenshot tests GREEN — `--update` not run (would rewrite host snapshots). Remaining fails: host ledgers/closing snapshots, space menu, today mobile header (Phase 1/4 / Task 29).

## 4단계 요약 (Task 27)

Jammy 18 id (`DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker`). Playwright **18 failed** (strict pixel, 모두 `pct` > 0.02). Pixel fail은 기록만. `summary.json` `pct`/`structurePass`를 `4단계`/`structure`에 그대로 옮김. `admin-records-desktop`(3.41 / true)·`host-records-desktop`(5.3 / false)는 `summary.json` 16/18만 있어서 같은 실행 `report.json`에서 동일 공식으로 채움.

- Pixel mismatch: **18/18 fail**.
- Structure true: person-mobile, settings, schedule-review, OR 5 id, admin today/clubs/service/records. Structure false leftover: meetings (`status-dot`, `footer-total`), people (`rsvp-icon`), records (live missing CT class names), admin space-switcher/today-mobile/work-detail.
- Geometry: host 6 ledger HEADER/NAV/MAIN from CT actuals; person + inner e2e regions from Jammy actuals ±4 round. Did not rewrite `HOST_PREP_*` / `HOST_LIVE_*` / `HOST_CLOSING_*` / attendance 1-row / workbox 4/3.
- CT verify: **168 passed, 10 failed**. Host ledger 6 + person-mobile GREEN. Leftover: diary-closed-768 (768×2427 vs 2430), 5 closing-board snapshots (~2–3px), admin space menu, today mobile header 132.59 vs 70, work-detail back, review-audit first-row. `--update` not run (not this screen’s intended E).

## CT 대기

검토자: Task 12b session / 2026-09-05. 실제 route `.tmp/visual-authority-compare/<id>/` reference·candidate와 나란히 본 뒤 Docker update mode로 갱신. Controller ratified `admin-shell-mobile-390.png` and `admin-shell-long-copy-320.png` on 2026-09-05 (visual inspection of Phase 1 shell chrome).

| 스냅샷 | 실제 route 대조 | 판정 |
| --- | --- | --- |
| `admin-shell-mobile-390.png` | `admin-today-mobile` reference/candidate. 시안·candidate 모두 ReadMates / `플랫폼 운영` / `계정` + 상태 띠 + 탭 아이콘. 기존 CT는 `다른 계정으로 로그인` 겹침·상태 띠 없음. | Phase 1 크롬 의도 변경. 갱신. |
| `admin-shell-long-copy-320.png` | 동일 모바일 크롬 어휘(워드마크·`플랫폼 운영`·`계정`·탭 아이콘). CT fixture는 알람 summary가 없어 상태 띠는 없음. 기존 스냅샷은 `다른 계정으로 로그인` 겹침. | Phase 1 크롬 의도 변경. 갱신. |
| `editorial-ledger-emergency-takedown-390.png` | 18장 승인 id 아님(워크벤치 CT). Task 9에서 이미 통과. 셸 크롬 없음. | 갱신 불필요(통과 유지). |

`run-ct-docker.ts`는 파일 필터/`--update-snapshots` 인자를 받지 않는다. 갱신은 `DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:update:docker`, 확인은 `... pnpm --dir front test:ct:docker`. Task 7 시맨틱 CT는 제품 크롬(`계정`, `accountNameVisible` 기본 false)에 맞춤. 갱신된 PNG는 `front/__screenshots__/features/platform-admin/route/admin-shell-layout.ct.tsx/` 아래 2장. `editorial-ledger-emergency-takedown-390.png`는 그대로 통과.

확인 결과: **156 passed, 21 failed**. 추적 스냅샷 3장은 통과. 남은 실패는 geometry/시맨틱이며 snapshot update로 닫히지 않음. `approved-route-geometry.ts`는 이 Task에서 갱신하지 않음(Admin 실측은 Phase 3, Host는 Phase 2·4).

| 구분 | 테스트 | 메모 |
| --- | --- | --- |
| geometry | `admin-editorial-ledger.ct.tsx` Today mobile list 390 | header 132.59 vs 70. 상태 띠 2행. Phase 3. |
| geometry | `admin-editorial-ledger.ct.tsx` Today case detail 390 | back y 132.59 vs 0. 상세에서 셸 헤더를 `:has()`로 숨기던 규칙 삭제. Phase 3. |
| geometry | `admin-shell-layout.ct.tsx` space menu | switcher `x=260 w=107` vs `x=188 w=160`. 헤더 그리드 260px 워드마크 열. |
| geometry | `approved-host-ledgers.ct.tsx` people/meetings/records/settings/schedule-review desktop | nav width 290 vs 235. Phase 1 유틸 크롬. Host geometry는 Phase 2·4. |
| geometry | `approved-host-ledgers.ct.tsx` person detail mobile | Host mobile geometry. Phase 4. |
| 시맨틱 | `host-operating-room-responsive.ct.tsx` 320–1440 + partial warning | `details.rm-host-work-item__secondary` 없음(Task 12 행 누출 제거). Phase 2. |
| geometry | 같은 파일 prep mobile / live attendance board | Task 18: CT main y 52·실측 height로 갱신. 통과. |

## smoke (Task 29)

Command: `READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:visual-authority-browsers`

21 tests (chromium both specs; firefox-host / webkit-mobile-host host-only; firefox-admin / webkit-mobile-admin admin-only). `CI=true` retries=2.

**As-is first run (before audit heading/focus selector land):** **15 passed, 6 failed.**

| fail | projects | cause |
| --- | --- | --- |
| Health is read-only evidence without commands | chromium, firefox-admin, webkit-mobile-admin | first `새로 확인` 36×48 (webkit 30×48) vs 44px. Heading/copy already matched (`서비스 건강` 없음, table `서비스 상태`, heading `AI 작업 대기열`). |
| Audit URL owns the review docket | same 3 | `getByRole("heading", { name: "처리 기록", level: 2 })` — list heading is page **h1** while detail is closed. Copy is `처리 기록`, not `운영 처리 기록`. |

Heading/copy selector fixes (did not loosen `approved-route-structure.ts`):

- Clubs: dropped `level: 1` on `클럽 찾기` (ready list is `h2`; 시안 02 has no page h1).
- Audit: dropped `level: 2`; after `목록으로`, focus is the row `button[data-audit-row]`, not the `listitem`.
- Today `level: 1` / `확인함` already GREEN (Task 28). Did not rewrite to mockup `다시 보내기 검토`.

**Second official run (committed smoke spec):** **16 passed, 3 failed, 2 flaky.**

- Failed: Health 44px leftover on the same 3 admin projects. Did not restyle table-cell `새로 확인` (not a heading/copy fix; not Task 18 CSS).
- Flaky (passed on retry): firefox-host workspace smoke; webkit-mobile-admin clubs `#admin-club-row-club-1` focus restore. Id still exists; did not start a fold fight.
- Audit GREEN after heading + row-control focus selector.
- Task 28 leftover `전체 처리 기록 보기` sticky-header intercept is `admin-today.spec.ts`, not this smoke suite.

## overlap CT (Task 29)

Helper: `front/tests/ct/support/expect-no-overlap.ts` (`expectNoTextOverlap`). Called from:

1. Workbox row — `host-workbox.ct.tsx` composition, locator = the work `listitem`.
2. Admin clubs header — `admin-editorial-ledger.ct.tsx` Clubs desktop, locator = `.admin-clubs-ledger__list-header`.
3. Admin shell header with space switcher open — `admin-shell-layout.ct.tsx` space menu test, locator = `.admin-shell__header` (not account-control CSS rewrite).

Command: `DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker`

**168 passed, 10 failed.** Full CT GREEN is not a gate. Overlap asserts did **not** add a new fail. Space-menu test still dies later on switcher geometry `x=260 w=107` vs `x=188 w=160` (Task 27 leftover). Live-route punch-list 결함 `admin-space-switcher-desktop` 계정 라벨 vs 아바타: this CT has `accountNameVisible=false`, so the helper did not throw that pair. Did not rewrite Admin shell chrome.

Same 10 leftover fails as Task 27 (selectors still match current DOM; raster/geometry only):

- `diary-closed-768` 768×2427 vs 2430
- 5 closing-board snapshots (~2–3px)
- admin space menu geometry
- Today mobile header 132.59 vs 70
- Today case-detail back y 132.59 vs 0
- Review-audit first-row height 46 vs 112

Did not `--update` snapshots. Did not loosen structure contract.

## 최종 게이트 (Task 30)

Commands are `CI=true npx --yes corepack@0.35.0 pnpm --dir front …` unless noted. Pixel 0.02 초과는 `not_passed_0.02`. `origin/main` 미푸시. 사람 30초 gate·VoiceOver/Safari·NVDA/Chrome·원격 CI는 `not measured`.

| 명령 | exit | 숫자 |
| --- | --- | --- |
| `pnpm --dir front lint` | 0 | 0 errors, 5 warnings |
| `pnpm --dir front test` | 1 | 5 failed / 4868 passed (4873). Leftover: producer-inventory timeout, schedule-review heading geometry unit vs recapture `{40,163,1456,38}`, host-session-editor 2, workbox=all still 4 items |
| `pnpm --dir front build` | 0 | production build |
| `vitest run tests/unit/frontend-boundaries.test.ts tests/unit/shell-chrome-guards.test.ts` | 0 | 2 files / 17 passed |
| `DOCKER_CONTEXT=colima-readmates-va … test:ct:docker` | 1 | **168 passed, 10 failed** (same HEAD as Task 29). Leftover raster/geometry only |
| `DOCKER_CONTEXT=colima-readmates-va … test:e2e:approved-routes:docker` | 1 | Playwright **18 failed**. Pixel **18/18 `not_passed_0.02`**. structurePass **12 true / 6 false** |
| focused E2E trio chromium `--retries=0` | 1 | **4 passed, 3 failed, 5 did not run**. Fails: Today `전체 처리 기록 보기` sticky header intercept; lifecycle + workbox-stage4 H1 still assert meeting title (product H1 is book title) |

Jammy `summary.json` `pct` (records 두 id는 같은 실행 `report.json` `mismatchPixelRatio`×100): today-desktop 4.1, clubs 5.43, service 3.77, records 3.41, space-switcher 5.07, today-mobile 6.08, work-detail 13.23, prep-d 6.53, live-d 6.69, closing-d 6.91, meetings 4.47, people 5.51, host-records 5.30, settings 4.09, schedule-review 6.6, prep-m 13.25, live-m 13.84, person-m 7.29. All `not_passed_0.02`.

structurePass true: admin today/clubs/service/records desktop, host OR 5 id, settings, schedule-review, person-mobile. false: space-switcher, today-mobile, work-detail, meetings (`status-dot`/`footer-total`), people (`rsvp-icon`), host-records (live missing CT class names).

E 잔여: clubs/records docket h1 document-order; host live next-action prep 내용; meetings No.28 leftover if still dual. A 잔여: wordmark 20/700 vs 12/650, phase-label color/size, space-switcher 계정 라벨 vs 아바타, today-mobile header 132 vs 70. B: 출석 1행, workbox 4/3, Today 3건, 공간 전환 크롬. C: live clocks/facts `—`, fixture counts. D: raster, 기록만. Pixel 18/18 fail은 merge blocker가 아님(spec).

갱신한 CT snapshot: Task 12b `admin-shell-mobile-390.png`, `admin-shell-long-copy-320.png` (controller ratified 2026-09-05). Task 30은 `--update` 하지 않음.

