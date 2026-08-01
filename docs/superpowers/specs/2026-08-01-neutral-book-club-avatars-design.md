# ReadMates 중성적 북클럽 아바타 설계

작성일: 2026-08-01
상태: 구현 완료

## 1. 요약

ReadMates의 공용 `AvatarChip`은 사용자 표시 이름의 첫 글자를 원형 chip에 렌더링한다. 같은 성을 가진 멤버가 많은 한국어 이름에서는 여러 사용자가 모두 `김`처럼 보이고, 계정 trigger에서는 이 글자가 사용자 identity인지 역할 표시인지도 분명하지 않다.

Google 프로필 사진은 실제 사람을 알아보기 쉽지만 OAuth 제공자의 외부 이미지와 개인 사진을 앱·공개 기록 전반에서 노출하는 문제가 있다. 가상의 사람 얼굴을 생성해 자동 배정하면 실제 외모로 오해될 수 있고 성별·나이·인종을 임의로 부여한다.

이 설계는 사람 대신 **독서 도구와 북클럽 활동을 그린 중성적 편집 정물 아바타 20개**를 GPT Image 2로 제작한다. 각 클럽 멤버는 20개 중 하나를 고정 배정받는다. 아바타는 이름을 대신하지 않고, 항상 전체 표시 이름과 함께 사용되는 재인식 보조 표식이다.

이 문서는 `docs/superpowers/specs/2026-08-01-responsive-account-navigation-design.md`의 데스크톱 account avatar와 기존 `AvatarChip` 이니셜 표현 결정을 대체한다. `계정 ▾` label, workspace 전환, account popover 정보구조와 navigation 결정은 그대로 유지한다.

## 2. 목표

1. 같은 성을 가진 멤버도 이름 첫 글자에 의존하지 않고 빠르게 구분하게 한다.
2. 사람·성별·나이·동물 캐릭터 없이 북클럽의 활동과 기록 문화를 표현한다.
3. 20개가 서로 다르면서도 한 디자인 family로 인식되게 한다.
4. 클럽 안에서 가능한 한 중복 없이, 재방문·재로그인·화면 이동 뒤에도 같은 아바타를 유지한다.
5. 공개·멤버·호스트 화면에서 동일한 안전한 정적 자산을 사용한다.
6. 24px부터 64px까지 주요 실루엣이 식별되고 성능과 접근성을 해치지 않게 한다.
7. Google `profileImageUrl`, 사용자 업로드 이미지 또는 외부 이미지 요청에 의존하지 않는다.

## 3. 비목표

- 사람 얼굴, 사람 신체, 동물 mascot 또는 성별이 있는 캐릭터 생성
- 사용자 프로필 사진 업로드·삭제·crop 기능
- Google 프로필 사진 렌더링 또는 동기화
- 사용자가 아바타를 직접 고르는 gallery UI
- host/member 역할별 전용 아바타 또는 status badge 합성
- 아바타 단독으로 이름, 역할, RSVP, 참석 상태를 전달
- 애니메이션 avatar, 3D, GIF 또는 Lottie
- 기존 display name, short name, profile image URL의 저장·수정 정책 변경
- 외부 CDN, runtime image generation 또는 AI provider 호출

## 4. 검토한 접근

### 4.1 제외: 한 글자·두 글자 monogram

한 글자는 같은 성이 반복되고 두 글자는 `김민`처럼 실제 이름을 어색하게 자른다. 작은 원 안에서 한국어 두 글자를 읽게 하는 것도 시각 밀도가 높다. 색상 hash를 추가해도 사용자에게 색과 이름의 규칙이 보이지 않으며 동명이인은 같은 결과가 된다.

### 4.2 제외: Google 프로필 사진

Google에서 이미 받은 `profileImageUrl`을 사용할 수 있는 surface가 있지만, 공개 기록까지 같은 사진을 노출할지에 대한 별도 동의가 없다. 외부 URL의 가용성·추적·응답 실패에도 영향을 받는다. 이번 기능은 개인정보가 없는 저장소 내 정적 자산만 사용한다.

### 4.3 제외: 생성된 사람 avatar

가상 얼굴은 실제 멤버의 외모로 오인될 수 있다. 자동 배정 과정에서 성별·연령·인종을 임의로 부여하고, 사용자가 자신과 맞지 않는 표현을 받았다고 느낄 수 있다. 중성적이라는 요구를 충족하지 않는다.

### 4.4 제외: 현재와 같은 단순 outline icon

펼친 책·책등·책갈피 outline은 작은 크기에서 선명하지만 일반 UI icon set처럼 보이고 멤버별 표식으로서 개성이 약하다. 20개가 같은 선·모서리 규칙만 반복되면 서로의 기억 단서도 부족하다.

### 4.5 채택: 중성적 북클럽 편집 정물

한 아바타에 독서 도구 또는 북클럽 활동 한 장면만 담는다. 굵은 면과 2색 조합, 약한 letterpress 질감으로 현재 outline icon보다 개성을 주되 작은 크기에서 사라지는 세부 묘사는 제거한다.

## 5. 이미지 세트

### 5.1 소재 20개

세트는 다음 소재를 사용한다. 생성 과정에서 물건의 수를 늘리거나 사람·글자·브랜드를 추가하지 않는다.

| key | 주 소재 | 보조 소재 |
| --- | --- | --- |
| `reading-lamp` | 독서등 | 닫힌 책 |
| `open-book-pencil` | 펼친 책 | 연필 |
| `book-spines` | 책등 세 권 | 북엔드 |
| `bookmark-page` | 책갈피 | 접힌 페이지 |
| `notebook-pen` | 노트 | 만년필 |
| `library-stamp` | 도서관 인장 | 책 |
| `books-glasses` | 쌓인 책 | 독서 안경 |
| `index-cards` | 색인 카드 | 클립 |
| `archive-box` | 기록 보관함 | 노트 |
| `round-table-books` | 원탁 | 놓인 책들 |
| `paired-bookmarks` | 두 개의 책갈피 | 얇은 리본 |
| `book-dialogue` | 펼친 책 | 두 개의 빈 대화 카드 |
| `question-card` | 빈 질문 카드 | 닫힌 책 |
| `calendar-book` | 날짜 숫자 없는 달력 | 책 |
| `feedback-sheet` | 글자 없는 피드백 문서 | 펜 |
| `reading-notes` | 독서 노트 묶음 | 종이 띠 |
| `banded-book` | 고무 밴드를 두른 책 | 작은 bookmark |
| `desk-clock-book` | 숫자 없는 탁상시계 | 펼친 책 |
| `book-tote` | 책가방 | 책 한 권 |
| `discussion-circle` | 원형으로 놓인 책 네 권 | 중앙의 빈 공간 |

`question-card`, `calendar-book`, `feedback-sheet`의 내부에는 실제 문자, 숫자, 문장 또는 의미를 가진 glyph를 넣지 않는다.

### 5.2 공통 시각 규칙

- 정사각형 composition과 warm ivory 또는 아주 옅은 muted paper background
- 한 개의 주 실루엣과 최대 한 개의 보조 소재
- 주 실루엣은 canvas의 약 65~72%를 차지하고 가장자리 safe margin을 유지
- 얇은 outline보다 굵은 면을 우선하고 24px에서도 외곽 형태가 남게 함
- deep ink blue, muted olive, restrained rust, muted mustard 안에서 이미지당 두 색만 사용
- 종이와 인쇄 질감은 48px에서 느껴질 정도로만 약하게 사용
- 같은 shadow, glow, gradient, 3D perspective, ornate border 또는 stock icon 효과를 사용하지 않음
- 사람, 얼굴, 손, 몸, 동물, 문자, 숫자, logo, watermark를 사용하지 않음
- 귀여운 mascot, 카페 향수, fantasy sparkle 또는 일반 productivity-app illustration을 피함

### 5.3 GPT Image 2 생성 계약

각 소재는 built-in GPT Image 2 generation을 한 번씩 독립 실행한다. 서로 다른 소재를 한 contact sheet에 생성한 뒤 crop하지 않는다.

공통 prompt skeleton:

```text
Use case: logo-brand
Asset type: square neutral avatar tile for a private reading-club web app, readable at 24px
Primary request: <one approved primary subject> with <one approved supporting subject>
Style/medium: compact flat editorial letterpress still life, bold simple silhouette, slightly imperfect print texture
Scene/backdrop: flat warm ivory or pale muted paper square
Color palette: exactly two colors from ink blue, muted olive, restrained rust, muted mustard
Composition/framing: centered, subject fills 65-72 percent, generous safe margin
Constraints: no people, faces, hands, bodies, animals, text, letters, numbers, logo, watermark, thin lines, gradients, glow, shadows, 3D, ornate frames, extra objects, stock icon style
```

생성 결과가 규칙을 벗어나면 임의 편집으로 고치지 않고 해당 소재만 한 번 재생성한다. 두 번째 결과도 핵심 금지 사항을 위반하면 그 소재는 배포 세트에서 제외하고 승인된 다른 중성 소재로 교체한다.

## 6. 자산 처리와 저장

### 6.1 원본과 배포본

- 생성 원본은 검수용 source로만 사용한다.
- 최종 배포본은 같은 정사각 crop, 색 profile과 배경 처리로 정규화한다.
- 브라우저 자산은 256×256 WebP로 저장한다. 64px 표시의 고밀도 화면까지 충분하며 1024px 원본을 그대로 전달하지 않는다.
- 각 WebP는 품질과 크기를 함께 검사하고, 작은 이미지에서 보이지 않는 질감 때문에 용량이 커지지 않게 한다.
- 최종 20개만 `front/public/assets/avatars/book-club/` 아래에 의미 있는 stable key filename으로 저장한다.
- 생성 원본, 실패 variant, contact sheet, screenshot과 local prompt log는 배포 자산이나 git commit에 넣지 않는다.

### 6.2 manifest

공용 frontend manifest는 허용된 key와 정적 path만 제공한다.

```text
reading-lamp -> /assets/avatars/book-club/reading-lamp.webp
...
discussion-circle -> /assets/avatars/book-club/discussion-circle.webp
```

서버가 보내지 않은 임의 path나 외부 URL을 `<img src>`로 사용하지 않는다. 알 수 없는 key는 manifest의 고정 기본 아바타로 대체한다.

## 7. 멤버 배정

### 7.1 안정성과 중복 방지

표시 이름 hash를 20으로 나누는 방식은 사용하지 않는다. 이름 변경 때 아바타가 바뀌고, 10명 규모에서도 같은 index가 겹칠 수 있다.

각 membership에 allowlisted `avatarKey`를 저장한다.

- 기존 membership backfill은 각 클럽의 표시 대상 membership을 `created_at`, `id` 순서로 먼저 처리해 첫 20명에게 서로 다른 key를 배정한다. 그 뒤 `LEFT`, `INACTIVE`를 같은 순서로 처리하며 20개를 모두 사용하면 순환한다.
- 표시 대상 status는 `INVITED`, `VIEWER`, `ACTIVE`, `SUSPENDED`로 고정한다. `LEFT`, `INACTIVE`는 신규 배정의 사용 중 key 집계에서 제외한다.
- 새 membership은 현재 클럽의 표시 대상 membership이 사용하지 않는 key 중 하나를 배정받는다.
- 가능한 key가 여러 개이면 서버가 stable key 순서에서 첫 번째 미사용 key를 선택한다.
- 활성·표시 대상이 20명을 넘으면 모든 key가 한 번 사용된 뒤 같은 순서를 다시 사용할 수 있다.
- 표시 이름, 역할, 로그인 provider와 관계없이 배정 결과는 유지한다.
- 탈퇴 뒤에도 membership row에는 stored key를 보존하지만, 과거 공개 기록은 익명화 규칙에 따라 고정 `archive-box`를 사용한다.
- 재가입이 같은 membership을 복구하는 기존 lifecycle이면 이전 key가 현재 표시 대상에게 사용되지 않았을 때 유지한다. 이미 사용 중이면 첫 번째 미사용 key를 새로 배정한다.

동시 invitation/approval에서 같은 key가 배정되지 않도록 membership mutation transaction 안에서 club-scoped allocation을 직렬화한다. auth application service가 avatar allocation port를 호출하고, persistence adapter는 같은 transaction에서 대상 club row를 `FOR UPDATE`로 잠근 뒤 표시 대상 membership의 사용 중 key를 읽어 첫 번째 미사용 key를 반환한다. membership insert 또는 status 복구가 완료될 때까지 lock을 유지한다.

### 7.2 데이터 모델과 공개 안전

- `avatarKey`는 20개 allowlist 중 하나인 낮은 민감도의 presentation key다.
- raw membership ID, user ID, email, OAuth subject 또는 profile image URL을 아바타 path와 browser telemetry에 넣지 않는다.
- membership, author, attendee를 반환하는 화면 계약에는 필요한 경우 `avatarKey`만 추가한다.
- membership과 연결되지 않은 system/anonymous record는 고정 `archive-box` key를 사용한다.
- `LEFT` 멤버 이름 익명화 규칙과 공개 visibility 규칙은 변경하지 않으며 browser에는 stored member key 대신 고정 `archive-box` key를 반환한다.

## 8. 화면 적용

### 8.1 공용 AvatarChip

`AvatarChip`은 `avatarKey`를 받아 manifest의 정적 WebP를 렌더링한다.

- 인접한 전체 이름이 있으면 `<img alt="">` 또는 `aria-hidden` decorative image로 처리한다.
- account trigger의 접근 가능한 이름은 기존 `{전체 표시 이름} 계정 메뉴`가 소유한다.
- 이미지가 decode되지 않거나 key가 없으면 글자 monogram으로 되돌아가지 않고 고정 `archive-box` 북클럽 아바타를 사용한다.
- RSVP와 attendance는 기존 text·status treatment가 계속 소유하며 avatar 색이나 image overlay로 합성하지 않는다.
- 20~28px에서는 rounded-square crop과 주 실루엣만 보이게 하고, profile identity의 48~64px에서도 같은 원본을 사용한다.

### 8.2 적용 surface

기존 `AvatarChip` 사용처를 기준으로 다음 surface를 포함한다.

- mobile/desktop account control과 account popover identity
- 멤버 홈의 참여 멤버와 최근 작성자
- 현재 세션의 참석자, 질문, 한줄평과 장문 서평
- 내 공간 profile identity
- 멤버 archive/session detail과 notes feed
- 호스트 참석 편집과 멤버 관리
- 공개 클럽·공개 세션의 author identity

각 surface에서 전체 표시 이름 또는 기존 접근 가능한 label을 유지한다. 아바타만 단독으로 user identity를 전달하는 새 UI를 만들지 않는다.

### 8.3 반응형 계정 navigation과의 관계

- 모바일 account trigger는 승인된 visible `계정 ▾`를 유지한다. 작은 header 폭을 위해 이미지 avatar를 추가하지 않는다.
- 데스크톱 account trigger는 북클럽 아바타 + 전체 표시 이름 + chevron을 사용한다.
- popover identity는 북클럽 아바타 + 표시 이름 + membership 상태를 제공할 수 있다.
- workspace 전환 `⇄`에는 아바타를 사용하지 않는다.

## 9. 서버·API·프런트엔드 경계

### 9.1 서버

- operational migration은 `server/src/main/resources/db/mysql/migration`에 추가한다.
- auth membership lifecycle이 avatar allocation을 소유하며 controller나 read-side query가 새 key를 만들지 않는다.
- allocation은 application rule과 outbound persistence port 뒤에 둔다.
- archive, publication, note, session read adapter는 기존 membership join에서 stored `avatarKey`를 project한다.
- public read model은 기존 visibility와 `LEFT` 익명화 정책을 그대로 적용한 뒤 presentation key만 포함한다.

### 9.2 BFF

새 endpoint, secret, trusted header 또는 proxy rule은 필요하지 않다. 기존 JSON 응답의 additive field를 그대로 전달한다.

### 9.3 프런트엔드

- feature `api` contract가 해당 response의 `avatarKey`를 소유한다.
- route/model은 API field를 presentation prop으로 전달할 뿐 key를 재계산하지 않는다.
- `shared/ui/avatar-chip.tsx`와 공용 manifest는 allowlisted key를 정적 path로 변환한다.
- UI는 server ID나 display name에서 새로운 key를 hash하지 않는다.

## 10. 오류와 fallback

| 상황 | 동작 |
| --- | --- |
| API가 known `avatarKey` 제공 | 해당 정적 WebP 렌더링 |
| key 누락 또는 unknown | 고정 `archive-box` 북클럽 아바타 렌더링 |
| image load/decode 실패 | 고정 `archive-box` 북클럽 아바타로 한 번 교체 |
| 기본 이미지도 실패 | 배경색만 있는 decorative tile, 이름 text는 유지 |
| 20개 key 소진 | 이미 한 번씩 배정한 stable 순서로 재사용 |
| 생성 이미지가 금지 요소 포함 | 해당 소재 한 번 재생성, 반복 실패 시 소재 교체 |

이미지 실패는 route error boundary, account menu open state 또는 session interaction을 막지 않는다.

## 11. 접근성과 성능

- 전체 이름, membership 상태와 button label이 identity와 action의 accessible name을 소유한다.
- 이미지에 소재명을 alt text로 읽히게 하지 않는다. `독서등`, `책갈피`는 사람 이름이 아니며 반복 낭독만 만든다.
- 이미지와 배경 경계는 warm paper surface에서도 구분되는 충분한 명도·색 대비를 가진다.
- 색상만으로 사용자를 구분하지 않고 20개 주 실루엣을 다르게 한다.
- 24px, 32px, 48px, 64px에서 각 asset을 검수한다.
- 페이지에 사용되는 asset만 browser가 요청하도록 개별 정적 파일을 사용하고 20개를 하나의 sprite preload로 묶지 않는다.
- 모든 20개 WebP의 합계와 화면별 실제 전송량을 기록한다. 구현 계획의 성능 gate는 current frontend bundle/build 기준과 browser network evidence를 사용한다.

## 12. 예상 변경 표면

구현 계획에서 현재 ownership을 다시 확인해 확정한다.

- `front/public/assets/avatars/book-club/*.webp`
- 새 avatar manifest/model module
- `front/shared/ui/avatar-chip.tsx`
- `front/shared/ui/avatar-chip-utils.ts`
- `front/shared/ui/avatar-chip.ct.tsx`
- `design/system/src/styles/tokens.css`
- `front/features/**`의 avatar consumer와 API contract
- `server/src/main/resources/db/mysql/migration/V43__*.sql`
- auth membership lifecycle application/port/persistence adapter
- session, archive, publication, note, host membership read model/DTO/mapper/query
- 관련 server unit/integration/API contract tests
- 관련 frontend unit/component/E2E tests

`V43`은 현재 repository의 마지막 migration이 `V42`라는 문서 작성 시점의 예상 번호다. 구현 시작 시 migration directory를 다시 확인하고 이미 사용 중이면 다음 번호를 사용한다.

## 13. 테스트와 승인 기준

### 13.1 이미지 자산

1. 정확히 20개 allowlisted WebP가 있고 manifest와 일대일 대응한다.
2. 각 이미지가 256×256 정사각이며 사람·동물·문자·logo·watermark를 포함하지 않는다.
3. 24/32/48/64px contact sheet에서 주 실루엣을 구분할 수 있다.
4. 20개가 공통 paper, 두 색, letterpress family를 유지한다.
5. 원본·실패 variant·local prompt log가 tracked asset에 포함되지 않는다.

### 13.2 배정과 API

1. existing membership backfill이 같은 클럽의 첫 20개 표시 대상에 중복 key를 만들지 않는다.
2. 새 membership은 사용 가능한 key를 transaction 안에서 배정받는다.
3. display name·role 변경 후 key가 유지된다.
4. 탈퇴 기록과 재가입 lifecycle이 승인된 안정성 규칙을 지킨다.
5. public/member/host DTO가 membership ID 대신 allowlisted `avatarKey`만 노출한다.
6. unknown/missing key는 frontend 고정 fallback으로 안전하게 렌더링된다.

### 13.3 화면과 접근성

1. 같은 성을 가진 3명 이상이 멤버 목록에서 서로 다른 아바타로 보인다.
2. mobile `계정 ▾`, desktop account trigger, popover, 내 공간과 세션 목록이 같은 멤버 key를 일관되게 사용한다.
3. image가 실패해도 이름과 기능이 유지된다.
4. keyboard focus, account menu accessible name, RSVP/attendance label이 이미지 변경 전과 동일하게 작동한다.
5. 320px, 390px, 1280px에서 overflow나 target-size 회귀가 없다.

### 13.4 repository evidence

구현 완료 시 최소 다음을 실행한다.

```bash
corepack pnpm --dir front exec vitest run <focused-avatar-and-contract-tests>
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front test:e2e
```

이미지 contact sheet와 responsive browser screenshot은 tracked product asset이 아니라 검증 evidence로만 보관한다.

## 14. 잔여 위험

- 20개보다 많은 표시 대상 멤버가 있는 클럽에서는 key가 재사용될 수 있다. 이름 text가 항상 함께 있으므로 기능적 identity는 유지되지만 시각적 유일성은 보장하지 않는다.
- 생성 이미지 사이의 질감·여백·색 농도가 흔들릴 수 있다. 20개 전체를 한 번에 승인하지 않고 공통 규칙 위반만 한 번의 bounded regeneration pass로 정리한다.
- `avatarKey`를 많은 read DTO에 추가하면 변경 범위가 넓다. 구현 계획은 현재 `AvatarChip` consumer부터 contract trace를 만들어 누락과 불필요한 server surface를 구분해야 한다.
- 외부 Google profile URL은 저장소와 기존 contract에 남아 있을 수 있지만 이 기능은 이를 렌더링하거나 삭제하지 않는다.
- 공개 기록의 탈퇴 멤버 익명화와 author visibility는 avatar보다 우선한다. `LEFT` 또는 membership이 없는 author는 stored key를 노출하지 않고 고정 `archive-box`를 사용한다.

## 15. 이미지 생성 기록

방향 탐색은 built-in GPT Image 2 generation으로 진행했다. 최종 20개는 이 문서의 공통 prompt skeleton과 소재 표를 사용해 project-bound asset으로 생성한다. 탐색 sample과 visual companion screenshot은 최종 세트가 아니며 제품 코드나 배포 자산에 포함하지 않는다.
