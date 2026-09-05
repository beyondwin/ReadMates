# Admin·Host visual fidelity punch list (2026-09-05)

비율은 측정값 그대로. 0.02 초과는 fail.

Phase 0 기준선. 관측은 `docs/superpowers/specs/2026-09-05-admin-host-visual-fidelity-next-slice-design.md` §4.2를 E/A/B/C/D·결함 열로 나눈 것이다. `0단계 ratio`는 Task 3 Jammy 재캡처 `summary.json`(`pct`)을 그대로 둔다. `1단계 ratio`와 `structure`는 Task 12b Jammy 재캡처 `summary.json`(`pct`, `structurePass`)을 그대로 옮겼다. 2–4단계 비율 열은 해당 Phase 재캡처 전까지 `—`.

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
| `admin-today-desktop` | 01 | — | 활성 내비 파란 체크 아이콘, 페이지 제목 28→20 위계, 상태 띠 위치 | 공간 전환 크롬, `전체 10건 보기` | 배지 `3` vs `10` | — | — | 4.05 · fail | 4.1 · fail | — | — | — | true · pass |
| `admin-clubs-desktop` | 02 | `클럽 찾기` 탭(전체·확인 필요·운영 중 + 카운트), 행 상태 문구, 운영 상태 facts 4개(아이콘·값), `확인할 내용` 섹션, 헤더 상태 문장, 내비 아이콘 | — | — | 클럽 수 | — | `새 클럽` 버튼이 제목 위에 겹침 | 4.88 · fail | 4.91 · fail | — | — | — | false · fail |
| `admin-service-desktop` | 03 | 제목 `서비스 건강`/`새로고침`/`최근에 바뀐 것` 패널 대신 시안의 전폭 상태 표(서비스·상태·마지막 확인·영향·조치·펼침), 펼친 행의 3열 요약(영향 범위·최근 정상 전달·복구 조치), 헤더 상태 문장 + `마지막 전체 확인`, `기술 정보 펼치기` 푸터 | — | — | — | — | — | 3.98 · fail | 4.1 · fail | — | — | — | false · fail |
| `admin-records-desktop` | 04 | 검색 아이콘, `오늘 ⌄` 기간 필터(날짜 범위 텍스트 대신), 행 상태 아이콘, 상세의 구조화 섹션(처리한 이유·영향 범위·변경 전·변경 후·처리 결과·기술 정보), 내비 아이콘 | — | — | 행 수 | — | — | 3.2 · fail | 3.2 · fail | — | — | — | false · fail |
| `admin-space-switcher-desktop` | 05 | — | 메뉴 위치·폭, 아이콘(체크·사람), 계정 크롬(이름 + `계정` + 아바타) | — | — | — | 계정 라벨이 아바타 원과 겹침 | 5.08 · fail | 5.07 · fail | — | — | — | false · fail |
| `admin-today-mobile` | 06 | — | 헤더 간격(브랜드·switcher·계정), 상태 배너 tinted 띠, 페이지 제목 36→28px, 행 아이콘 수직 정렬, 탭 바 아이콘 크기·무게 | `전체 10건 보기` | — | — | — | 5.65 · fail | 6.08 · fail | — | — | — | false · fail |
| `admin-work-detail-mobile` | 07 | — | 뒤로 chevron 무게, 제목 간격, 하단 `기술 정보 펼치기` 정렬. 가장 근접한 화면 | — | — | — | — | 6.47 · fail | 13.23 · fail | — | — | — | false · fail |
| `host-prep-desktop` | 07 | 크롬(§4.1). 워크박스 행(색 원형 아이콘 + 수량·기한 + 화살표, `세부 조작` 없음), rail 하단 이벤트 줄(`어제 19:30 자동 리마인드 전달됨 · 변경 이력`), 단계 탭 compact + 구분선, 준비 현황 열(항목·현황·세부 내용·관리)과 구체 액션 라벨(`멤버 보기` 등), 다음에 할 일 `내일 09:00까지 보류` secondary + 상태 줄. 결정 필요였던 H1 필드(§5.3: 책 제목) | — | — | D-3 vs D+3. 탭 `지금 N`은 제품 전체 건수(시안 07 `지금 4`는 fixture 4건) | — | 워크박스 행 텍스트 겹침(`1 기한 지남세부 조작`) | 6.47 · fail | 6.33 · fail | — | — | — | false · fail |
| `host-live-desktop` | 08 | prep과 같음 + 배지 `오늘`, 현장 현황 4행(실제 출석·참석 응답·진행 순서·현장 메모)과 액션. 사각지대: candidate의 다음에 할 일이 prep 내용(`일정 미확인 멤버 검토`) — `resolveNextAction` phase 반영 확인, live에서는 출석 확인 | — | — | — | — | 다음에 할 일이 prep 내용(사각지대) | 6.51 · fail | 6.38 · fail | — | — | — | false · fail |
| `host-closing-desktop` | 09 | 크롬(§4.1). 워크박스 행·rail 하단 | 단계 번호 원형, 상태 색, `기록 미리보기` 헤더 액션, 다음에 할 일 note 아이콘, `내일 18:00까지 보류` secondary | — | — | — | — | 6.67 · fail | 6.54 · fail | — | — | — | false · fail |
| `host-meetings-desktop` | 10 | `목록/달력` 아이콘 토글, 상태 탭 underline, 행 밀도(시안 1행 60px 내), 상태 dot + 문구, 요약 열 값, `총 N개의 모임 · 말소된 모임 보기` 푸터, 이번 달 timeline dot·선, `달력에서 보기` 행. 시안에 없는 것: 페이지 헤더 `새 모임 만들기`(헤더 `새 모임`이 있음), breadcrumb `호스트 · 예정과 기록` | — | — | No.28이 다가오는·지난 모임에 동시 표시 | — | No.28 중복 표시(C/결함) | 4.72 · fail | 4.8 · fail | — | — | — | false · fail |
| `host-people-desktop` | 11 | 가입 승인 대기가 카드가 아닌 평면 표(아바타·이름·경로·시각·검토) + 우측 CTA, 멤버 원장 열(멤버·상태·최신 일정(아이콘)·참석 응답(아이콘)·최근 접속·함께한 기간·관리 `열기 ›`), 상태 pill 최소화(초록 배지 벽 금지), 우측 `현재 일정 확인` 4행 + `미열람 멤버 보기`, 하단 info 문장. 시안에 없는 것: 행 내 `이름 변경`·`모임 제외`·`…` 버튼, `세부 조작` | — | — | — | — | — | 6.06 · fail | 6.39 · fail | — | — | — | false · fail |
| `host-records-desktop` | 12 | 상태 탭 underline + 색 카운트, `내보내기` 아이콘, 다음 마감 배너(! 아이콘·3줄·CTA), 원장 열 값 색(작성 중·확인 필요·마감 필요), 우측 `마감 작업` 워크박스 행 3개(요약 카운트 아님), 하단 `게시 이력` 줄 | — | — | 출석·소감 `—` | — | — | 5.13 · fail | 5.3 · fail | — | — | — | false · fail |
| `host-settings-desktop` | 13 | `새 초대 링크` 페이지 헤더 CTA(탭 행 아님), 초대 링크 탭 underline + 카운트, 링크 표 밀도·관리 열 구분선, 하단 `만료·중지된 링크 보기` + 이벤트 줄, 클럽 설정 행 밀도, `클럽 운영 종료` 행 + chevron. 시안에 없는 것: `revision 4`, `설정 저장`, `종료 검토`, `세부 조작` | — | — | — | — | — | 4.73 · fail | 4.87 · fail | — | — | — | false · fail |
| `host-schedule-review-desktop` | 14 | E(전면): breadcrumb `운영실 / 일정 미열람 확인`, 제목 `일정 미열람 안내`, `현재 일정 revision · 변경 시각` 줄, `변경 내용` diff 표(시작 시간 →, 장소, 사유), 대상 표(헤더 체크박스·이름·최신 일정 상태·최근 접속, `전체 선택`, `제외된 N명 보기`), 우측 제목/본문 필드 + `72 / 140` 카운터 + `변경 내용 포함` 체크, `N명에게 안내 보내기` + `내일 09:00까지 보류`, `취소하고 운영실로`, info 문장, 하단 이전 안내 줄 | — | — | — | — | — | 7.64 · fail | 7.87 · fail | — | — | — | false · fail |
| `host-prep-mobile` | 15 | 크롬(§4.1 모바일). 헤더(표지 이미지·책 제목·D-3·아이콘 facts·`멤버 시야`), 준비 현황 행(번호·아이콘·항목·값+설명·chevron, `자세히 보기` 없음), 다음에 할 일 텍스트 CTA + 보류, 워크박스 제목 `호스트 작업함` + 탭 + 행 아이콘, 탭 바 아이콘 | — | — | — | — | — | 13.08 · fail | 12.97 · fail | — | — | — | false · fail |
| `host-live-mobile` | 16 | 헤더 크롬, 배지 `진행 중`, `현장 운영` kicker + `진행 순서 보기`, 출석 행 컨트롤(체크·물음표·X 아이콘), info 줄, 저장 토스트 위치(E/A 혼재). 사각지대: 다음에 할 일이 prep 내용 | 동 E/A 항목의 토큰·정렬·아이콘 | 출석 1행 + `출석 N명 모두 보기`, 다음에 할 일·작업함 유지 | — | — | 헤더 `을지로 북살롱`과 `멤버 시야` 겹침; 다음에 할 일이 prep 내용 | 14.18 · fail | 14 · fail | — | — | — | false · fail |
| `host-person-mobile` | 17 | 헤더 크롬, `← 사람` 뒤로 줄, 큰 아바타 + `FOLIO · 017` + 상태·기간·가입 경로 + `…`, 섹션 01–04 내 아이콘·강조 상태(변경 전 확인·미응답)·revision 3줄·info 문장·링크 `›`, 실제 출석 행 아이콘 상태, 멤버십 펼침. 시안에 없는 것: `세부 조작`, `사람 관리 원장으로` | — | — | — | — | — | 7.91 · fail | 8.2 · fail | — | — | — | false · fail |

## 0단계 요약

- Pixel mismatch: **18/18 fail** (모두 `pct` > 0.02).
- Structure contract: **18/18 `structurePass: false`**.
- 이후 Phase 재캡처 시 해당 단계 비율·`structure` 열만 갱신한다. 이미지는 커밋하지 않는다.

## 1단계 요약

Task 12b Jammy 재캡처 (`DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker`). Playwright **18 failed** (strict pixel, 모두 `pct` > 0.02). `summary.json` `pct`/`structurePass`를 `1단계 ratio`/`structure`에 그대로 옮김.

- Pixel mismatch: **18/18 fail**. 0단계 대비 비율 이동: **11/18 worse**, 6 improved, 1 flat. 큰 이동은 `admin-work-detail-mobile` 6.47 → 13.23 (상세에 셸 헤더·상태 띠가 남음).
- Structure contract: **1/18 `structurePass: true`** (`admin-today-desktop`만). 화면별 rule RED는 Phase 2–4 정상.
- 공유 크롬 rule(`nav-icons`, `header-status`, `utility-*`, `mobile-*`, `workbox-row-*`, `no-detail-ops-leak`): 해당 id 전부 `passed:true` (재캡처 후 구현 수정 없음). `workbox-footer`는 `workbox-row-*`가 아니며 운영실 화면별 잔여(Phase 2).

Phase 2 carry (Task 14, Task 18에서 재실측): live-mobile `phaseNav` (`HOST_LIVE_MOBILE_PHASE_NAV_GEOMETRY` height 41, 제거된 40px min-height)와 `typo("phase-label", 14px/600)`는 단계 탭 compact 이후 stale이다. 비율 열은 그대로 두고 Task 18 Jammy 재캡처 실측으로만 갱신한다.

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
| geometry | 같은 파일 prep mobile / live attendance board | main y 52 vs 58. Phase 2. |
