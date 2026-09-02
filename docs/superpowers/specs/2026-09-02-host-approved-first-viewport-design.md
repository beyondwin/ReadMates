# ReadMates Host 승인 시안 첫 화면 구성 설계

- 상태: Approved design, implementation not started
- 승인일: 2026-09-02
- 범위: Host 승인 시안 `07`–`17`(11장), `front/features/host/**` 실제 route/UI/픽스처/CT, Host shell story의 현재 목적지, 관련 Host E2E·active design docs
- 비범위: Admin, 새 서버 API, PNG runtime 배경, 시안 전용 가짜 페이지, 픽셀 비율 `0.02`를 합격 게이트로 사용, ADR-0053 Accept, 사람 30초 gate를 AI로 채우기

ADR impact: update — ADR-0053은 `Proposed`를 유지한다. 구현 계획·closeout에서 검증 칸에 Host 슬라이스 합격을 독립 시각 검토(첫 화면 구성)로 기록하고, `maxDiffPixelRatio` `0.02`는 측정값으로 남긴다. 결정 문장(승인 PNG가 page composition 시각 권위)은 바꾸지 않는다. ADR-0048·0051은 유지한다.

관련: ADR-0048, ADR-0049, ADR-0051, ADR-0053, `docs/superpowers/specs/2026-09-02-admin-host-pixel-fidelity-design.md`, `docs/reports/2026-09-02-admin-host-pixel-fidelity-acceptance.md`, `docs/development/host-redesign-mockups/README.md`, `front/DESIGN.md`

## 1. 결정 요약

Host 화면은 승인 PNG의 **첫 화면 구성**을 사람이 같은 화면으로 읽도록 맞춘다. 합격은 픽셀 비율이 아니라 선택된 탭, 표지, 주 행동, 원장·작업함 내용, 펼침/접힘, 모바일 하단 내비가 시안과 같은 것이다.

구현은 실제 Host route와 기존 컴포넌트를 시안 상태의 가상 픽스처로 조합한다. 시안 전용 캡처 트리를 만들지 않는다. 새 서버 API를 만들지 않는다. 기능·권한·안전 계약은 지우지 않고 시안 흐름 안의 접힌 보조 영역 또는 다음 단계로 재배치한다.

Admin은 후속 스펙이다. 이 작업에서 Admin 파일을 수정하지 않아 기존 Admin 근접 2장을 깨지 않는다.

## 2. 왜 기존 픽셀 작업으로 충분하지 않았는가

2026-09-02 Admin·Host 픽셀 근접 구현은 비교 harness와 18-entry manifest를 남겼지만 Host 독립 시각 검토는 11/11 FAIL이었다. CT는 `allowFontRasterException`으로 desktop `0.10` / host-mobile `0.15` ceiling 아래에서 통과했다. `0.02` 대비는 Host도 전부 FAIL이다.

눈으로 다른 이유는 폰트 가장자리가 아니라 첫 화면 구성이다.

- `AppClubShellHostStory`의 `hostPrimaryItems`는 `operating-room`을 항상 `current: true`로 둔다(`front/shared/ui/app-club-shell.story.tsx:68`). 사람·기록·설정 캡처도 운영실 탭이 선택된 것처럼 보인다.
- 원장 픽스처는 본문 컴포넌트만 셸에 넣고, 시안의 찾기·칩·다음 행동 카드·초대 테이블을 빠뜨리거나 다른 페이지 트리로 대체한다(`front/features/host/ui/approved-host-ledgers.fixtures.tsx`).
- 운영실 캡처는 표지·`모임 정보`/`일정 편집`/`변경 이력`·시안 주 행동·채워진 작업함이 빠지고 보류 버튼·빈 행이 남았다.
- Host 원장·모바일 comparison JSON은 `regions: []`이라 4px/2px lock이 없다.
- 폰트 예외를 구성 일치 전에 켜서 CT PASS를 시각 PASS로 읽게 만들었다.

따라서 이번 설계의 핵심은 CSS 미세 보정이 아니라 **올바른 목적지·상태의 실제 페이지를 시안 첫 화면으로 렌더하는 것**이다.

## 3. 디자인 권위

충돌 시 순서:

1. Host 승인 PNG `07`–`17`의 첫 화면 구성·카피·순서·펼침
2. ADR-0048·0051과 Host active design
3. 현재 기능, 접근성, 권한, 안전·복구 계약
4. 현재 구현과 기존 tracked screenshot

3번과 1번이 충돌하면 기능을 제거하지 않고 1번의 흐름 안으로 재배치한다. 접근성·안전성 때문에 1번과 달라질 때만 근거·영향·비교 이미지를 남기고 별도 승인한다. 기존 구현 편의나 기존 snapshot만으로 차이를 정당화하지 않는다.

승인 PNG를 CSS background나 runtime image로 쓰지 않는다. React, semantic HTML, repository token, bundled Pretendard, `book-club-avatar.ts` artwork를 사용한다. CSS `content`로 제목을 그리거나 `font-size: 0`으로 글자를 숨긴 뒤 그림을 올리지 않는다.

허용 leftover는 첫 화면 구성이 맞은 뒤의 Pretendard·icon halo vs AI PNG뿐이다. 그때만 `allowFontRasterException`을 켠다.

## 4. 승인 자산

Host 권위는 `docs/development/host-redesign-mockups/`다. hash는 README·manifest와 같다.

| id | 파일 | 화면 |
| --- | --- | --- |
| `host-prep-desktop` | `07-host-lifecycle-operating-room-approved.png` | 운영실·준비실 |
| `host-live-desktop` | `08-host-operating-room-live-approved.png` | 운영실·현장 |
| `host-closing-desktop` | `09-host-operating-room-closing-approved.png` | 운영실·마감실 |
| `host-meetings-desktop` | `10-host-meetings-library-approved.png` | 일정과 모임 |
| `host-people-desktop` | `11-host-people-ledger-approved.png` | 사람 |
| `host-records-desktop` | `12-host-records-ledger-approved.png` | 기록 |
| `host-settings-desktop` | `13-host-invites-settings-approved.png` | 초대와 설정 |
| `host-schedule-review-desktop` | `14-host-unread-schedule-review-approved.png` | 일정 미열람 검토 |
| `host-prep-mobile` | `15-mobile-host-operating-room-prep-approved.png` | 모바일 운영실·준비실 |
| `host-live-mobile` | `16-mobile-host-live-attendance-approved.png` | 모바일 운영실·현장 출석 |
| `host-person-mobile` | `17-mobile-host-person-detail-approved.png` | 모바일 사람 상세 |

Desktop capture viewport는 1536×1024, mobile browser viewport는 390×832이며 reference frame은 866×1846으로 정규화한다. 비교 픽스처는 시안과 같은 가상 클럽 인상(책 제목, 인원, 행 구성)을 사용한다. 실제 회원·클럽·배포 데이터는 사용하지 않는다.

## 5. 합격 계약

각 시안 id의 하드 실패:

- 선택된 1차 탭 또는 utility 목적지가 시안과 다르다.
- 표지, 주 행동, 원장 열, 작업함 행, 하단 내비처럼 시안 첫 화면에 있는 블록이 없다.
- 제목·문장·section 순서·기본 펼침/접힘이 시안과 다르다.
- 시안에서 접힌 보조 기능이 기본 상태에서 항상 펼쳐진다.
- CT/픽스처에만 있는 제목이나 스텁이 프로덕션 페이지와 다르다.
- desktop 또는 mobile 한쪽만 맞는다.
- 폰트 예외를 구성 일치 전에 켜서 자동 비교만 통과한다.

합격:

- 구현하지 않은 검토자가 reference, candidate, 50% overlay, diff, JSON region을 보고 첫 화면 구성이 시안과 같다고 판정한다.
- 글자·아이콘 가장자리만 다르면 `PASS-with-font-raster`.
- 등록한 major region은 4 CSS px, 반복 정렬은 2 CSS px 이내. Host 원장·모바일도 `regions: []`로 두지 않는다.
- `mismatchPixelRatio`는 기록한다. `0.02`를 넘어도 구성 합격과 검토된 폰트 leftover면 Host 슬라이스를 막지 않는다. manifest의 `maxDiffPixelRatio`는 `0.02`로 유지한다.

사람 5인 30초 이해도는 `pending_external_human_evidence`로 남긴다. AI dry-run은 사람 증거가 아니다. 이 칸이 비어 있어도 Host 슬라이스 구현은 독립 시각 검토가 11/11 구성 합격이면 닫을 수 있다. ADR-0053 Accept는 닫지 않는다.

## 6. 화면 구성

캡처는 브랜드 셸, 선택된 목적지, 본문을 한 화면에 포함한다. 셸 스토리는 화면마다 현재 목적지를 넣는다. `operating-room`을 모든 Host 캡처의 current로 고정하지 않는다.

| id | 프로덕션 표면 | 첫 화면 계약 |
| --- | --- | --- |
| `host-prep-desktop` | 운영실 + 준비 단계 | ReadMates chrome, 표지, `모임 정보`/`일정 편집`/`변경 이력`, 주 행동 `대상과 문구 검토`, 준비 현황 icons/`보기`, 채워진 작업함. 보류는 접힘 |
| `host-live-desktop` | 운영실 + 현장 단계 | 같은 셸, 주 행동 `출석 확인 시작`/`모임 진행 보기`, 출석 미확인 작업. 데스크톱은 시안 08 원장. 3버튼 출석판은 모바일에만 둔다 |
| `host-closing-desktop` | 운영실 + 마감 단계 | 주 행동 `기록 초안 검토`, 마감 현황 1–5와 `보기`, 채워진 작업함 |
| `host-meetings-desktop` | 일정과 모임 | 선택된 탭이 모임, 목록/달력, 전체/준비 중 칩, 예정·지난 행, 시안과 같은 책 제목 인상 |
| `host-people-desktop` | 사람 | 선택된 탭이 사람, `이름으로 찾기`, 상태 칩, `가입 승인 대기`, 원장 열, `가입 승인 검토` |
| `host-records-desktop` | 기록 | 선택된 탭이 기록, 다음 행동 카드, 기록 원장, `마감실 열기`, 작업 항목 |
| `host-settings-desktop` | 초대와 설정 | `초대와 설정`이 현재 utility, `새 초대 링크`, 활성/만료 예정/중지 테이블, 클럽 운영 종료와 설정 행 |
| `host-schedule-review-desktop` | 일정 미열람 검토 | 두 열 대상·문구, `4명에게 안내 보내기`. 겹치는 필드·한 열 붕괴 금지 |
| `host-prep-mobile` | 운영실 준비 | 표지, `멤버 시야`, 주 행동, 번호 01–04 현황, 채워진 작업함, 하단 내비 |
| `host-live-mobile` | 운영실 현장 | 3버튼 출석판, 시안과 같은 인원 인상, avatars/glyphs/`진행 중`/`멤버 시야`, 하단 내비 |
| `host-person-mobile` | 사람 상세 | `← 사람`, FOLIO/tenure, 01–04 현재 일정/참석 응답/실제 출석/멤버십. `내 클럽` 멤버 셸 금지 |

시안 첫 화면에 보이는 블록은 기존 Host 컴포넌트로 살린다. 코드에 이미 있는 예: `CurrentMeetingHeader`의 표지와 `모임 정보`/`일정 편집`/`변경 이력`/`멤버 시야`, `HostInvitationLinks`의 `새 초대 링크`, `member-pending-zone`의 `가입 승인 대기`. 없는 것처럼 보이는 블록을 CSS만으로 비슷하게 만들지 않는다.

## 7. 데이터와 실패 상태

서버 API, DTO, mutation 의미, 권한, cursor epoch는 바꾸지 않는다. 운영 runtime은 기존 Host query를 유지한다. 시안 숫자는 CT 픽스처가 기존 뷰 모델에 넣는다.

픽스처 규칙:

- 가상 클럽 인상은 시안을 따른다. 책 제목·인원·행 구성이 시안과 다르면 구성 FAIL이다.
- 아바타는 `/assets/avatars/book-club/*.webp` catalog만 사용한다. 생성형 동물·이니셜·시안에서 자른 bitmap을 쓰지 않는다.
- 작업함 대표 상태는 채워진 `지금` 행이다. 빈 작업함을 시안 캡처로 쓰지 않는다.
- 보류 combobox는 기본 행에 0개다. `세부 조작` disclosure 뒤에 둔다.

시안 캡처는 그 화면의 대표 정상 상태만 찍는다. 빈 운영실, 로딩, 403, 409, 부분 실패, unknown attendance는 기존 unit/E2E가 유지한다. 그 상태들을 시안 첫 화면에 끌어오지 않는다. 시안에 없는 필터·보류·복구는 기본 접힘이며 키보드로 펼치면 기존처럼 동작해야 한다.

데이터가 없어서 시안 칸을 못 채울 때만 근거를 적고 그 칸을 예외로 올린다. 예외 없이 빈 칸을 시안과 같다고 보지 않는다. 구현 중 API가 필요해 보이면 계획을 멈추고 범위를 다시 승인받는다.

프론트 경계는 유지한다. `ui`는 props/callback만 렌더하고 API/query/route를 import하지 않는다. 픽스처는 CT가 뷰 모델 값을 페이지에 주입하는 경로만 추가한다.

## 8. 검증

순서:

1. 시안 id마다 첫 화면 계약을 RED 테스트로 고정한다. 선택된 탭, 표지, 주 행동 문구, 원장/작업함 행, 모바일 하단 내비가 없으면 캡처 전에 실패한다.
2. 실제 페이지 조합을 구현해 그 테스트를 통과시킨다.
3. 승인 PNG와 candidate, 50% overlay, diff, region 측정을 남긴다. Host 11장 모두 region을 채운다.
4. 구현하지 않은 검토자가 독립 시각 검토를 한다. 구성 합격 전에 `allowFontRasterException`을 켜지 않는다.
5. 구성 합격 후 leftover가 폰트/아이콘 halo일 때만 예외를 허용하고 overlay를 남긴다.

기능 회귀:

- `host-lifecycle-route-continuity.spec.ts`
- `host-authority-loss.spec.ts`
- `host-workbox-stage4.spec.ts`
- 초대/설정 관련 기존 E2E

시안 때문에 403/409/cursor 기대를 약하게 만들지 않는다.

명령:

```bash
CI=true npx --yes corepack@0.35.0 pnpm --dir front lint
CI=true npx --yes corepack@0.35.0 pnpm --dir front test
CI=true npx --yes corepack@0.35.0 pnpm --dir front build
CI=true npx --yes corepack@0.35.0 pnpm --dir front test:ct:approved
```

영향 Host E2E는 구현 계획이 지정한 spec만 실행한다. 전체 `test:ct`가 환경에서 SIGKILL 되면 통과로 기록하지 않는다. VoiceOver/NVDA는 `not measured`로 남기고 passed로 쓰지 않는다.

## 9. 작업 순서

현재 `main`에서 Host 전용 분기를 따고 격리 worktree에서 구현한다. Admin 파일은 수정하지 않는다.

1. 운영실 데스크톱 `07`–`09`
2. 운영실 모바일 `15`–`16`
3. 모임/사람/기록/설정/미열람 `10`–`14`
4. 사람 상세 모바일 `17`
5. Host 11장 독립 시각 검토
6. Host active design 시각 수락 문구, `CHANGELOG` Unreleased, ADR-0053 검증 메모(`Proposed` 유지)

화면마다 RED 첫 화면 테스트 → 실제 페이지 조합 → 캡처 → 해당 id 검토다. 공통 셸 수정이 필요하면 운영실 단계에서 목적지를 매개변수화하고, 이후 원장이 그 API를 사용한다. 같은 파일을 병렬로 편집하지 않는다.

문서 갱신 범위: 이 스펙의 구현 계획, `front/DESIGN.md` Host 시각 수락, `docs/development/2026-08-29-readmates-host-lifecycle-operating-room-design.md`의 시각 수락 상태, `docs/development/host-redesign-mockups/README.md`의 현재 근거, `CHANGELOG.md` Unreleased, ADR-0053 검증 칸. 지난 픽셀 작업의 로컬 merge/push 문제는 이 스펙에 넣지 않는다.

## 10. Acceptance matrix

- 선택: `UI or runtime state` — 대표 정상 상태의 desktop/mobile 첫 화면 구성, wrapping, default disclosure, 기존 empty/denied/error 회귀.
- 조건부 선택: route destination 표시나 URL 소유 선택을 바꾸면 해당 Host route/E2E를 확장한다.
- 제외: actor/authorization, club context, BFF/OAuth, persistence/migration, guest/public, cursor epoch, provider, public projection — 이번 설계는 해당 계약을 변경하지 않는다. 구현 중 이 경계를 건드리게 되면 중단하고 다시 승인받는다.

## 11. 완료 정의

Host 슬라이스 완료는 다음을 모두 만족할 때만 선언한다.

- Host 11장 독립 시각 검토가 첫 화면 구성 합격(폰트 leftover만 예외)
- 첫 화면 RED 테스트와 `test:ct:approved`의 Host id가 예외 규칙 아래 통과
- `lint` / `test` / `build`와 지정 Host E2E 통과
- 기능·권한·안전 계약이 약화되지 않음
- 의도적 차이와 잔여 위험이 기록됨
- code, tests, Host active design 문구가 같은 첫 화면 계약을 설명

완료로 선언하지 않는 것:

- ADR-0053 Accept
- Admin 잔여 5장 첫 화면 FAIL 해소
- 사람 30초 5인 gate
- 픽셀 비율 `0.02`
- VoiceOver/NVDA 수동 측정
- 배포, merge, push — 별도 요청 전까지 수행하지 않는다
