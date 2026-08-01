# ReadMates 멤버 표시 이름 편집기 다듬기

작성일: 2026-08-01
상태: 디자인 승인 완료, 작성본 검토 대기

## 1. 요약

`/clubs/:clubSlug/app/me`의 표시 이름 편집을 현재 위치에 유지하면서, 편집 상태가 프로필 전체를 차지하지 않는 소형 인라인 편집기로 다듬는다.

읽기 상태의 표시 이름과 `이름 변경` action은 유지한다. 편집을 시작하면 화면에 보이던 이름 행만 입력·저장·취소 form으로 전환하고, 아바타와 멤버십 byline은 같은 위치에 남긴다. 데스크톱의 과도하게 긴 입력창, 모바일의 불균형한 저장·취소 action, 중복된 이름 위계, 겹쳐 보이는 focus treatment를 함께 해결한다.

이 문서는 `docs/superpowers/specs/2026-07-30-member-space-account-archive-ux-design.md`의 7.2절 중 이름 편집의 시각·상호작용 세부 사항만 보완한다. `/app/me`가 표시 이름 편집을 소유하고 `/app/me/settings`는 읽기 전용 계정·멤버십 정보를 소유한다는 기존 정보구조는 유지한다.

## 2. 확인한 현재 문제

2026-08-01 로컬 화면을 데스크톱 1280px과 모바일 390px에서 확인했다.

### 2.1 이름과 form의 중복

편집을 시작해도 기존 표시 이름 `h1`이 그대로 보이고 그 아래에 `이름` label과 form이 추가된다. 사용자는 이름을 바꾸는 한 가지 작업에서 현재 이름, label, 같은 값이 든 input을 연속해서 보게 된다. 편집 상태가 기존 이름 행을 전환하는 대신 별도 설정 form처럼 확장된다.

### 2.2 데스크톱의 과도한 폭

현재 form의 첫 column이 남은 너비를 모두 차지한다. 최대 20자인 표시 이름을 위한 input이 프로필 surface 대부분을 가로지르고, 작은 `저장`·`취소`와 시각적 균형이 맞지 않는다.

### 2.3 모바일 action 위계

모바일에서는 field가 한 줄을 차지한 뒤 `저장`이 남은 grid 너비를 채우고 `취소`는 문구 폭만 사용한다. 주 action과 보조 action의 높이는 같지만 폭과 시각적 무게가 크게 달라, `취소`가 form 밖의 독립 text action처럼 보인다.

### 2.4 focus가 콘텐츠보다 강함

input focus에서 border와 바깥 focus treatment가 겹쳐 두꺼운 이중 테두리처럼 보인다. 키보드 focus는 분명해야 하지만, 프로필 이름보다 먼저 보일 정도로 강할 필요는 없다.

## 3. 목표

1. 이름 변경이 표시 이름 행 안에서 일어나는 짧고 분명한 작업처럼 보이게 한다.
2. 편집 전후에 아바타와 멤버십 byline의 위치를 안정적으로 유지한다.
3. 최대 20자 입력에 맞는 폭과 action 위계를 제공한다.
4. 320px 이상의 모바일 viewport와 긴 한영 이름에서 가로 overflow를 만들지 않는다.
5. input과 모든 action에 44px 이상의 조작 영역과 분명한 단일 focus indicator를 제공한다.
6. 기존 저장·실패·권한·auth refresh·route revalidation 계약을 유지한다.

## 4. 비목표

- 표시 이름 편집을 `/app/me/settings`로 이동하거나 두 화면에 중복 제공
- modal, popover, drawer 또는 mobile bottom sheet 도입
- 프로필 이미지 또는 아바타 변경 기능 추가
- 표시 이름 API, 검증 규칙, 권한, BFF, 서버 또는 데이터베이스 변경
- 프로필·독서 성취 surface 전체 재설계
- 전역 계정 메뉴 또는 설정 화면 변경
- 성공 toast나 새로운 animation system 추가

## 5. 선택한 접근

### 5.1 소형 인라인 전환

읽기 상태는 다음 구조를 유지한다.

```text
[아바타]  내 프로필
          표시 이름  [이름 변경]
클럽 · 멤버십 · 합류 시점
```

편집을 시작하면 화면에 보이는 이름 행만 다음 form으로 전환한다.

```text
[아바타]  내 프로필
          표시 이름
          [입력________________] [저장] [취소]
클럽 · 멤버십 · 합류 시점
```

모바일에서 세 action이 한 줄에 안정적으로 들어가지 않으면 input과 action row를 두 줄로 배치한다.

```text
[아바타]  내 프로필
          표시 이름
          [입력____________]
          [저장] [취소]
클럽 · 멤버십 · 합류 시점
```

form은 새 card나 disclosure를 만들지 않는다. 현재 이름 행의 편집 상태일 뿐이며, 프로필 surface의 경계·배경·padding은 바꾸지 않는다.

### 5.2 제외한 대안

#### 작은 dialog 또는 모바일 bottom sheet

프로필 레이아웃이 움직이지 않는 장점은 있지만, 한 개 field를 바꾸기 위해 overlay focus 관리, dismissal, viewport keyboard 대응이 추가된다. 현재 작업의 복잡도에 비해 무겁다.

#### 계정 설정으로 이동

프로필 summary는 가장 간결해지지만 이름을 확인한 문맥에서 바로 바꾸지 못한다. `/app/me`는 클럽 membership 단위 표시 이름을, `/app/me/settings`는 저빈도 계정·멤버십 정보를 소유한다는 승인된 정보구조도 되돌리게 된다.

#### 현재 form의 폭만 축소

가장 작은 변경이지만 이름 `h1`과 같은 값의 input이 동시에 보이는 중복, 모바일 action 불균형, focus 과강조가 남는다. 문제를 부분적으로만 가린다.

## 6. 상세 디자인

### 6.1 읽기 상태

- 표시 이름은 페이지의 유일한 가시적 `h1`이다.
- `이름 변경`은 이름 오른쪽의 저강조 action으로 유지한다.
- 아이콘을 사용하더라도 접근 가능한 이름은 `이름 변경`이다.
- 긴 이름은 action을 화면 밖으로 밀지 않고 필요하면 자연스럽게 줄바꿈한다.

### 6.2 편집 상태

- 편집 중 기존 표시 이름은 시각적으로 반복하지 않는다.
- section의 accessible name과 heading 구조를 유지하기 위해 기존 표시 이름 `h1`은 screen-reader-only 상태로 남긴다.
- visible form label은 `표시 이름`을 사용한다.
- input은 현재 표시 이름으로 시작하고 자동 focus한다.
- 데스크톱 form은 `minmax(240px, 320px) 72px 72px` action row와 8px gap을 사용해 최대 480px를 넘지 않는다.
- input 높이와 `저장`·`취소`의 최소 높이는 44px이다.
- `저장`과 `취소`는 각각 72px의 같은 폭을 사용한다. `저장`만 남은 가로 공간을 채우지 않는다.
- action 문구는 줄바꿈하지 않는다.
- form 아래 오류 영역을 예약하지 않는다. 오류가 있을 때만 input 바로 아래에 표시하되, action과 오류의 관계가 끊겨 보이지 않게 form 전체 폭 안에 둔다.

### 6.3 반응형 배치

#### 데스크톱

- label은 form field 위에 둔다.
- input, `저장`, `취소`는 한 action row에 둔다.
- form은 profile content column의 전체 너비를 사용하지 않고 콘텐츠 폭에 맞춘다.
- 남는 오른쪽 공간은 비워 두어 personal reading desk의 차분한 여백을 유지한다.

#### 모바일

- form은 아바타 오른쪽 identity column 안에 유지한다.
- field는 사용 가능한 column 너비를 사용한다.
- action row는 field 아래에 두고 `저장`·`취소`를 각각 72px로 나란히 배치한다.
- 320px viewport에서도 두 action이 잘리거나 가로 scroll을 만들지 않는다.
- byline은 기존처럼 profile grid 전체 폭을 사용하며 edit action 옆으로 끌어올리지 않는다.

### 6.4 focus와 keyboard

- input과 button은 기존 전역 focus token을 사용하되 input에 border·outline·shadow가 중복된 이중 ring을 만들지 않는다.
- focus indicator는 WCAG AA를 만족하는 2px 단일 ring으로 보인다.
- Enter는 form을 저장한다.
- Escape는 저장 중이 아닐 때 편집을 취소하고 원래 이름을 복원한다.
- 취소 또는 저장 성공 뒤에는 `이름 변경` button으로 focus를 복원한다.
- 저장 중에는 input, `저장`, `취소`를 비활성화해 중복 제출과 draft 이탈을 막는다.

### 6.5 상태와 문구

- 기본 action은 `저장`, `취소`다.
- pending 문구는 `저장 중…`을 사용하고 button 폭이 바뀌지 않게 한다.
- 실패하면 input 값과 편집 상태를 유지한다.
- 오류는 input과 연결하고 `role="alert"`로 알린다.
- 성공 toast는 추가하지 않는다. 갱신된 표시 이름과 전역 account identity가 즉시 보이는 것을 성공 feedback으로 사용한다.
- `canEditOwnProfile`이 거짓이면 읽기 상태의 `이름 변경`만 숨기며 빈 편집 자리나 안내 문구를 만들지 않는다.

## 7. 컴포넌트와 데이터 흐름

### 7.1 변경 예상 파일

- `front/features/archive/ui/my-page/profile-name-editor.tsx`
  - 읽기·편집 상태의 가시적 전환
  - Escape 취소
  - pending 문구와 focus restoration 유지
- `front/features/archive/ui/my-page/member-space-sections.test.tsx`
  - heading, focus, 저장, 실패, 취소, 읽기 전용 회귀 검증
  - Escape 취소 검증
- `front/src/styles/globals.css`
  - form 최대 폭, 동일 action 크기, mobile row, 단일 focus treatment
- 필요 시 `front/tests/e2e/member-profile-permissions.spec.ts`
  - 실제 mobile/desktop 편집 흐름과 auth identity 갱신 검증 보강

새 shared primitive는 만들지 않는다. `ProfileNameEditor`는 기존처럼 prop과 callback만 사용하고 API, query 또는 route 모듈을 import하지 않는다.

### 7.2 유지하는 흐름

```text
이름 변경
  -> local draft 편집
  -> onUpdateProfile(trimmed displayName)
  -> 기존 profile update controller
  -> 성공 시 profile override + auth refresh + route revalidation
  -> 실패 시 기존 오류 mapping + inline alert
```

API request, 서버 validation, membership 권한, account menu 갱신 계약은 바꾸지 않는다.

## 8. 오류와 경계 사례

- 빈 값, 20자 초과, 허용되지 않는 형식, 예약어, 같은 클럽 내 중복 이름은 기존 오류 문구를 사용한다.
- 저장 실패 후 draft와 input focus 문맥을 잃지 않는다.
- 저장 중 Escape나 취소 click으로 pending request를 숨기지 않는다.
- source profile이 외부 revalidation으로 바뀌면 기존 draft 동기화 규칙을 유지한다.
- 긴 한국어·영어 표시 이름은 input, heading, account identity에서 overflow하지 않는다.
- 200% 확대와 320px viewport에서도 양방향 scroll을 만들지 않는다.
- 읽기 전용 membership은 편집 control과 편집 placeholder를 모두 렌더링하지 않는다.

## 9. 접근성 계약

- profile section은 편집 전후 동일한 표시 이름 heading으로 label된다.
- 편집 중 화면에 보이지 않는 heading은 접근성 tree에서 유지한다.
- visible `표시 이름` label과 input의 programmatic association을 유지한다.
- error text는 `aria-describedby`와 `role="alert"`로 input에 연결한다.
- 모든 interactive target은 최소 44px 높이를 제공한다.
- Tab 순서는 input -> 저장 -> 취소다.
- 저장과 취소는 keyboard, click, touch 입력 방식에 관계없이 같은 state transition과 focus 결과를 만든다.
- 상태를 색상만으로 표현하지 않는다.

## 10. 검증

### 10.1 TDD와 focused component evidence

1. 기존 test에 편집 상태의 시각적 이름 중복 제거와 screen-reader heading 유지 기대를 먼저 추가한다.
2. Escape 취소, focus restoration, pending 중 Escape 무시를 검증한다.
3. 기존 저장 성공, 오류 유지, cancel reset, read-only test를 함께 실행한다.

Focused command:

```bash
corepack pnpm --dir front exec vitest run features/archive/ui/my-page/member-space-sections.test.tsx
```

### 10.2 frontend regression

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

### 10.3 browser evidence

다음 viewport에서 `/clubs/:clubSlug/app/me`의 읽기·편집·오류·pending 상태를 확인한다.

- 1280px desktop
- 390px mobile
- 320px narrow mobile
- 200% browser zoom

확인 항목:

- 편집 중 가시적 이름이 중복되지 않음
- input이 desktop surface 전체 폭으로 늘어나지 않음
- `저장`·`취소`가 같은 크기와 44px target을 가짐
- 가로 overflow 없음
- 단일 focus ring
- Enter 저장, Escape 취소, 저장 중 중복 제출 차단
- 저장 성공 후 profile heading과 account identity 갱신
- 오류 발생 후 draft와 편집 상태 유지

기존 profile update와 club-scoped auth user flow를 변경하므로 다음 focused E2E를 실행한다.

```bash
corepack pnpm --dir front exec playwright test tests/e2e/member-profile-permissions.spec.ts tests/e2e/member-space-information-architecture.spec.ts
```

## 11. Acceptance matrix 선택

- 선택: `UI or runtime state`
  - 이유: loading/pending, error, wrapping, desktop, mobile, keyboard focus가 직접 바뀐다.
  - evidence: focused component test, frontend gates, 1280/390/320 browser 확인.
- 인접 row 제외: `Actor or authorization`
  - 이유: `canEditOwnProfile`에 따른 control 노출을 기존 test로 회귀 검증하지만 authorization 계산과 서버 정책은 바꾸지 않는다.
- 인접 row 제외: `Club context`
  - 이유: route와 update controller의 club scope를 그대로 사용하며 새로운 route/API state를 추가하지 않는다.
- 인접 row 제외: `BFF or OAuth`, `Persistence or migration`, `Async, cache, or provider`
  - 이유: 해당 경계를 수정하지 않는다.

## 12. 완료 조건

1. 이름 변경이 기존 표시 이름 행을 대체하는 소형 form으로 보인다.
2. desktop input은 콘텐츠 폭을 사용하고 profile surface 전체로 늘어나지 않는다.
3. mobile `저장`·`취소`는 같은 크기로 한 action row에 보인다.
4. 편집 전후 profile section의 heading과 accessible name이 유지된다.
5. keyboard, touch, pending, error, read-only 상태가 기존 계약을 지킨다.
6. 1280px, 390px, 320px, 200% 확대에서 겹침과 가로 overflow가 없다.
7. focused component test, frontend lint/test/build, focused E2E가 통과한다.
8. API, 서버, BFF, 데이터베이스, 설정 화면, 전역 계정 메뉴는 변경되지 않는다.
