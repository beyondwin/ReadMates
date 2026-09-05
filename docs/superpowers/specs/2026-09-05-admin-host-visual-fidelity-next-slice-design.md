# Admin·Host 승인 PNG 시각 충실도 슬라이스 (구성 잔여 포함)

- 상태: Approved design, implementation not started. 2026-09-05 오전 초안은 "아이콘·여백만" 범위였고, 같은 날 18장 reference/candidate 전수 비교 뒤 **구성 잔여를 범위에 포함**하는 것으로 승인됨
- 승인일: 2026-09-05
- 범위: Admin 승인 시안 `01`–`07`과 Host 승인 시안 `07`–`17`(총 18장)을 실제 authenticated route에서 시안과 같아 보이게 맞추는 작업. 공유 크롬(셸·아이콘·워크박스 행), 화면별 **구성 잔여**, 시각 토큰(아이콘·여백·밀도), 그리고 테스트/카피 정직성 잔여
- 비범위: Public·Member, 서버 API 의미, 배포, `origin/main` push, 승인 PNG 갱신, pixel gate 완화, 현장 출석 1행 cap 철회, ADR-0048·0050·0051 제품 구성 변경

ADR impact: **update (ADR-0045)**. 이 슬라이스는 host/admin 공유 primitive에 **아이콘 primitive**를 추가하고, "CSS data URI 아이콘 금지·route-scoped 셸 override 금지"를 durable 제약으로 둔다. 이는 ADR-0045(paper/ink primitive)의 범위 확장이므로 ADR-0045 본문에 한 절을 `update`로 추가한다. 결정을 뒤집는 것이 아니므로 supersede가 아니다. ADR-0053은 `Proposed`로 두며 이 문서로 올리지 않는다. 0.02 완화, mask 도입, 승인 PNG 교체, 출석 미리보기 행 수 상향은 이 문서가 승인하지 않는다.

관련: ADR-0045, ADR-0048, ADR-0050, ADR-0051, ADR-0053, `front/DESIGN.md`, `docs/superpowers/specs/2026-09-04-admin-host-actual-route-visual-authority-convergence-design.md`, `docs/superpowers/plans/2026-09-04-admin-host-actual-route-visual-authority-convergence.md`, `docs/reports/2026-09-04-admin-host-actual-route-visual-authority-acceptance.md`, `design/mockups/2026-08-30-admin-operations-redesign/README.md`, `docs/development/host-redesign-mockups/README.md`

## 0. 이 문서를 쓰는 이유

구성 수렴 슬라이스는 로컬 `main`에 들어갔고 geometry/typography/first-viewport 게이트는 18/18 통과로 기록됐다. 그러나 2026-09-05에 18장 reference/candidate를 사람이 나란히 본 결과, **구성이 시안과 같은 화면은 18장 중 5장 안팎**이었다. 나머지는 아이콘·여백이 아니라 탭·검색·표 구조·우측 rail 내용·헤더 크롬 같은 정보 구조 자체가 다르다. 그런데 구성 게이트가 전부 PASS인 것은 기대값이 구현 실측에 맞춰져 있기 때문이다(§3).

제품 소유자는 화면마다 항목을 지정하지 않기로 했다. **18장 승인 PNG가 명세**이고, 실행 세션은 reference/candidate를 보고 스스로 분류한 뒤 고친다. 이 문서는 그 세션이 `docs/superpowers/plans/`에 상세 구현 계획을 만들고 실행하기 위한 핸드오프다. **구현 계획이 아니다.**

다음 세션의 순서:

1. 이 spec, ADR-0045, ADR-0053, 2026-09-04 수락 기록을 읽는다.
2. `docs/superpowers/plans/YYYY-MM-DD-admin-host-visual-fidelity.md`에 상세 계획을 쓴다.
3. 로컬 `main`에서 전용 브랜치/worktree를 만들고 구현한다.
4. 구현 중 사용자에게 아이콘·여백·구성 목록을 묻지 않는다.

## 1. 현재 저장소 상태 (2026-09-05)

측정·머지 시점의 사실이다. 다음 세션은 `git status`와 HEAD를 다시 확인한다.

| 항목 | 값 |
| --- | --- |
| 작업 브랜치 | 로컬 `main`. 기능 브랜치 `feat/admin-host-actual-route-visual-authority`는 fast-forward 머지 후 삭제됨 |
| HEAD (기록 시점) | `822044466` (`fix: align CT geometry and host lifecycle E2E with compact attendance`) |
| `origin/main` | `595ebf057`. 로컬 `main`은 **28커밋 ahead**. **이 28커밋을 `origin/main`에 push하지 않는다** |
| ADR-0053 | `Proposed`. 이 문서로 `Accepted`로 올리지 않는다 |
| 승인 PNG | 18장 모두 수정하지 않음. `referenceSha256`는 manifest와 일치 |
| Pixel gate | 18/18 `maxDiffPixelRatio` **0.02 fail-closed**. 0.10/0.15 ceiling 없음. mask 18/18 `null` |

로컬에서 닫힌 게이트(기록 시점, `CI=true npx --yes corepack@0.35.0 pnpm --dir front ...`):

| 명령 | 결과 |
| --- | --- |
| `lint` | error 0, Fast Refresh warning 5 |
| `test` | 480 files / 4754 |
| `build` | PASS |
| `DOCKER_CONTEXT=colima-readmates-va ... test:ct:docker` | 177 passed |
| `playwright test tests/e2e/host-lifecycle-operating-room.spec.ts --project=chromium --retries=0` | 1 passed |
| `DOCKER_CONTEXT=colima-readmates-va ... test:e2e:approved-routes:docker` | **18/18 `not_passed_0.02`**. 2026-09-05 재실행 비율은 2026-09-04 보고서와 같다 |

패키지 매니저: 저장소 pin은 `pnpm@11.13.1`. 로컬 PATH에 `corepack`이 없을 수 있다. 그때는 `npx --yes corepack@0.35.0 pnpm --dir front ...`를 쓰고 명령을 그대로 보고한다. `npx pnpm@11.13.1`은 Corepack 자체가 없을 때만 fallback이다.

Jammy visual/CT: `docker --context colima-readmates-va` 또는 `DOCKER_CONTEXT=colima-readmates-va`. **`docker context use`로 기본 context를 바꾸지 않는다.** 기본 Colima는 Chromium을 SIGKILL할 수 있다.

## 2. 이미 끝난 것과 끝나지 않은 것

2026-09-04 spec/plan에서 **실제로 닫힌 계약**:

- 18개 `VisualAuthorityScenario`가 **실제 authenticated route**를 candidate로 소유한다. test-only shell은 최종 PASS 근거가 아니다.
- Admin Today 기본 3건 + `전체 보기`. Host 작업함 desktop 4 / mobile 3 + `작업함 모두 보기`.
- Compact live 출석: **1행 미리보기 + `출석 N명 모두 보기`**. census보다 행이 짧으면 일괄 `나머지 N명`을 숨긴다. 전체 출석·되돌리기·모임 마치기는 session workspace가 소유한다. 마감 다음 행동 `기록 초안 검토`는 canonical `/app/host/records`.
- Broad font-raster 예외 API는 제거됐고 unit이 재도입을 막는다.
- 운영실 문서 순서(현재 모임 → 단계 → 다음에 할 일 → 상태 안내 → 준비 현황/출석 → 작업함)와 전역 공간 전환 크롬.

**구성이 시안과 같아진 화면**(시각 토큰만 남음): `admin-today-desktop`, `admin-today-mobile`, `admin-work-detail-mobile`, `admin-space-switcher-desktop`, `host-closing-desktop`(본문 원장 한정). 이 다섯은 다시 구성하지 않는다.

**구성이 아직 시안과 다른 화면**은 §4에 있다. 2026-09-04 spec §2 "구성 수렴 끝"은 위 다섯 장과 제품 계약(cap·순서·disclosure)에만 참이다. 이 문서는 그 서술을 정정한다.

보조 CT snapshot 3장(`admin-shell-mobile-390.png`, `admin-shell-long-copy-320.png`, `editorial-ledger-emergency-takedown-390.png`)은 현재 composition 회귀 기준이다. 승인 PNG가 아니다.

## 3. geometry/typography PASS가 의미하는 것

| 게이트 | 실제로 검사하는 것 | 검사하지 않는 것 |
| --- | --- | --- |
| geometry | `front/tests/e2e/support/approved-route-geometry.ts`에 적힌 이름난 region의 DOM 박스 vs 기대 숫자, 허용 4 CSS px | 시안 PNG에서 측정한 좌표. 숫자는 **현재 구현 실측**이라 구성이 시안과 달라도 통과한다 |
| typography | 이름난 selector의 계산된 Pretendard / size / weight / line-height / color | 글리프 raster, letter-spacing, 아이콘 유무, **시안에 없는 요소가 있는지** |
| first viewport | 해당 블록이 보이는지 | 내용·구조가 PNG와 같은지 |
| strict pixel 0.02 | 전체 이미지 mismatch ratio | 사람의 "같다"와 같지는 않지만 **시각 수락의 자동화 권위**다 |

따라서 구성 게이트 18/18 통과 + 구성 잔여 13장 + pixel 18/18 실패가 동시에 성립한다. 구성 통과를 시각 수락으로 쓰지 않는다. 이 슬라이스는 §5.4의 **구조 계약**을 추가해 이 사각지대를 좁힌다.

## 4. 2026-09-05 사람 관측 (18장 전수)

비교 산출물은 gitignore다(`front/test-results/`, 로컬 `.tmp/visual-authority-compare/`). 다시 만들려면:

```text
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker
```

**reference.png와 candidate.png를 먼저** 나란히 보고 overlay/diff는 위치 확인용으로 쓴다. overlay만 보면 수직 어긋남이 전체를 붉게 만들어 구성 차이와 빠진 아이콘을 놓친다.

### 4.1 구조적 원인 (화면별 증상이 아닌 코드 소유권)

이 네 가지를 먼저 고치면 18장이 같이 움직인다.

1. **Admin 셸이 route마다 fork돼 있다.** 시안 크롬(내비 아이콘, 활성 pill, 카운트 배지, 헤더 상태 띠, 계정 크롬, 로그아웃 아이콘)은 `admin-today.css`의 `.admin-shell:has(.admin-today-ledger)` 후행 override 44개 안에만 있고 아이콘은 CSS `mask-image` data URI다. `admin-club-management.css`는 `.admin-shell:has(.admin-clubs-ledger)` 34개, `admin-processing-records.css`는 `.admin-shell:has(.admin-audit)` 47개를 따로 갖는다. 2026-09-04 spec §6이 금지한 route별 후행 override가 125개 규칙으로 이미 존재하고, 시안 크롬은 셸 기본값이 아니라 Today route의 예외다. 그래서 clubs/service/records에서는 아이콘 없는 옛 셸이 나온다.
2. **아이콘 소스가 세 갈래다.** `operating-room-glyph.tsx`, `mobile-tab-bar.tsx`의 `TabIcon`, CSS data URI. CSS 아이콘은 DOM에 없어 접근성·typography·구조 검사에 잡히지 않는다.
3. **Host 헤더 컨테이너가 본문과 다르다.** `TopNav`는 가운데 정렬 `.container` 안이고 운영실 본문은 전폭 32px 거터라 브랜드가 x≈180에서 시작한다. 시안은 헤더도 전폭이다. 공간 전환 pill, 유틸 아이콘(초대와 설정·멤버 시야), 종(알림 점), 아바타가 없고 "알림" 텍스트와 계정 드롭다운이 있다. 모바일 헤더는 "…" 버튼 + "계정 ▾"이고 시안은 공간 전환 제목 + 종 + 아바타다.
4. **`세부 조작` 텍스트가 여러 화면에 새어 나온다.** people, records, settings, schedule-review, person, workbox 행. `details/summary` 패턴 하나가 시안에 없는 군더더기를 6곳에 만든다.

### 4.2 화면별 관측

E = 구성 잔여, A = 시각 토큰, C = 픽스처/데이터, B = 제품 예외(§6), 결함 = 사람이 보면 즉시 잘못으로 보이는 것.

| id | 시안 | 관측 |
| --- | --- | --- |
| `admin-today-desktop` | 01 | A: 활성 내비 파란 체크 아이콘, 페이지 제목 28→20 위계, 상태 띠 위치. C: 배지 `3` vs `10`. B: 공간 전환 크롬, `전체 10건 보기` |
| `admin-clubs-desktop` | 02 | E: `클럽 찾기` 탭(전체·확인 필요·운영 중 + 카운트), 행 상태 문구, 운영 상태 facts 4개(아이콘·값), `확인할 내용` 섹션, 헤더 상태 문장, 내비 아이콘. 결함: `새 클럽` 버튼이 제목 위에 겹침. C: 클럽 수 |
| `admin-service-desktop` | 03 | E: 제목 `서비스 건강`/`새로고침`/`최근에 바뀐 것` 패널 대신 시안의 전폭 상태 표(서비스·상태·마지막 확인·영향·조치·펼침), 펼친 행의 3열 요약(영향 범위·최근 정상 전달·복구 조치), 헤더 상태 문장 + `마지막 전체 확인`, `기술 정보 펼치기` 푸터 |
| `admin-records-desktop` | 04 | E: 검색 아이콘, `오늘 ⌄` 기간 필터(날짜 범위 텍스트 대신), 행 상태 아이콘, 상세의 구조화 섹션(처리한 이유·영향 범위·변경 전·변경 후·처리 결과·기술 정보), 내비 아이콘. C: 행 수 |
| `admin-space-switcher-desktop` | 05 | A: 메뉴 위치·폭, 아이콘(체크·사람), 계정 크롬(이름 + `계정` + 아바타). 결함: 계정 라벨이 아바타 원과 겹침 |
| `admin-today-mobile` | 06 | A: 헤더 간격(브랜드·switcher·계정), 상태 배너 tinted 띠, 페이지 제목 36→28px, 행 아이콘 수직 정렬, 탭 바 아이콘 크기·무게. B: `전체 10건 보기` |
| `admin-work-detail-mobile` | 07 | A: 뒤로 chevron 무게, 제목 간격, 하단 `기술 정보 펼치기` 정렬. 가장 근접한 화면 |
| `host-prep-desktop` | 07 | 크롬(§4.1). E: 워크박스 행(색 원형 아이콘 + 수량·기한 + 화살표, `세부 조작` 없음), rail 하단 이벤트 줄(`어제 19:30 자동 리마인드 전달됨 · 변경 이력`), 단계 탭 compact + 구분선, 준비 현황 열(항목·현황·세부 내용·관리)과 구체 액션 라벨(`멤버 보기` 등), 다음에 할 일 `내일 09:00까지 보류` secondary + 상태 줄. 결함: 워크박스 행 텍스트 겹침(`1 기한 지남세부 조작`). 결정 필요: H1 필드(§5.3). C: D-3 vs D+3 |
| `host-live-desktop` | 08 | prep과 같음 + E: 배지 `오늘`, 현장 현황 4행(실제 출석·참석 응답·진행 순서·현장 메모)과 액션. **사각지대**: candidate의 다음에 할 일이 prep 내용(`일정 미확인 멤버 검토`)이다. `resolveNextAction`의 phase 반영 여부를 확인하고 live에서는 출석 확인이 나오게 한다 |
| `host-closing-desktop` | 09 | 크롬(§4.1). 본문 원장 구성은 같음. A: 단계 번호 원형, 상태 색, `기록 미리보기` 헤더 액션, 다음에 할 일 note 아이콘, `내일 18:00까지 보류` secondary. E: 워크박스 행·rail 하단 |
| `host-meetings-desktop` | 10 | E: `목록/달력` 아이콘 토글, 상태 탭 underline, 행 밀도(시안 1행 60px 내), 상태 dot + 문구, 요약 열 값, `총 N개의 모임 · 말소된 모임 보기` 푸터, 이번 달 timeline dot·선, `달력에서 보기` 행. 시안에 없는 것: 페이지 헤더 `새 모임 만들기`(헤더 `새 모임`이 있음), breadcrumb `호스트 · 예정과 기록`. C/결함: No.28이 다가오는·지난 모임에 동시 표시 |
| `host-people-desktop` | 11 | E: 가입 승인 대기가 카드가 아닌 평면 표(아바타·이름·경로·시각·검토) + 우측 CTA, 멤버 원장 열(멤버·상태·최신 일정(아이콘)·참석 응답(아이콘)·최근 접속·함께한 기간·관리 `열기 ›`), 상태 pill 최소화(초록 배지 벽 금지), 우측 `현재 일정 확인` 4행 + `미열람 멤버 보기`, 하단 info 문장. 시안에 없는 것: 행 내 `이름 변경`·`모임 제외`·`…` 버튼, `세부 조작` |
| `host-records-desktop` | 12 | E: 상태 탭 underline + 색 카운트, `내보내기` 아이콘, 다음 마감 배너(! 아이콘·3줄·CTA), 원장 열 값 색(작성 중·확인 필요·마감 필요), 우측 `마감 작업` 워크박스 행 3개(요약 카운트 아님), 하단 `게시 이력` 줄. C: 출석·소감 `—` |
| `host-settings-desktop` | 13 | E: `새 초대 링크` 페이지 헤더 CTA(탭 행 아님), 초대 링크 탭 underline + 카운트, 링크 표 밀도·관리 열 구분선, 하단 `만료·중지된 링크 보기` + 이벤트 줄, 클럽 설정 행 밀도, `클럽 운영 종료` 행 + chevron. 시안에 없는 것: `revision 4`, `설정 저장`, `종료 검토`, `세부 조작` |
| `host-schedule-review-desktop` | 14 | E(전면): breadcrumb `운영실 / 일정 미열람 확인`, 제목 `일정 미열람 안내`, `현재 일정 revision · 변경 시각` 줄, `변경 내용` diff 표(시작 시간 →, 장소, 사유), 대상 표(헤더 체크박스·이름·최신 일정 상태·최근 접속, `전체 선택`, `제외된 N명 보기`), 우측 제목/본문 필드 + `72 / 140` 카운터 + `변경 내용 포함` 체크, `N명에게 안내 보내기` + `내일 09:00까지 보류`, `취소하고 운영실로`, info 문장, 하단 이전 안내 줄 |
| `host-prep-mobile` | 15 | 크롬(§4.1 모바일). E: 헤더(표지 이미지·책 제목·D-3·아이콘 facts·`멤버 시야`), 준비 현황 행(번호·아이콘·항목·값+설명·chevron, `자세히 보기` 없음), 다음에 할 일 텍스트 CTA + 보류, 워크박스 제목 `호스트 작업함` + 탭 + 행 아이콘, 탭 바 아이콘 |
| `host-live-mobile` | 16 | B: 출석 1행 + `출석 N명 모두 보기`, 다음에 할 일·작업함 유지. E/A: 헤더 크롬, 배지 `진행 중`, `현장 운영` kicker + `진행 순서 보기`, 출석 행 컨트롤(체크·물음표·X 아이콘), info 줄, 저장 토스트 위치. 결함: 헤더 `을지로 북살롱`과 `멤버 시야` 겹침. 사각지대: 다음에 할 일이 prep 내용 |
| `host-person-mobile` | 17 | E: 헤더 크롬, `← 사람` 뒤로 줄, 큰 아바타 + `FOLIO · 017` + 상태·기간·가입 경로 + `…`, 섹션 01–04 내 아이콘·강조 상태(변경 전 확인·미응답)·revision 3줄·info 문장·링크 `›`, 실제 출석 행 아이콘 상태, 멤버십 펼침. 시안에 없는 것: `세부 조작`, `사람 관리 원장으로` |

### 4.3 시안 sidecar의 공유 계약

`design/mockups/2026-08-30-admin-operations-redesign/*.png.json`의 생성 prompt에 Admin 공유 계약이 숫자로 있다: 좌측 내비 208px, 상단 바 72px, 콘텐츠 최대폭 1240px, 거터 32px, 섹션 간격 24px, 패널 패딩 16px, 컨트롤 44px, list-detail 38/62, 타입 스케일 36/28/20/17/16/14/12px(모바일 28/20/17/16/14/12px), "초록 배지 벽 금지, 정상은 조용한 텍스트". geometry 기대값과 CSS 토큰의 **출발점**으로 쓴다. PNG 실측이 다르면 PNG가 우선한다. Host 시안은 sidecar가 없으므로 PNG 실측만 쓴다.

## 5. 분류와 접근

### 5.1 차이 분류 (실행 세션이 채우는 펀치 리스트)

18장 각각에 대해 reference vs candidate를 보고 다섯 칸으로 나눈다. 사용자에게 항목을 받지 않는다.

| 칸 | 정의 | 조치 |
| --- | --- | --- |
| **E. 구성 잔여** | 같은 제품 계약(§6) 안에서 시안의 정보 구조가 빠졌거나 다른 것: 탭·검색·표 열·rail 내용·헤더 크롬·섹션 순서·시안에 없는 컨트롤 | **고친다.** A보다 먼저. 묻지 않는다 |
| A. 시각 토큰 | 같은 구성의 아이콘, 무게, 간격, 밀도, 군더더기 라벨 | **고친다.** 묻지 않는다 |
| B. 제품 예외 | §6 | 유지. 시안과 달라도 회귀가 아니다 |
| C. 픽스처·데이터 | 건수, D-n, 아바타, 시간 문구, 빈 값 | runtime에 PNG 문구를 고정하지 않는다. fixture를 시안 숫자로 속이지 않는다. **fixture 결함**(No.28 중복 등)은 데이터 오류로 고친다 |
| D. AI raster | Pretendard vs 시안 산세리프, 서브픽셀, tracking | PNG를 바꾸거나 threshold를 올리지 않는다. 좁은 glyph mask는 이 슬라이스의 기본 경로가 아니다. 넣으려면 별도 승인 |

E와 A의 경계: 요소가 **없거나 다른 요소로 대체**돼 있으면 E, 요소는 있는데 **모양·간격·아이콘**이 다르면 A.

### 5.2 접근: 셸 기본값 교체 + 단일 아이콘 primitive + 화면별 구조 패스

기각한 대안: (a) route별 `:has()` override와 CSS 아이콘을 clubs/service/records에도 덧대기(fork가 200개를 넘고 2026-09-04 spec §6 위반), (b) 셸을 새 컴포넌트로 재작성(ADR-0053이 이미 기각한 전면 재구축).

채택한 접근:

1. **승인 크롬을 셸의 기본값으로 올린다.** `AdminShellLayout`/`AdminLayoutNav`가 아이콘·활성 pill·카운트 배지·헤더 상태 띠·계정 크롬·로그아웃 아이콘을 **기본으로** 렌더한다. `.admin-shell:has(.admin-today-ledger|.admin-clubs-ledger|.admin-audit)` route-scoped override 125개는 삭제하고, 남는 route 고유 규칙은 해당 route의 본문 소유 단위로 옮긴다. `TopNav` host variant와 `MobileHeader` host variant가 공간 전환 pill(모바일은 제목), 유틸 아이콘, 종(+점), 아바타, `새 모임`을 렌더하고 헤더 컨테이너를 본문과 같은 전폭 32px 거터로 맞춘다.
2. **아이콘 primitive 하나.** `front/shared/ui/icon.tsx`(가칭 `ReadmatesIcon`): 24 viewBox, stroke 1.75, `size` 16/20/24, `data-icon` 이름, `aria-hidden` 기본. `OperatingRoomGlyph`, `TabIcon`, CSS data URI 아이콘을 여기로 흡수한다. 채움형 상태 아이콘(활성 체크, 워크박스 색 원형)은 같은 파일의 variant다. 새 CSS data URI 아이콘과 route-scoped 셸 override는 unit 테스트(`frontend-boundaries` 계열)로 막는다.
3. **공유 패턴 정리.** `details/summary` `세부 조작`은 시안이 요구하는 곳(없음)에서만 보이게 하고, 나머지는 행 액션(`열기 ›`, chevron) 또는 route의 상세 화면으로 옮긴다. 워크박스 행은 `색 원형 아이콘 · 제목 · 수량 · 기한 · ›` 한 줄 grid로 재구성하고 보류/되돌리기 컨트롤은 행 클릭 뒤 목적지가 소유한다(제품 계약 유지).
4. **화면별 구조 패스.** 시안 번호 순으로 E → A를 닫는다. 각 화면은 2026-09-04 spec §6 소유 단위(shell, queue/list row, docket/detail, state summary, responsive composition, Host header/phase nav, Host ledger/workbox) 안에서 고치고, 다른 route의 descendant selector로 내부 grid를 재정의하지 않는다.
5. **모델 확인.** `resolveNextAction`이 live phase에서 출석 확인을 우선하는지 확인하고, 아니면 phase 우선순위를 모델에 넣는다. UI는 props만 렌더한다.

### 5.3 이 슬라이스가 확정하는 결정

- **현재 모임 H1은 책 제목**, 모임 제목/회차(`No. 28`, `스물여덟 번째 모임`)는 kicker 또는 보조 줄. 시안 07–17 전부가 이 위계를 쓰고 ADR-0048은 필드를 지정하지 않는다. `CurrentMeetingHeader`와 mobile 헤더, meetings/records 원장의 제목 열이 같은 규칙을 따른다. 책 제목이 없으면 모임 제목으로 fallback한다.
- Host 데스크톱 헤더 유틸은 `초대와 설정`·`멤버 시야`·알림·아바타·`새 모임` 다섯 개다. 운영실 헤더 액션은 `모임 정보`·`일정 편집`(마감실은 `기록 미리보기`)·`변경 이력` 세 개이고 `멤버 시야`를 중복 노출하지 않는다.
- 제품 셸의 아이콘은 React 컴포넌트다. CSS `mask-image`/`background-image` data URI로 아이콘을 그리지 않는다.
- 셸 크롬은 route와 무관하게 같다. route가 셸을 바꾸려면 셸 컴포넌트에 명시적 prop/slot을 추가한다. `:has()`로 셸을 fork하지 않는다.

### 5.4 게이트 보강: 구조 계약

18장 각 scenario에 **구조 계약** 단언을 추가한다. 시안에서 읽어낸 요소의 **존재**와 **부재**만 검사하고 좌표는 검사하지 않는다. 예: 헤더에 space switcher·bell·avatar가 있다, 내비 4항목에 `data-icon`이 있다, 워크박스 행에 아이콘·수량·chevron이 있고 `세부 조작` 텍스트가 없다, clubs에 탭 3개와 카운트가 있다, schedule-review에 변경 내용 표와 글자수 카운터가 있다. 구현에 맞춰 조정할 수 없는 항목만 넣는다. 지금은 대부분 RED여야 정상이고, 계획의 첫 작업에서 RED를 확인한다.

geometry 숫자는 E/A를 고친 뒤 **새 구성의 실측**으로 갱신할 수 있다. 시안 여러 행 출석처럼 **하지 않기로 한 구성**에는 기대값을 맞추지 않는다. 가능하면 §4.3 sidecar 수치를 기대값으로 먼저 쓴다.

## 6. 유지하는 제품 예외 (다시 묻지 않음)

| 예외 | 근거 |
| --- | --- |
| 현장 compact 출석 1행 + `출석 N명 모두 보기` | 화면에 없는 인원을 일괄 저장하지 않기 위함. CHANGELOG Unreleased Fixed와 `meeting-response-ledger.tsx`의 `previewTruncated` |
| Admin Today 기본 3건, Host 작업함 desktop 4 / mobile 3 | ADR-0053 / 0050 / 0048. 초과는 주소로 복원되는 `전체 보기` |
| 운영실 문서 순서: 현재 모임 → 단계 → 다음에 할 일 → 상태 안내 → 준비 현황/출석 → 작업함 | ADR-0048. live 첫 화면에서 다음에 할 일·작업함을 시안 16처럼 지우지 않는다 |
| 전역 공간 전환 크롬 | ADR-0051. 시안 01에 없어도 제품 셸이다. 시안 `05`가 열린 상태의 권위 |
| 승인 PNG를 runtime 배경/카피로 고정하지 않음 | 2026-09-04 spec §2 |
| Today 대표 CTA가 서버 `allowedActions` 의미를 따름 | §7. 시안 01 카피를 전 케이스에 얼리지 않는다 |

## 7. 테스트·카피 정직성 잔여

시각 슬라이스와 같이 다루되, pixel PASS를 기다리지 말고 **기본 CI가 거짓 GREEN/거짓 RED가 되지 않게** 먼저 또는 병렬로 계획에 넣는다.

1. `front/tests/e2e/admin-today.spec.ts`는 heading `오늘 할 일`(level 없음)과 버튼 `확인함`을 기대한다. 제품은 h1+h2가 같이 있을 수 있고, Today 대표 CTA는 `APPROVED_TODAY_ACTION_COPY`(`다시 보내기 검토` / `자세히 보기`)다. 기본 `test:e2e`에 포함되면 실패할 가능성이 크다.
2. `APPROVED_TODAY_ACTION_COPY`가 **모든 Today 케이스**에 적용된다. 시안 01의 알림 지연 문구를 runtime 전 케이스에 얼린 것이다. 서버 `allowedActions`의 의미(`확인함`·`잠시 미룸`·`처리함`)와 시안 카피를 섞지 말 것. `front/DESIGN.md`는 여전히 서버 액션 이름을 `확인함` 등으로 설명한다.
3. Visual-authority browser smoke(`test:e2e:visual-authority-browsers`)는 구성 closeout에서 **재실행하지 않았다.** 2026-09-04 보고서는 9건 FAIL를 남겼다. 계획에 재측정을 넣는다. CI job `frontend-host-workspace-quality`가 이 smoke를 돌린다.
4. `front/DESIGN.md`의 suite 표는 2026-09-04 초안 측정을 담고 있을 수 있다. **표를 현재 증거로 인용하지 말고 명령을 다시 돌린다.**
5. CT 177건이 워크박스 행 텍스트 겹침, clubs 버튼 겹침, 헤더 계정 라벨 겹침을 잡지 못했다. 영향 CT에 겹침(overlap) 단언을 추가한다.

CI에 나중에 push하면 `frontend-visual-regression`은 **pixel이 빨간 동안 실패가 맞다**. `origin/main` push는 pixel 18/18이 `not_passed_0.02`인 동안 하지 않는다.

## 8. 금지

- 승인 reference PNG 수정, sidecar hash 손대기, snapshot 갱신만으로 PASS 주장
- `maxDiffPixelRatio`를 0.10/0.15 등으로 올리거나 broad raster 예외 API 부활
- geometry/typography/구조 계약 통과를 시각 수락으로 보고
- compact 출석 1행을 시안 16에 맞추려 올리기
- 새 `.admin-shell:has(...)` route-scoped 셸 override, 새 CSS data URI 아이콘, 셸을 우회하는 route별 헤더
- `front/test-results/`, Playwright report, `.tmp/` 비교 갤러리 커밋
- 실제 회원 데이터, secret, 로컬 절대 경로, private domain, OCID, token 형태 예시
- 기본 Docker context 전환
- 사용자에게 화면별 아이콘·구성 목록을 받아 작업하기
- 로컬 `main`에 직접 구현 커밋(전용 브랜치)

## 9. 정직한 완료 기준 (이 슬라이스)

이 슬라이스가 끝나도 ADR-0053을 `Accepted`로 올리지 않을 수 있다. 아래를 한 묶음으로 "시안 구현 완료"라고 부르지 않는다.

- ADR-0045 `update` 절이 구현 전에 들어가고, 구현 후 코드·테스트·`front/DESIGN.md`와 일치
- 칸 E를 18장에서 소진했거나, 남은 E를 reference/candidate와 함께 명시적으로 기록
- 칸 A를 18장에서 소진했거나, 남은 A를 overlay/diff와 함께 명시적으로 기록
- 칸 B·C를 시안과 다르다고 되돌리지 않음. fixture 결함은 고침
- 칸 D를 PASS로 위장하지 않음
- 구조 계약 18/18 GREEN. route-scoped 셸 override 0개, CSS data URI 아이콘 0개, `세부 조작` 노출 0곳(unit/grep으로 확인)
- `admin-today.spec.ts`와 Today 액션 카피가 제품 의미와 맞고, 기본 e2e가 구 카피로 실패하지 않음
- 영향 표면의 `lint` / focused unit / 영향 CT / 재캡처 pixel 비율을 **측정값 그대로** 보고. 비율이 줄어도 0.02를 넘으면 fail
- 사람 30초, VoiceOver/Safari, NVDA/Chrome, 원격 CI는 이 슬라이스가 자동으로 닫지 않음. 별도 증거

pixel 18/18이 0.02를 넘긴 채로도 E·A를 닫는 것은 유효한 중간 성과다. 그때 `origin/main`은 여전히 push하지 않는다.

## 10. 계획 작성 시 넣을 것

상세 계획은 `docs/superpowers/plans/`에 두고 이 spec을 `Spec:`으로 가리킨다. 계획 헤더에 ADR impact `update (ADR-0045)`를 적는다.

단계와 각 단계의 마감:

0. **게이트 보강과 펀치 리스트.** ADR-0045 `update` 절(Proposed 문구로 추가). 18장 구조 계약 RED 확인. 18장 E/A/B/C/D 분류표 생성(`docs/reports/` 또는 계획 부록, 이미지는 커밋하지 않음). 전용 브랜치 생성(베이스는 로컬 `main` HEAD, `origin/main`이 아님).
1. **공유 크롬.** 아이콘 primitive → Admin 셸 기본값 + `:has()` 125개 삭제 → Host `TopNav`/`MobileHeader` host variant + 전폭 헤더 → 모바일 탭 아이콘 → `세부 조작` 정리 → 워크박스 행. 마감: focused unit + 영향 CT + Jammy 18장 재캡처 + 분류표 갱신.
2. **Host 운영실 5장**(07·08·09·15·16). 헤더(표지 이미지·H1 규칙·배지·아이콘 facts·액션 3개), 단계 탭, 다음에 할 일 + 보류 secondary + note, 준비/현장/마감 원장 열과 액션 라벨, rail 하단, `resolveNextAction` phase 확인. §6 예외 유지. 마감: lifecycle E2E + 영향 CT + 재캡처.
3. **Admin 원장 3장**(02·03·04). 마감: focused e2e + 영향 CT + 재캡처.
4. **Host 원장 6장**(10·11·12·13·14·17). 마감: 같음.
5. **병렬(§7).** Today spec/카피, browser smoke 재측정, CT 겹침 단언.

공통 규칙: 매 의미 있는 시각 묶음 뒤 Jammy 재캡처(로컬 macOS 스크린샷을 strict receipt로 쓰지 않음). 의도한 UI 변경으로 CT snapshot이 바뀌면 2026-09-04 spec §3 순서(실제 route 검토 후 Docker update)를 따른다. 승인 PNG는 갱신 대상이 아니다.

Acceptance matrix:

- 선택: `UI or runtime state` — desktop/mobile, wrapping, 빈/오류가 아닌 대표 fixture 밀도, 출석 disclose, 0·3·10건 Admin queue, 0·4·12건 Host workbox
- 제외: BFF/OAuth, persistence, guest/public, provider, deploy. 이 슬라이스는 그 의미를 바꾸지 않는다

## 11. 명령 치트시트

Corepack launcher를 앞에 붙인다. Docker가 필요한 줄만 `DOCKER_CONTEXT=colima-readmates-va`를 붙인다.

```text
CI=true npx --yes corepack@0.35.0 pnpm --dir front lint
CI=true npx --yes corepack@0.35.0 pnpm --dir front test
CI=true npx --yes corepack@0.35.0 pnpm --dir front build
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:docker
DOCKER_CONTEXT=colima-readmates-va CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:approved-routes:docker
READMATES_VISUAL_AUTHORITY_SMOKE_ONLY=true CI=true npx --yes corepack@0.35.0 pnpm --dir front test:e2e:visual-authority-browsers
CI=true npx --yes corepack@0.35.0 pnpm --dir front exec playwright test tests/e2e/admin-today.spec.ts tests/e2e/host-lifecycle-operating-room.spec.ts --project=chromium --retries=0
```

영향 id:

```text
CI=true npx --yes corepack@0.35.0 pnpm --dir front visual-authority:affected -- --changed-paths-file <paths-file>
```

## 12. 새 세션에 붙여 넣을 프롬프트

```text
docs/superpowers/specs/2026-09-05-admin-host-visual-fidelity-next-slice-design.md 를 spec으로 상세 구현 계획을 작성한 뒤, 그 계획대로 Admin·Host 18장 승인 PNG에 구성 잔여(E)와 시각 토큰(A)을 맞춘다.

먼저 계획을 docs/superpowers/plans/ 에 쓰고 내가 실행을 확인한 다음 코드를 고친다. 구현 중 나에게 아이콘·여백·구성을 항목별로 묻지 말고, 승인 PNG + reference/candidate 비교를 펀치 리스트로 쓴다. 공유 크롬(셸 기본값, 아이콘 primitive, 세부 조작 정리, 워크박스 행)부터 고친다.

하지 말 것: 승인 PNG 수정, pixel 0.02 완화, mask로 PASS 만들기, 출석 1행 cap 올리기, origin/main push, 새 :has() 셸 override, CSS data URI 아이콘, geometry/typography/구조 계약 통과를 시각 수락으로 보고하기, 로컬 main에 직접 커밋하기(전용 브랜치).

ADR-0053은 Proposed로 둔다. ADR-0045에 아이콘 primitive update 절을 구현 전에 넣는다. 0.02가 남아도 E·A를 닫은 사실은 정직하게 보고한다.
```

## 13. 요구사항 추적

| 요구 | 계획에 넣을 것 | 수락 근거 |
| --- | --- | --- |
| 사용자에게 항목을 받지 않고 시안에 맞춤 | 18장 E/A/B/C/D 분류 + 공유 크롬 우선 + 구조 계약 | 구조 계약 18/18, 재캡처 비율, 사람 비교 기록 |
| 셸 fork 제거 | `:has()` 125개 삭제, 셸 기본값, unit 차단 | grep 0건 + unit GREEN |
| 아이콘 단일화 | `front/shared/ui/icon.tsx`, CSS data URI 0건 | unit GREEN + `data-icon` 구조 계약 |
| 제품 예외 유지 | §6를 Global Constraints로 복사 | 출석 1행 테스트, item cap, 운영실 순서 |
| pixel 게이트 정직 | 재캡처 후 비율을 있는 그대로 보고 | 18개 report.json. PASS 지어내지 않음 |
| Today spec/카피 정직 | admin-today.spec.ts, APPROVED_TODAY_ACTION_COPY | focused e2e + unit |
| ADR 정합 | ADR-0045 `update` 절 선행, ADR-0053 Proposed 유지 | ADR 본문 + `front/DESIGN.md` 일치 |
| ADR-0053 전체 수락 | 이 슬라이스 비범위로 명시 | 사람 30초, AT, 원격 CI, 0.02가 열리기 전에는 Accepted 금지 |
