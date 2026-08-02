# ReadMates 아바타 크기와 선택 UX 개선 설계

작성일: 2026-08-02

상태: 사용자 방향 승인 완료, 작성본 검토 대기

대상 표면: frontend member, host, public/guest avatar UI와 shared brand mark

## 1. 요약

현재 ReadMates 아바타는 같은 인물 표현이라도 18px부터 72px까지 화면별 숫자가 흩어져 있다. 최근 일부 홈과 노트 표면을 확대했지만, 내 공간 대표 아바타의 모바일 크기는 46px로 다시 축소되고, 공개 기록과 현재 회차의 조밀한 작성자 표시는 여전히 18~24px에 머문다. 반대로 공용 브랜드 마크는 최근 30px에서 34px로 커져 콘텐츠에 비해 시각적 무게가 커졌다.

프로필 편집의 아바타 선택 화면은 서정 이름 metadata를 이미 갖고 있지만 타일에는 그림만 표시한다. 선택된 타일은 넓은 빈 영역 전체에 테두리가 생기고 원형 체크가 경계에 걸쳐 보여 선택 상태가 어색하다. 프로필 편집 첫 화면의 아바타 행도 전체가 다음 선택 화면을 여는 버튼이라는 단서가 약하다.

이 설계는 사용자-facing 회원·호스트·공개/게스트 표면의 아바타를 역할별 크기 체계로 통일하고, 브랜드 마크는 32px로 줄인다. 프로필 편집에서는 전체 아바타 행을 명시적인 선택 카드로 만들고, 선택 그리드에 모든 서정 이름을 표시한다. 선택 상태는 사용자가 승인한 B안인 단정한 원형 체크 배지로 표현하며, 내 공간에는 현재 아바타 이름을 보조 정보로 노출한다.

서버, BFF, API, DB, wire key, asset와 저장 동작은 바꾸지 않는다.

## 2. 목표

1. 데스크톱과 모바일에서 아바타 그림의 인물성과 차이가 식별될 만큼 충분히 크게 표시한다.
2. 같은 역할의 아바타는 같은 크기를 사용하고, 화면마다 임의 숫자가 다시 늘어나지 않게 한다.
3. 아바타 선택 진입점이 다음 선택 화면을 여는 조작부임을 처음 보는 사용자도 이해하게 한다.
4. 선택 그리드에서 그림과 서정 이름을 함께 비교할 수 있게 한다.
5. 선택, hover와 키보드 focus 상태를 서로 다른 시각 언어로 구분한다.
6. 내 공간에서 현재 아바타의 이름을 표시 이름이나 멤버십 정보와 경쟁하지 않는 보조 정보로 제공한다.
7. 320px, 390px와 wide desktop에서 overflow, 과도한 줄바꿈과 footer 가림 없이 동작한다.

## 3. 비목표

- 아바타 artwork 생성, 교체, crop 또는 WebP 재인코딩
- avatar key, catalog 순서, fallback, server enum, DB 값, migration 또는 API payload 변경
- 사용자 자유 작명, 검색, 분류, 추천 또는 즐겨찾기 기능
- 아바타 이름을 사용자 표시 이름, 알림 수신자 이름 또는 작성자 이름으로 대체
- 플랫폼 관리자 화면의 아이콘이나 아바타 일괄 변경
- 아바타가 아닌 일반 내비게이션, 상태 또는 동작 아이콘의 추가 확대
- 실제 멤버 정보, 비밀값, 배포 상태 또는 로컬 경로를 fixture나 문서에 기록

## 4. 선택한 접근

### 4.1 역할별 공용 크기 체계

모든 아바타에 같은 비율을 곱하지 않는다. 아바타가 수행하는 정보 역할에 따라 공용 크기 단계를 정의하고 각 consumer가 그 역할을 사용한다.

| 역할 | 대표 사용처 | Desktop | Mobile |
| --- | --- | ---: | ---: |
| `navigation` | 계정 메뉴와 상단 사용자 identity | 36px | 36px |
| `dense` | 공개 기록, 회차 상세, 질문·한줄평의 조밀한 작성자 | 30px | 30px |
| `author` | 노트·멤버 활동의 이름 옆 작성자 | 36px | 36px |
| `member` | 호스트 회원 목록과 출석 편집 목록 | 38px | 34px |
| `roster` | 홈 참석자 묶음과 RSVP 요약 | 42px | 38px |
| `profile` | 내 공간 대표 프로필 | 88px | 64px |
| `editor` | 프로필 편집 첫 화면의 현재 아바타 | 72px | 72px |
| `picker` | 아바타 선택 타일 artwork | 64px | 58px |

`AvatarChip`은 artwork, fallback과 decorative-image 책임을 유지한다. 공용 모듈에 의미 있는 size 상수를 두고 consumer는 raw 숫자 대신 해당 상수를 사용한다. 모바일에서 실제 조합이 달라지는 `profile`, `member`, `roster`, `picker`만 좁은 responsive CSS override를 허용한다.

브랜드 마크는 데스크톱과 모바일 모두 34px에서 32px로 줄인다. 로고 내부 책 SVG와 다른 공용 내비게이션 아이콘은 이번 설계에서 변경하지 않는다.

### 4.2 아바타 선택 진입점

프로필 편집 첫 화면은 승인된 A안인 전체 선택 카드를 사용한다.

- `아바타` field label 아래 행 전체를 기존처럼 하나의 `button`으로 유지한다.
- 왼쪽에는 72px 현재 artwork, 가운데에는 서정 이름, 오른쪽에는 이동 chevron을 둔다.
- 서정 이름 아래에 `눌러서 다른 아바타 선택`을 보조 문구로 표시한다.
- 버튼 hover는 배경과 border를 절제해 바꾸고, focus-visible은 외부 2px focus ring으로 표시한다.
- accessible name은 `아바타 선택, 현재 <서정 이름>`처럼 현재 상태와 행동을 함께 전달한다.

별도 `변경` 버튼은 추가하지 않는다. 행 전체가 이미 하나의 동작이므로 중복 focus stop과 불필요한 기능적 무게를 피한다.

### 4.3 이름이 보이는 선택 그리드

각 선택 타일은 artwork와 `BOOK_CLUB_AVATARS[].label`의 서정 이름을 세로로 배치한다.

- Desktop profile dialog: 5열
- Mobile profile dialog: 3열
- 타일은 같은 row 안에서 같은 높이를 갖고, 이름은 생략 부호 없이 전부 표시한다.
- 긴 이름은 자연스럽게 2~3줄로 줄바꿈하며 artwork와 겹치지 않는다.
- 30개 순서, sticky footer와 전체 dialog scroll 계약은 유지한다.
- 버튼 accessible name은 기존처럼 `<서정 이름>, <객관적 그림 설명> 선택`을 유지한다.
- `aria-pressed`가 selection source of truth이며 check 그림만으로 상태를 전달하지 않는다.

현재 타일이 그림만 가운데 떠 있어 선택되었을 때 빈 테두리가 과장되는 문제는 이름과 일정한 내부 padding을 추가해 해결한다.

### 4.4 승인된 B형 체크 배지

선택 타일 오른쪽 위 안쪽에 단정한 원형 배지를 둔다.

- 28~30px의 accent 색 원과 흰색 round-cap check SVG를 사용한다.
- 배지는 타일 border 안쪽으로 8~10px inset되어 테두리를 가로지르지 않는다.
- 미세한 단색 shadow만 허용하고 gradient, glow, texture와 회전은 사용하지 않는다.
- selected 타일은 2px accent border와 `accent-soft` 배경을 함께 사용한다.
- focus-visible은 selected border와 별개의 바깥 outline으로 표시한다.

사용자는 이미지 생성 에셋 사용도 허용했지만 이 배지는 20~30px 상태 표시다. 해상도, 테마 색상, focus 대비와 유지보수를 고려해 래스터 생성물 대신 CSS와 inline SVG로 구현한다. 별도 asset 파일은 만들지 않는다.

### 4.5 내 공간의 현재 아바타 이름

내 공간 프로필 identity 영역에서 멤버십 meta 아래에 `나의 아바타 · <서정 이름>`을 표시한다.

- 표시 이름보다 작은 supporting typography와 `text-3` 계열 색을 사용한다.
- pill, badge 또는 별도 card로 만들지 않아 주 사용자 이름과 경쟁하지 않게 한다.
- artwork 아래의 좁은 열에 넣지 않고 identity copy에 배치해 모바일에서도 안정적으로 줄바꿈한다.
- 프로필 편집 권한이 없는 membership 상태에서도 현재 프로필의 읽기 정보로 표시할 수 있다.

## 5. 표면별 적용 범위

### 5.1 포함

- 내 공간 대표 프로필, 프로필 편집 현재 선택과 아바타 선택 그리드
- 홈의 참석자 묶음, 최근 클럽 흐름과 모바일 멤버 활동
- 노트 feed의 질문, 한줄평과 하이라이트 작성자
- 현재 회차의 참석자, 질문과 한줄평
- 아카이브 회차 상세의 작성자
- 호스트 회원 목록과 출석 편집
- 공개 기록과 guest-readable 회차의 작성자·참석자
- 계정 identity와 공용 사용자 navigation avatar
- shared brand mark 축소

### 5.2 제외

- 플랫폼 관리자 전용 화면
- 실제 사람 identity가 아닌 장식 illustration
- avatar key가 없는 generic 상태 아이콘
- 서버, BFF, query, route loader와 저장 mutation

## 6. 데이터 흐름과 경계

`front/shared/ui/book-club-avatar.ts`가 30개 key, 서정 `label`, 객관적 `description`, fallback과 asset URL의 source of truth를 계속 소유한다.

`front/shared/ui/avatar-chip.tsx`는 normalized key로 artwork를 렌더링하고 asset 실패 시 기존 fallback을 적용한다. 이번 변경은 크기 상수를 추가하지만 이미지 `alt`, wire data 또는 metadata 전달 책임을 넓히지 않는다.

`AvatarPicker`는 현재처럼 catalog definition을 직접 읽어 visible label과 accessible name을 구성한다. `ProfileEditorDialog`와 `MemberProfileSummary`는 `bookClubAvatarLabel()`로 현재 이름을 계산한다. route, query와 API response에 label을 추가하지 않는다.

선택 과정은 계속 draft key만 변경한다. `선택 완료`는 프로필 편집 첫 화면으로 돌아가고, `변경사항 저장`만 기존 profile mutation을 실행한다.

## 7. 오류와 fallback

- unknown key는 기존 `cloud-green-book`으로 정규화한다.
- fallback 이름은 `문장 사이의 구름`, 객관적 설명은 `초록 책을 읽는 구름`을 사용한다.
- 이미지 로드 실패 시 `AvatarChip`의 기본 asset fallback을 유지한다.
- 이름 metadata 누락을 임의 문구로 숨기지 않고 manifest test로 방지한다.
- 저장 실패, dirty-close 확인, focus 복원과 disabled 상태는 현재 프로필 편집 계약을 유지한다.
- disabled picker에서는 이름과 현재 선택 상태를 볼 수 있지만 모든 타일은 계속 비활성화된다.

## 8. 접근성과 상호작용

- 모든 picker tile은 최소 44px보다 큰 실제 조작 영역을 제공한다.
- visible poetic name과 objective description을 함께 사용한 accessible name을 유지한다.
- `aria-pressed`, check 배지, border와 배경을 함께 사용해 color-only 상태를 피한다.
- keyboard focus outline은 selected border와 시각적으로 분리한다.
- 프로필 편집의 focus trap, Escape, 뒤로가기, close와 opener focus restoration을 보존한다.
- reduced-motion 환경에서 hover 또는 상태 전환 animation을 제거한다.
- 서정 이름은 Korean wrapping을 허용하며 mobile에서도 잘리거나 artwork와 겹치지 않는다.

## 9. 테스트와 검증

### 9.1 TDD 집중 테스트

구현 전에 다음 동작과 크기를 실패하는 assertion으로 먼저 고정한다.

- `AvatarPicker`: 30개 visible label, selected 타일의 B형 배지, `aria-pressed`, accessible name, onChange와 disabled
- `ProfileEditorDialog`: 현재 이름, 선택 안내 문구, chevron, avatar step 진입과 wire-key 저장
- `MemberProfileSummary`: `나의 아바타 · <서정 이름>`과 fallback 이름
- shared/member/host/public consumers: 역할별 size 상수 사용과 승인 bounding box
- picker component test: 320px, 390px와 1280px에서 열 수, 이름 줄바꿈, scroll, sticky footer와 overflow

### 9.2 자동 검증

집중 unit/component test를 먼저 실행한 뒤 저장소 고정 package manager로 frontend gate를 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

프로필 선택·저장 흐름과 전체 consumer 회귀는 기존 avatar E2E를 대상으로 검증한다.

```bash
corepack pnpm --dir front exec playwright test tests/e2e/account-navigation-avatars.spec.ts
```

### 9.3 시각 검증

- `/clubs/:slug/app`, `/app/me`, `/app/notes`, current-session, archive detail과 host member/attendance 표면
- 320px, 390px와 1280px viewport
- 긴 서정 이름, 긴 member name과 여러 참석자 조합
- selected, hover, focus-visible, disabled와 fallback asset
- mobile sticky footer가 마지막 avatar label 또는 선택 타일을 가리지 않는지 확인

## 10. 예상 구현 표면

핵심 변경은 다음 모듈에 한정한다. 정확한 consumer 목록과 test 명령은 구현 계획에서 현재 code inventory를 다시 확정한다.

- `front/shared/ui/avatar-chip.tsx`
- `front/shared/ui/readmates-brand-mark.tsx`
- `front/shared/ui/notes-feed-list.tsx`
- `front/features/archive/ui/my-page/avatar-picker.tsx`
- `front/features/archive/ui/my-page/profile-editor-dialog.tsx`
- `front/features/archive/ui/my-page/member-profile-summary.tsx`
- `front/features/member-home/ui/member-home-records.tsx`
- `front/features/current-session/ui/**`
- `front/features/archive/ui/member-session-detail-page.tsx`
- `front/features/host/ui/**`의 실제 AvatarChip consumers
- `front/features/public/ui/**`와 `front/features/guest-browse/ui/**`의 실제 AvatarChip consumers
- `front/src/styles/globals.css`
- `front/shared/styles/mobile.css`
- 관련 co-located unit/component tests, shared unit tests와 avatar E2E

## 11. 완료 기준

1. 브랜드 마크가 desktop/mobile 모두 32px로 렌더링된다.
2. 포함된 모든 사용자-facing avatar가 역할별 공용 크기 단계에 맞고 raw 숫자 drift가 남지 않는다.
3. 내 공간 대표 avatar가 desktop 88px, mobile 64px이며 이름이 supporting copy로 보인다.
4. 프로필 편집 첫 화면에서 전체 avatar 행이 선택 동작임을 이름, 안내 문구와 chevron으로 알 수 있다.
5. picker의 30개 타일이 artwork와 전체 서정 이름을 표시한다.
6. selected 타일은 안쪽 B형 원형 check, accent border와 soft background로 보이고 focus ring과 혼동되지 않는다.
7. 320px, 390px와 1280px에서 overflow, 겹침, 잘림과 footer 가림이 없다.
8. avatar asset, key, catalog order, fallback, API와 저장 payload가 바뀌지 않는다.
9. 집중 test, frontend lint/test/build와 avatar E2E가 통과하거나 실행하지 못한 명령과 이유가 명시된다.
