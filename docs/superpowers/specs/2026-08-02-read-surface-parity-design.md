# ReadMates 둘러보기·정식 멤버 읽기 화면 통합 설계

작성일: 2026-08-02
상태: DESIGN APPROVED — WRITTEN SPEC AWAITING USER REVIEW
대상 표면: frontend route, view model, UI, responsive navigation, authorization presentation

## 1. 요약

익명 `GUEST`, 인증된 `VIEWER`(둘러보기 멤버), 활성 `MEMBER`가 피드백 문서를 제외한 클럽 기록을 같은 화면 구조로 읽게 한다. `GUEST`도 정식 멤버와 같은 입력 영역을 보지만 편집할 수 없다.

정식 멤버 화면을 기준 presentation으로 삼고, 익명 사용자는 기존 guest public API를, 인증된 사용자는 기존 member API를 계속 사용한다. 각 응답은 화면별 공용 읽기 뷰 모델로 변환한다. UI는 audience 이름 대신 `canWrite`, `canReadFeedback` 같은 capability로 쓰기 액션과 잠금 상태를 결정한다.

둘러보기 사용자는 정식 멤버와 같은 홈, 오늘 세션, 클럽 노트, 아카이브, 지난 세션 상세를 본다. RSVP, 진행률, 질문, 서평 입력 영역도 같은 자리에 보이지만 읽기 전용 상태에서는 비활성화되어 새 값을 작성하거나 저장할 수 없다. 공개 기록 콘텐츠 중 audience에 따라 숨기는 내용은 피드백 문서뿐이다. `GUEST`의 내 공간은 개인 데이터가 없으므로 현재 게스트 미리보기 화면을 유지한다.

## 2. 배경과 현재 문제

최근 게스트 둘러보기 기능은 안전한 익명 조회를 위해 member API와 분리된 `GUEST_READABLE` projection을 도입했다. 이 보안 경계는 유지해야 한다. 그러나 frontend에는 같은 기록을 표현하는 UI가 audience별로 따로 생겼다.

- 익명 게스트의 오늘 세션, 노트, 아카이브, 세션 상세는 `Guest*` 전용 UI를 사용한다.
- 인증된 `VIEWER`는 오늘 세션에서 정식 멤버의 작성 화면 대신 별도 `ViewerSessionReadOnly` 화면을 사용한다.
- 정식 멤버의 노트는 공용 `NotesFeedPage`를 사용하지만 게스트 노트는 단순한 별도 `NotesReadPage`를 사용한다.
- 게스트 app shell은 모든 페이지 상단에 `게스트`, `멤버로 시작`, `공개 홈으로 나가기`를 반복한다.
- 각 guest page 하단에도 반복적인 가입 유도 카드가 나타난다.

이 구조는 같은 공개 기록을 읽는 사용자에게 서로 다른 정보 구조와 시각 언어를 제공하며, 이후 디자인 변경이 audience별 UI에서 다시 어긋날 가능성을 높인다.

## 3. 기존 게스트 설계와의 관계

이 문서는 `2026-08-02-readmates-guest-browsing-design.md`의 다음 핵심 경계를 유지한다.

- 익명 사용자에게 `ROLE_VIEWER`를 부여하지 않는다.
- guest public endpoint와 member endpoint를 합치지 않는다.
- guest DTO와 SQL projection은 명시적 allowlist를 유지한다.
- guest와 member React Query cache key를 공유하지 않는다.
- 피드백 문서 본문과 metadata는 `GUEST`와 `VIEWER`에게 공개하지 않는다.
- `GUEST_READABLE`과 public-site `PUBLIC_RECORD`를 같은 의미로 합치지 않는다.

다만 이전 설계의 audience별 전용 presentation, 상단의 지속적인 전환 액션, 일반 읽기 페이지의 반복 가입 유도 정책은 이번 승인에 따라 대체한다. 보안상 분리된 데이터 경계 위에서 presentation만 통합한다.

## 4. 목표

1. 피드백 문서를 제외한 읽기 가능 화면의 정보 구조와 디자인을 정식 멤버 기준으로 통합한다.
2. 익명 guest public API와 인증 member API의 권한 경계를 유지한다.
3. `GUEST`와 `VIEWER`는 읽을 수 있는 모든 공개 기록과 입력 영역을 같은 renderer로 보되 모든 쓰기 control은 비활성화한다.
4. 페이지마다 반복되는 가입 유도를 제거하고, 잠긴 기능을 직접 시도했을 때만 전환 안내를 제공한다.
5. desktop과 mobile에서 같은 권한 의미와 정보 순서를 유지한다.
6. audience별 화면 복제를 줄여 이후 디자인 변경이 한 renderer에 반영되게 한다.
7. `GUEST`의 내 공간은 동일 화면 통합 대상에서 제외하고 현재 정보 없는 미리보기 경험을 유지한다.

## 5. 비목표

- guest public endpoint, server authorization, DB schema 또는 exposure 정책 변경.
- guest에게 member DTO 또는 개인화된 `my*` 필드 공개.
- 익명 RSVP, 체크인, 질문, 한줄평, 서평 작성.
- `VIEWER`의 정식 멤버 자동 승격.
- 피드백 문서 공개 범위 확대.
- 공개 홈 `/clubs/:slug`와 app route의 정보 구조 통합.
- 호스트 운영 화면 변경.
- 없는 개인 상태를 placeholder나 가상 값으로 생성.
- guest 내 공간, 알림, 설정 같은 계정 전용 화면을 정식 멤버 화면과 동일하게 만드는 작업.

## 6. 검토한 접근

### 6.1 선택: 공용 읽기 뷰와 audience별 adapter

각 API 계약은 유지하고 route/model 계층에서 화면별 공용 읽기 뷰로 변환한다. UI는 capability와 실제 데이터만 받는다.

장점:

- 공개 응답의 보안 allowlist를 유지한다.
- 정식 멤버와 둘러보기 사용자가 같은 renderer를 사용한다.
- UI 변경이 audience별로 다시 갈라지지 않는다.
- 쓰기 권한을 role 문자열 비교가 아니라 명시적 capability로 검증할 수 있다.

### 6.2 제외: guest 전용 UI를 정식 멤버처럼 다시 꾸미기

초기 변경량은 작지만 같은 화면을 계속 두 벌로 유지한다. 정보 순서, 반응형 처리, 접근성, copy가 다시 달라질 위험을 남긴다.

### 6.3 제외: guest가 member API와 member route를 그대로 사용하기

코드는 단순해 보이지만 익명 응답에 개인화·내부 필드가 섞일 수 있다. 브라우저에서 필드를 숨기는 것은 API 권한 경계를 대신할 수 없다.

## 7. Audience와 capability 계약

화면 renderer는 `GUEST`, `VIEWER`, `MEMBER` 같은 role 문자열을 직접 분기하지 않는다. route/model adapter가 다음 capability를 계산한다.

```ts
type ReadSurfaceCapabilities = {
  canWrite: boolean;
  canReadFeedback: boolean;
  canViewPersonalState: boolean;
};
```

| audience | 공개 기록 읽기 | 개인 상태 읽기 | 쓰기 | 피드백 문서 |
| --- | --- | --- | --- | --- |
| `GUEST` | 동일 renderer와 동일 입력 영역 | 없음 | 불가 | 불가 |
| `VIEWER` | 동일 renderer | 응답에 실제 값이 있을 때만 읽기 전용 | 불가 | 불가 |
| active `MEMBER` | 동일 renderer | 가능 | 가능 | 기존 가용성 규칙에 따름 |
| active `HOST` | member renderer 또는 기존 host route | 가능 | 가능 | 기존 가용성 규칙에 따름 |

`SUSPENDED`, `LEFT`, inactive membership의 현재 authorization 정책은 이번 범위에서 바꾸지 않는다. 이 상태가 public guest projection으로 fallback하는 기존 규칙도 유지한다.

“같은 화면”은 같은 heading hierarchy, 정보 순서, 목록·필터·카드·입력 renderer, responsive behavior를 뜻한다. 공개 기록 콘텐츠 중 audience 때문에 제외하는 section은 피드백 문서뿐이다. 기존 guest 보안 계약이 금지하는 개인 식별자, 정확한 장소, 접속 credential, 개인화된 `my*` 필드는 공개 기록 콘텐츠가 아니므로 새로 노출하지 않는다. API에 존재하지 않는 개인 값을 만들어 채우지 않으며, 그런 입력은 빈 disabled 상태로 남는다. 내 공간과 다른 계정 전용 route는 이 parity 계약의 대상이 아니다.

## 8. Frontend architecture

### 8.1 데이터 흐름

```text
Guest public response ─> guest adapter ─┐
                                       ├─> feature read view ─> shared renderer
Member response ───────> member adapter ┘                         │
                                                                  └─> capability로 action 결정
```

- route는 loader/query, URL state, pagination, retry와 adapter 조립을 담당한다.
- model은 API response를 presentation용 read view로 변환한다.
- UI는 read view와 callback/capability만 받고 API 또는 route를 import하지 않는다.
- `front/shared`에는 둘 이상의 feature가 실제로 공유하는 primitive만 둔다.
- 현재 세션처럼 feature-owned UI는 `features/current-session/ui`에 두되 guest route에서도 사용할 수 있는 prop contract를 제공한다.
- 하나의 거대한 전역 audience view model을 만들지 않고 홈, 현재 세션, 노트, 아카이브, 세션 상세별 작은 view contract를 유지한다.

### 8.2 쓰기 action 경계

- 정식 멤버와 읽기 전용 사용자는 같은 입력 section과 control hierarchy를 본다.
- `canWrite=true`일 때만 mutation callback이 실제 API 저장으로 이어진다.
- `canWrite=false`이면 RSVP, 진행률, 질문, 서평 input과 추가·삭제·저장 button을 렌더링하되 모두 비활성화한다.
- `fieldset disabled`, native `disabled`, 필요한 custom control의 `aria-disabled`를 사용하고 event handler에서도 mutation을 차단한다.
- 기존 값이 있는 `VIEWER`는 같은 input에 그 값을 표시하되 수정할 수 없다.
- 개인 값이 없는 `GUEST`는 빈 disabled input을 본다. RSVP, 진행률, 작성 완료 여부 같은 개인 상태를 임의의 값으로 채우지 않는다.
- 짧은 `읽기 전용` 상태 표시로 비활성화 이유를 설명하되 section마다 긴 권한 안내를 반복하지 않는다.

## 9. 화면별 설계

### 9.1 App shell

모든 guest app page의 desktop top navigation과 mobile header에서 `GuestAccountControl`이 제공하던 다음 묶음을 제거한다.

- `게스트` badge
- `멤버로 시작`
- `공개 홈으로 나가기`

navigation, mobile tab bar, active route 표시는 기존 member app 구조를 유지한다. account control 자리는 억지로 채우지 않는다. 로그아웃 action도 만들지 않는다.

### 9.2 홈

정식 멤버 홈의 page frame과 공개 가능한 section renderer를 사용한다.

- 현재 세션
- 예정 세션
- 최근 공개 기록
- 기록으로 이동하는 navigation

정식 멤버 홈의 공통 section과 자리 배치를 그대로 유지한다. 개인 값이 필요한 입력 또는 상태는 `GUEST`에서 빈 disabled 상태로 표시하고 값을 추론하지 않는다. 홈 위젯의 독립 loading/error/retry 경계는 유지한다.

### 9.3 오늘 세션

정식 멤버 화면의 다음 읽기 영역을 공유한다.

- 책 표지, 회차, 날짜·시간, 질문 마감 등 공개 가능한 header 정보
- 공개 가능한 세션 정보
- 참석자
- 공동 보드 질문과 장문 서평
- 공개된 한줄평·하이라이트가 current-session view에 포함되는 경우 해당 section

기존 `ViewerSessionReadOnly`처럼 별도의 카드 집합으로 전체 화면을 교체하지 않는다. `GUEST`와 `VIEWER`는 같은 page frame과 입력 section을 보되 모든 쓰기 control은 비활성화된다. `VIEWER`에게 실제 개인 기록이 있으면 같은 form에 표시하고, `GUEST`에게 없는 개인 값은 빈 disabled 상태로 둔다.

### 9.4 클럽 노트·기록

guest의 단순 `NotesReadPage` 대신 정식 멤버가 사용하는 `NotesFeedPage` renderer와 view contract를 사용한다.

- 선택 세션 header
- 세션별 기록 rail 또는 mobile picker/sheet
- 하이라이트·한줄평·질문 filter
- 작성자와 avatar가 포함된 기록 목록
- 기존 URL `sessionId`, filter, pagination, view transition

guest adapter는 공개 note session과 note feed를 기존 shared note model이 요구하는 형태로 매핑한다. member와 guest query key 및 API 호출은 계속 분리한다.

### 9.5 아카이브

정식 멤버 아카이브의 list presentation을 사용한다. guest에게 허용된 책, 회차, 날짜, 참석 수, 상태만 adapter로 전달한다. 개인 기록 수나 내부 운영 상태처럼 guest response에 없는 값은 추가하지 않는다.

### 9.6 지난 세션 상세

정식 멤버 세션 상세의 공개 section renderer를 사용한다.

- 책과 세션 identity
- 공개 요약
- 하이라이트
- 질문
- 한줄평
- 공개 서평
- 공개 가능한 참석 정보

피드백 문서는 잠금 상태로 남긴다. guest response에 피드백 metadata를 추가하지 않으며, UI도 존재 여부·파일명·버전·업로드 시각을 추론하지 않는다.

### 9.7 내 공간과 계정 전용 route

`GUEST`의 `/app/me`는 개인 데이터가 없으므로 현재 `GuestMySpace` 미리보기 화면을 유지한다. 정식 멤버의 프로필, 참여 이력, 개인 기록을 빈 값으로 흉내 내지 않는다.

알림과 설정도 계정이 필요한 기존 잠금 경계를 유지한다. 이 화면들은 클럽의 공개 기록을 읽는 surface가 아니므로 이번 동일 화면 계약에 포함하지 않는다.

## 10. 가입 유도와 잠금 정책

일반적인 읽기 중에는 가입을 반복적으로 요구하지 않는다.

제거 대상:

- 모든 guest page 상단의 지속적인 `멤버로 시작`과 `공개 홈으로 나가기`.
- 홈과 세션 상세 하단의 반복 `ConversionPrompt`.
- 다른 일반 읽기 page에 추가된 동일 목적의 전환 카드.

유지 대상:

- 피드백 문서를 직접 선택했을 때의 안내.
- 현재 guest 내 공간 미리보기와 알림·설정 등 계정 전용 잠금 안내.
- 잠금 dialog 또는 locked page 안의 한 번의 `멤버로 시작` action.
- 선택한 원래 경로를 보존하는 안전한 `returnTo`.

잠금 안내는 사용자의 행동에 대한 응답이어야 한다. 읽는 동안 항상 보이는 광고나 경고처럼 동작하지 않는다.

## 11. 오류와 경계 사례

- 홈의 일부 widget 실패는 성공한 widget을 유지하고 해당 영역만 재시도한다.
- note/archive continuation 실패는 이미 불러온 목록을 유지하고 목록 아래에서 재시도한다.
- guest 429는 기존 bounded `Retry-After` 안내를 유지한다.
- 존재하지 않거나 해당 클럽의 `GUEST_READABLE` 범위 밖인 session은 404로 처리한다.
- guest와 member loader/query 오류를 한 cache나 error state로 합치지 않는다.
- 피드백 접근 거절은 generic server error가 아니라 의도된 잠금 경험으로 처리한다.
- session expiry 후 guest-readable route로 이어지는 기존 검증 흐름을 유지한다.
- 공개 응답에 빠진 optional field 때문에 member renderer가 crash하지 않도록 adapter가 명시적 nullable/omission contract를 제공한다.

## 12. 접근성과 responsive behavior

- 같은 renderer를 사용해 desktop과 mobile의 heading order, navigation label, filter semantics를 맞춘다.
- 읽기 전용 상태를 color만으로 표현하지 않는다. 필요한 위치에 짧은 `읽기 전용` text를 제공한다.
- native disabled control은 keyboard focus와 submit 대상에서 제외한다. custom control은 `aria-disabled`와 event guard를 함께 적용한다.
- 잠금 dialog는 기존 focus trap, Escape 닫기, opener focus 복원을 유지한다.
- mobile picker, sheet, tab bar의 touch target과 현재 선택 상태를 유지한다.
- 한국어와 영어 제목·작성자명이 control 또는 card 밖으로 넘치지 않게 기존 wrapping contract를 재사용한다.
- notes view transition과 reduced-motion fallback을 audience에 관계없이 동일하게 유지한다.

## 13. TDD와 검증

### 13.1 실패 test 우선

production 변경 전에 다음 characterization/acceptance test를 추가한다.

1. guest adapter와 member adapter가 같은 공개 입력에서 동등한 read view를 만든다.
2. `GUEST`, `VIEWER`, `MEMBER`가 피드백 문서를 제외한 같은 공개 heading, 목록, filter와 input section을 본다.
3. `GUEST`와 `VIEWER`의 input·추가·삭제·저장 control은 비활성화되고 mutation이 호출되지 않는다.
4. `VIEWER`의 실제 개인 기록은 disabled form에 표시되며 guest에게 없는 개인 상태는 만들어지지 않는다.
5. 모든 guest shell에서 상단 account conversion control이 사라진다.
6. 일반 읽기 page에는 반복 conversion prompt가 없고 잠긴 기능을 직접 선택했을 때만 안내가 열린다.
7. 피드백 metadata와 본문이 guest/viewer presentation에 전달되지 않는다.
8. notes의 세션 선택, filter, pagination, desktop rail, mobile sheet가 guest와 member에서 같은 renderer를 사용한다.
9. guest 내 공간은 현재 개인 데이터 없는 미리보기 화면을 유지한다.

예상 focused test 범위:

```bash
corepack pnpm --dir front exec vitest run \
  features/guest-browse/model/guest-read-views.test.ts \
  features/guest-browse/ui/guest-shell.test.tsx \
  features/guest-browse/ui/guest-surfaces.test.tsx \
  features/current-session/ui/current-session-review-visibility.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/notes-feed-page.test.tsx
```

실제 구현 계획에서는 renderer 경계가 확정된 뒤 테스트 파일을 더 좁히거나 co-located test를 추가할 수 있다.

### 13.2 Frontend boundary와 regression

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

### 13.3 Browser evidence

local fixture 또는 public-safe E2E fixture로 다음을 확인한다.

- 1280px desktop과 390px mobile의 guest, viewer, member 홈.
- 오늘 세션의 같은 header·공동 보드·입력 section과 audience별 enabled/disabled 차이.
- 노트의 세션 전환, filter, load-more, mobile sheet.
- 아카이브 list와 세션 상세의 공개 section 순서.
- guest 상단과 일반 page 하단에 반복 가입 유도가 없음.
- 피드백을 직접 선택했을 때 잠금 안내가 열리고, 내 공간은 현재 guest 미리보기를 유지함.
- runtime console error와 접근성 위반이 없음.

실제 member data, private domain 또는 deployment value를 fixture·screenshot·문서에 넣지 않는다.

## 14. 예상 변경 표면

구현 계획은 현재 코드 확인 후 파일 단위 task로 좁히되, 예상 owner는 다음과 같다.

- `front/features/guest-browse/model/guest-read-views.ts`
  - guest public response를 feature read view로 매핑.
- `front/features/guest-browse/route/guest-scoped-app-route.tsx`
  - guest loader data와 공용 renderer 조립.
- `front/features/guest-browse/ui/guest-surfaces.tsx`
  - 전용 page renderer 축소 또는 제거, 공용 presentation composition.
- `front/features/guest-browse/ui/guest-account-control.tsx`
  - 지속적인 상단 conversion control 제거에 따라 삭제 여부 결정.
- `front/src/app/layouts/app-route-layout.tsx`
  - guest account control 제거와 기존 navigation 유지.
- `front/features/current-session/model/**`, `route/**`, `ui/**`
  - capability-driven shared current-session renderer.
- `front/shared/model/notes-feed-model.ts`, `front/shared/ui/notes-feed-page.tsx`
  - guest notes adapter와 동일 renderer contract.
- `front/features/archive/model/**`, `route/**`, `ui/**`
  - archive list와 session detail의 공개 read view 재사용.
- 관련 co-located unit test와 `front/tests/e2e/guest-browsing.spec.ts`.

server, migration, BFF contract 변경은 예상하지 않는다. 구현 중 공개 API가 승인된 읽기 UI에 필요한 공개 필드를 실제로 제공하지 않는다고 확인되면 frontend에서 값을 추론하지 않고 별도 설계 판단으로 멈춘다.

## 15. Acceptance matrix 선택

- 선택: `Actor or authorization`
  - 이유: `GUEST`, `VIEWER`, `MEMBER`의 읽기 parity와 쓰기·피드백 capability 차이가 핵심이다.
  - evidence: audience별 model/component test, locked-route test, guest E2E.
- 선택: `UI or runtime state`
  - 이유: 같은 renderer, partial error, empty state, desktop/mobile 동등성이 핵심이다.
  - evidence: focused UI test, frontend gates, browser 확인.
- 선택: `Browser, BFF, or OAuth`
  - 이유: guest route와 안전한 `returnTo` 기반 잠금 전환을 유지한다.
  - evidence: guest navigation unit/E2E와 전체 guest journey.
- 인접 row 제외: `Schema or migration`, `Cache or async side effect`
  - 이유: DB, exposure model, cache contract를 변경하지 않는다.

## 16. 완료 기준

- 피드백을 제외한 guest/viewer/member 기록 surface가 같은 renderer, 정보 hierarchy, 입력 영역을 사용한다.
- guest public API와 member API가 계속 분리되고, guest 응답에 개인화·피드백 필드가 추가되지 않는다.
- guest/viewer는 정식 멤버와 같은 입력 영역을 보지만 모든 write control이 비활성화되고 mutation을 호출할 수 없다.
- guest page 상단과 일반 page 하단의 반복 가입 유도가 제거된다.
- 잠긴 기능을 직접 선택했을 때만 가입 안내와 안전한 return path가 제공된다.
- guest 내 공간과 계정 전용 route는 현재 preview/locked 경험을 유지한다.
- desktop/mobile의 홈, 오늘 세션, 노트, 아카이브, 세션 상세이 검증된다.
- focused test, frontend boundary test, lint, full test, build, E2E, browser evidence가 실제 실행 결과와 함께 기록된다.
