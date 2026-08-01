# ReadMates 동물 아바타 자동 배정 및 개인 선택 설계

작성일: 2026-08-02
상태: 사용자 승인 완료, 구현 전

## 1. 요약

ReadMates는 현재 각 클럽 멤버십에 20개의 중성적 독서 정물 아바타 중 하나를 저장한다. 서버는 같은 클럽에서 아직 사용하지 않은 키를 우선 배정하고, 프런트엔드는 저장소 내 정적 WebP만 렌더링한다. 이 구조는 개인정보와 외부 이미지 의존성을 피하지만, 사용자가 자신의 아바타를 고를 수 없고 현재 정물 이미지는 개인 정체성을 기억하기 어렵다.

이 설계는 기존 20개 정물 아바타를 사용자가 제공하고 선별한 **동물 독서 캐릭터 40개**로 교체한다. 기존 멤버와 신규 멤버는 클럽 안에서 중복을 최소화한 아바타를 한 번 배정받고, 이후 `/clubs/:clubSlug/app/me`의 `내 프로필`에서 40개 중 원하는 아바타로 바꿀 수 있다. 직접 선택한 아바타는 다른 멤버와 같아도 허용하며, 저장하기 전까지 실제 프로필에는 반영하지 않는다.

아바타는 계속해서 클럽 멤버십 단위의 낮은 민감도 presentation key다. 사용자 업로드, 외부 URL, Google 프로필 사진, 런타임 이미지 생성은 도입하지 않는다.

## 2. 현재 구조와 변경 이유

현재 구조는 다음과 같다.

- `memberships.avatar_key`가 20개 wire key 중 하나를 저장한다.
- `BookClubAvatarKey`와 `BOOK_CLUB_AVATAR_KEYS`가 서버·프런트 허용 목록을 각각 소유한다.
- `JdbcMemberAvatarAllocationAdapter`가 club row를 잠그고 첫 번째 미사용 키를 반환한다.
- `AvatarChip`은 `/assets/avatars/book-club/<key>.webp`만 렌더링하고 unknown key와 이미지 실패를 고정 기본 키로 제한한다.
- `/api/me/profile`은 표시 이름만 변경하며 아바타 변경 API는 없다.
- `/app/me`의 `내 프로필`은 아바타와 이름 편집을 제공하고 `/app/me/settings`는 계정·멤버십 정보를 읽기 전용으로 보여 준다.

승인된 변경은 기존 안전 경계를 유지하면서 다음 문제를 해결한다.

1. 동물 캐릭터로 멤버 식별성과 ReadMates의 따뜻한 독서 정체성을 강화한다.
2. 접속할 때마다 바뀌는 무작위가 아니라 한 번 배정하고 저장하여 재인식 가능성을 유지한다.
3. 사용자가 자신의 캐릭터를 직접 선택할 수 있게 한다.
4. 40개 후보로 작은 클럽의 자동 배정 중복 가능성을 더 낮춘다.

## 3. 목표

1. 기존·신규 멤버십에 승인된 40개 동물 아바타 중 하나를 저장한다.
2. 신규 자동 배정은 같은 클럽의 표시 대상 멤버가 사용하지 않은 키를 우선 무작위로 고른다.
3. 기존 20개 키는 재현 가능한 한 번의 migration으로 새 40개 키에 재배정한다.
4. 사용자는 `내 공간`의 프로필에서 40개를 보고 명시적으로 저장할 수 있다.
5. 수동 선택은 중복을 허용하고 횟수 제한이나 cooldown을 두지 않는다.
6. 헤더, 계정 메뉴, 내 공간, 세션, 기록, 호스트 멤버 목록과 공개 허용 surface가 같은 저장 키를 사용한다.
7. 접근성, public visibility, 탈퇴 익명화, 정적 allowlist와 이미지 fallback을 보존한다.

## 4. 비목표

- 사용자 이미지 업로드, 삭제, crop 또는 moderation
- Google `profileImageUrl` 렌더링이나 동기화
- 외부 CDN URL 또는 사용자가 입력한 이미지 path 저장
- runtime AI 이미지 생성
- host가 다른 멤버의 아바타를 대신 변경하는 기능
- avatar별 역할, 권한, RSVP 또는 참석 상태 표현
- avatar 이름 검색, 카테고리, 즐겨찾기 또는 추천 알고리즘
- 아바타 변경 이력 UI, 감사 로그 UI 또는 변경 횟수 제한
- 이름 변경 flow와 아바타 선택 flow의 결합

## 5. 승인된 자산 40개

### 5.1 번호 규칙과 최종 제외 목록

각 source sheet는 위 행 왼쪽부터 1–5, 아래 행 왼쪽부터 6–10으로 번호를 매긴다. source sheet와 중간 crop 파일은 저장소에 넣지 않는다.

사용자가 지정한 제외 목록에, 40개로 맞추기 위한 추가 제외 한 개를 더한다.

| Sheet | 제외 slot | 비고 |
| --- | --- | --- |
| 1 | 3 | 사용자 지정 |
| 2 | 2, 3, 4, 9 | 사용자 지정 |
| 2 | 5 | 40개로 맞추기 위해 추가 제외; 유사한 사슴 독서 캐릭터 중복 축소 |
| 3 | 1, 2, 4, 8 | 사용자 지정 |
| 4 | 1, 2, 5, 8 | 사용자 지정 |
| 5 | 8 | 사용자 지정 |
| 6 | 1, 2, 3, 7, 10 | 사용자 지정 |

총 60개에서 20개를 제외하여 정확히 40개를 배포한다.

### 5.2 안정적인 wire key

키는 공개 presentation key이며 동물·소품을 설명한다. 사용자 ID, membership ID, 이름 또는 source file path를 포함하지 않는다. 기본 fallback은 `hedgehog-green-book`이다.

| Sheet | Slot | Wire key | 선택창 접근 가능한 이름 |
| --- | ---: | --- | --- |
| 1 | 1 | `hedgehog-green-book` | 초록 책을 읽는 고슴도치 |
| 1 | 2 | `squirrel-acorn` | 도토리를 든 다람쥐 |
| 1 | 4 | `deer-brown-book` | 갈색 책을 읽는 사슴 |
| 1 | 5 | `fox-glasses-mug` | 안경 쓰고 찻잔을 든 여우 |
| 1 | 6 | `koala-book-sprig` | 책과 나뭇가지를 든 코알라 |
| 1 | 7 | `polar-bear-snowflake-mug` | 눈꽃 찻잔을 든 북극곰 |
| 1 | 8 | `penguin-beret-book` | 베레모를 쓰고 책을 읽는 펭귄 |
| 1 | 9 | `cat-flower-mug` | 꽃무늬 찻잔을 든 고양이 |
| 1 | 10 | `alpaca-winter-sprig` | 목도리를 하고 나뭇가지를 든 알파카 |
| 2 | 1 | `squirrel-green-book` | 초록 책을 읽는 붉은 다람쥐 |
| 2 | 6 | `penguin-orange-mug` | 주황 찻잔을 든 펭귄 |
| 2 | 7 | `panda-green-book` | 초록 책을 읽는 판다 |
| 2 | 8 | `mouse-blue-book` | 파란 책을 읽는 생쥐 |
| 2 | 10 | `turtle-winter-book` | 겨울 모자를 쓰고 책을 읽는 거북이 |
| 3 | 3 | `ladybug-green-book` | 초록 책을 읽는 무당벌레 |
| 3 | 5 | `snail-green-book` | 초록 책을 읽는 달팽이 |
| 3 | 6 | `sloth-orange-mug` | 주황 찻잔을 든 나무늘보 |
| 3 | 7 | `alpaca-brown-book` | 갈색 책을 읽는 알파카 |
| 3 | 9 | `fennec-heart-mug` | 하트 찻잔을 든 사막여우 |
| 3 | 10 | `hedgehog-glasses-book` | 안경 쓰고 책을 읽는 고슴도치 |
| 4 | 3 | `squirrel-autumn-book` | 가을 숲에서 책을 읽는 다람쥐 |
| 4 | 4 | `penguin-heart-mug` | 하트 찻잔을 든 펭귄 |
| 4 | 6 | `deer-plaid-book` | 체크 목도리를 하고 책을 읽는 사슴 |
| 4 | 7 | `alpaca-heart-mug` | 하트 찻잔을 든 알파카 |
| 4 | 9 | `turtle-glasses-book` | 안경 쓰고 책을 읽는 거북이 |
| 4 | 10 | `owl-beret-book` | 베레모를 쓰고 책을 읽는 부엉이 |
| 5 | 1 | `bear-green-book` | 초록 책을 읽는 곰 |
| 5 | 2 | `rabbit-brown-book` | 갈색 책을 읽는 토끼 |
| 5 | 3 | `cat-heart-mug` | 하트 찻잔을 든 고양이 |
| 5 | 4 | `dog-green-book` | 초록 책을 읽는 강아지 |
| 5 | 5 | `chick-beret-book` | 베레모를 쓰고 책을 읽는 병아리 |
| 5 | 6 | `duck-green-mug` | 초록 찻잔을 든 흰 오리 |
| 5 | 7 | `hamster-green-book` | 초록 책을 든 햄스터 |
| 5 | 9 | `red-panda-orange-mug` | 주황 찻잔을 든 레서판다 |
| 5 | 10 | `sheep-brown-book` | 갈색 책을 읽는 양 |
| 6 | 4 | `fox-side-book` | 옆을 보며 책을 읽는 여우 |
| 6 | 5 | `winter-bird` | 목도리를 두른 겨울 새 |
| 6 | 6 | `mallard-orange-mug` | 주황 찻잔을 든 청둥오리 |
| 6 | 8 | `owl-glasses-book` | 안경 쓰고 책을 읽는 부엉이 |
| 6 | 9 | `hedgehog-green-mug` | 초록 찻잔을 든 고슴도치 |

### 5.3 crop과 배포 형식

- 승인 slot을 독립된 정사각 crop으로 분리한다.
- 얼굴과 책·찻잔 같은 기억 단서가 24px에서도 남도록 세로 oval의 중심을 유지하면서 여백을 줄인다.
- 모든 브라우저 자산은 256×256 WebP로 정규화한다.
- sheet의 이웃 캐릭터, 큰 바깥 여백 또는 잘린 oval border가 crop에 들어오지 않게 한다.
- 결과 파일은 `front/public/assets/avatars/book-club/<wire-key>.webp`에 둔다.
- 최종 WebP 40개만 추적한다. source sheet, 제외 slot, 임시 PNG, 작업 script 출력과 검수 contact sheet는 추적하지 않는다.
- 24, 32, 48, 64px contact sheet에서 각 캐릭터의 얼굴과 주 소품이 구분되는지 확인한다.

## 6. 승인된 사용자 경험

### 6.1 진입점

`/clubs/:clubSlug/app/me`의 `내 프로필` 안에서 현재 avatar와 `아바타 바꾸기` 문구를 하나의 button으로 묶는다. 작은 pencil badge는 시각적 affordance일 뿐 별도 focus target이 아니다. 현재 이름 편집과 같은 개인 identity 영역에 두고 `/app/me/settings`로 이동시키지 않는다.

### 6.2 선택창

- 데스크톱은 중앙 modal, 모바일은 bottom sheet를 사용한다.
- 40개를 모두 보여 주며 검색, 분류 또는 pagination은 추가하지 않는다.
- 데스크톱은 충분한 폭에서 8열, 모바일은 4열이다. 더 좁은 폭에서는 최소 44px target을 지키는 범위에서 CSS grid가 자동으로 줄어든다.
- 모바일은 제목과 footer action을 고정하고 avatar grid만 스크롤한다.
- 현재 저장 avatar에 테두리와 check를 함께 표시한다.
- tile을 누르면 dialog 안의 draft selection만 바꾼다.
- draft와 현재 저장 key가 같으면 `이 아바타로 변경`을 비활성화한다.
- primary action을 누를 때만 저장하며 진행 중에는 `변경 중…`으로 바꾸고 중복 submit을 막는다.
- 취소, Escape, backdrop dismissal은 저장하지 않고 기존 avatar를 유지한다.
- 저장 성공 시 dialog를 닫고 opener로 focus를 돌린다.
- 저장 성공 직후 내 공간 profile, desktop/mobile account identity와 같은 현재 인증 identity surface를 갱신하고 관련 loader/query를 재검증한다.

### 6.3 접근성

- 일반 avatar는 인접한 전체 표시 이름이 identity를 소유하므로 decorative image로 렌더링한다.
- picker tile은 button이며 `초록 책을 읽는 고슴도치 선택` 같은 접근 가능한 이름을 가진다.
- 선택 상태는 색상만 사용하지 않고 border, check와 `aria-pressed` 또는 동등한 selection semantic을 함께 제공한다.
- 모든 tile과 action의 target은 최소 44×44px다.
- modal/bottom sheet는 focus를 내부에 가두고 열릴 때 현재 선택 tile 또는 heading에 focus를 둔다.
- 닫힌 뒤 `아바타 바꾸기` opener로 focus를 복귀한다.
- Korean/English wrapping, 200% zoom, reduced motion과 320px 폭에서 action overlap이 없어야 한다.

## 7. 배정 및 persistence 규칙

### 7.1 기존 membership 전환

현재 마지막 operational migration은 V43이다. 구현은 새 forward-only migration에서 기존 20-key check constraint를 새 40-key constraint로 교체하고 모든 기존 membership row를 새 key로 한 번 재배정한다. V43을 수정하지 않는다.

Migration은 재현 가능해야 하므로 SQL runtime random 순서에 의존하지 않는다. 각 club에서 표시 대상 status를 먼저 두고 membership 식별자와 고정 version salt를 해시한 안정적인 순서로 row number를 만든 뒤, 고정된 40-key permutation에 순환 배정한다. 결과는 사용자에게 무작위처럼 분산되지만 동일한 입력으로 다시 검증할 수 있다.

표시 대상 status는 기존 계약과 같은 `INVITED`, `VIEWER`, `ACTIVE`, `SUSPENDED`다. `LEFT`, `INACTIVE`도 stored key를 받아 schema invariant를 지키지만 자동 배정의 현재 사용 중 집계에서는 제외한다.

### 7.2 신규 membership 자동 배정

- club row를 `FOR UPDATE`로 잠그는 현재 transaction boundary를 유지한다.
- 현재 표시 대상 membership이 사용하지 않은 새 key 집합을 구한다.
- 집합이 비어 있지 않으면 그 안에서 하나를 무작위로 선택한다.
- 40개가 모두 사용 중이면 전체 40개에서 무작위로 하나를 선택한다.
- 선택 결과는 membership row에 저장하고 로그인, 새로고침, 이름 변경 또는 역할 변경으로 바꾸지 않는다.
- 기존 membership을 복구하는 재가입 flow는 저장된 새 key가 유효하면 그대로 유지한다. 수동 선택은 중복을 허용하므로 다른 멤버와 같다는 이유로 재배정하지 않는다.

무작위 선택은 test에서 제어 가능한 collaborator 또는 deterministic index source 뒤에 두어 첫 미사용 키 고정과 flaky test를 피한다. 보안 token 생성 용도가 아니므로 cryptographic secrecy는 요구하지 않는다.

### 7.3 수동 선택

- 사용자는 자신의 현재 club membership만 변경할 수 있다.
- 40개 모두 항상 선택 가능하며 다른 활성 멤버가 사용 중인 key도 막지 않는다.
- 변경 횟수, cooldown 또는 별도 승인 절차를 두지 않는다.
- 같은 사용자가 여러 club에 속하면 club마다 별도 key를 저장한다.
- 여러 기기에서 동시에 저장하면 마지막으로 성공한 commit이 authoritative하다.

## 8. 서버·API 설계

### 8.1 전용 endpoint

이름 변경과 분리된 same-origin BFF 경유 endpoint를 사용한다.

```http
PATCH /api/me/avatar
Content-Type: application/json

{
  "avatarKey": "hedgehog-green-book"
}
```

성공 응답은 현재 `MemberProfileResponse`와 같은 profile shape를 사용하여 authoritative `avatarKey`를 반환한다.

### 8.2 책임 경계

- inbound adapter는 request parsing, use case 호출, response/error mapping만 수행한다.
- auth application service는 현재 member 해석, `canEditOwnProfile` 권한, allowlist validation, mutation orchestration과 cache invalidation을 소유한다.
- outbound profile store port는 clubId와 membershipId로 `avatar_key`만 갱신하는 명시적 method를 제공한다.
- JDBC adapter는 조건부 update와 row mapping을 소유한다.
- controller, read-side query와 frontend는 key를 생성하거나 임의 path로 변환하지 않는다.

예상 application error code는 다음과 같다.

- `AVATAR_KEY_REQUIRED`: null 또는 blank
- `AVATAR_KEY_INVALID`: 40-key allowlist 밖의 값
- 기존 `AUTHENTICATION_REQUIRED`, `MEMBERSHIP_NOT_ALLOWED`, `MEMBER_NOT_FOUND`

### 8.3 cache와 projection

성공 commit 뒤 현재 auth/profile identity와 club content cache를 무효화한다. session, archive, note, publication, host member read adapter는 이미 stored `avatar_key`를 project하므로 contract shape를 바꾸지 않고 새 wire value를 전달한다. BFF route, secret 또는 trusted header 변경은 없다.

## 9. 프런트엔드 설계

### 9.1 shared manifest와 AvatarChip

- `front/shared/ui/book-club-avatar.ts`는 정확히 40개 새 key와 접근 가능한 picker label metadata를 제공한다.
- 일반 consumer는 계속 `avatarKey`만 받고 local static path로 변환한다.
- unknown 또는 legacy key는 `hedgehog-green-book`으로 normalize한다.
- requested image 실패 시 기본 고슴도치로 한 번 교체하고, 기본 이미지도 실패하면 neutral tile만 남긴다.
- 이름 text와 route interaction은 이미지 실패와 무관하게 유지한다.

### 9.2 feature 경계

- `features/archive/api`가 avatar request/response contract와 BFF call을 소유한다.
- `features/archive/queries`가 mutation hook과 관련 query invalidation을 소유한다.
- `features/archive/route`가 loader profile, draft override, revalidation과 UI callback assembly를 소유한다.
- `features/archive/ui/my-page`가 dialog/bottom-sheet presentation, focus, draft selection과 error display를 소유하되 fetch나 query module을 import하지 않는다.
- current `ProfileNameEditor`의 draft/save state와 avatar picker state는 서로 독립적이다.

저장 성공 시 server response를 local authoritative override로 반영한 뒤 account auth/profile data와 current route loader를 재검증한다. 단순한 optimistic global commit은 하지 않는다. 이 순서로 저장 실패 때 다른 surface가 저장되지 않은 avatar를 보여 주는 문제를 막는다.

## 10. 오류 처리

| 상황 | 사용자 동작 |
| --- | --- |
| 저장 성공 | dialog를 닫고 모든 현재 identity surface를 갱신, opener focus 복귀 |
| network 또는 server 실패 | dialog 유지, draft 유지, 기존 저장 avatar 유지, `아바타를 변경하지 못했습니다. 다시 시도해 주세요.` alert와 재시도 제공 |
| membership edit 불가 | 저장하지 않고 permission error 표시, 현재 avatar 유지 |
| unknown API key | 기본 고슴도치 렌더링, route는 계속 동작 |
| requested image load 실패 | 기본 고슴도치로 한 번 fallback |
| 기본 이미지도 실패 | neutral decorative tile만 남기고 인접 이름과 action 유지 |
| 동시에 여러 저장 | 마지막 성공 response와 후속 revalidation 결과 사용 |

Error message는 `role="alert"` 또는 동등한 live region을 사용한다. 실패 뒤 primary action은 다시 활성화되어야 하며 닫기와 취소를 막지 않는다.

## 11. 공개 안전과 privacy

- browser가 구성하는 asset URL에는 allowlisted presentation key만 사용한다.
- source sheet, local path, user ID, membership ID, email, OAuth subject와 `profileImageUrl`을 asset path 또는 telemetry에 넣지 않는다.
- 공개 record가 보여 줄 수 있는 것은 기존 visibility가 허용한 이름과 presentation key뿐이다.
- `LEFT`와 익명 author는 stored personal key 대신 고정 `hedgehog-green-book`을 사용하여 기존 익명화 정책을 유지한다.
- avatar 변경은 record visibility, role, membership status, RSVP 또는 attendance authorization을 바꾸지 않는다.

## 12. 검증

### 12.1 자산

1. manifest와 product asset이 정확히 40개이며 key가 일대일로 대응한다.
2. 제외 표의 20개 slot이 배포 asset에 없고 승인 표의 40개가 모두 있다.
3. 각 WebP가 256×256이고 source sheet 또는 이웃 캐릭터가 crop에 남지 않는다.
4. 24, 32, 48, 64px contact sheet에서 얼굴과 기억 단서가 구분된다.
5. 전체 asset 합계와 실제 화면 request 수를 기록하고 source sheet·중간 산출물이 git에 들어오지 않았음을 확인한다.

### 12.2 서버와 migration

1. V43 상태에서 새 migration으로 정상 upgrade되고 모든 old key가 새 allowlist key로 바뀐다.
2. club별 재배정이 재현 가능하고 첫 40개 표시 대상에 중복이 없다.
3. 신규 allocation이 미사용 집합을 우선하며 injected random source를 통해 여러 key를 선택할 수 있다.
4. 40개 소진, 재가입 key 보존과 concurrent invitation/approval을 MySQL-backed test로 검증한다.
5. own avatar endpoint가 인증, membership status, club scope, allowlist와 cache invalidation을 지킨다.
6. host가 이 endpoint로 다른 membership을 바꿀 수 없다.

### 12.3 프런트엔드와 E2E

1. avatar picker open, current selection, draft selection, disabled/active save와 success close를 unit/component test로 검증한다.
2. 취소, Escape, backdrop, focus trap/return, failure retry와 double-submit 방지를 검증한다.
3. 320px, 390px, 1280px에서 grid, sticky actions, Korean/English wrapping과 overflow를 확인한다.
4. 저장 뒤 desktop/mobile account control, 내 공간, session/record author와 host member list가 같은 key를 보여 준다.
5. same-club 중복 수동 선택을 허용하고 cross-club membership은 독립적인 key를 유지한다.
6. public author와 `LEFT`/unknown image fallback이 기존 visibility를 약화하지 않는다.

최종 구현 evidence는 최소 다음을 포함한다.

```bash
corepack pnpm --dir front exec vitest run shared/ui/book-club-avatar.test.ts features/archive/queries/profile-queries.test.tsx features/archive/ui/my-page/avatar-picker.test.tsx
corepack pnpm --dir front exec playwright test -c playwright-ct.config.ts shared/ui/avatar-chip.ct.tsx features/archive/ui/my-page/avatar-picker.ct.tsx
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front test:e2e
git diff --check
```

## 13. 구현 표면과 순서

예상 ownership은 다음과 같다. 구현 계획 작성 시 현재 파일과 migration 번호를 다시 확인한다.

1. 승인된 40개 image crop, manifest, fallback과 asset tests
2. 새 forward-only MySQL migration, server enum과 allocation tests
3. own avatar update command/use case/store/controller와 API tests
4. archive API/query/route mutation flow와 profile revalidation
5. `내 프로필` 진입점, picker modal/bottom sheet, accessibility와 component tests
6. contract fixture와 consumer regression update
7. migration/integration/E2E, responsive screenshot와 network evidence

주요 예상 파일:

- `front/public/assets/avatars/book-club/*.webp`
- `front/shared/ui/book-club-avatar.ts`
- `front/shared/ui/avatar-chip.tsx`
- `front/features/archive/{api,queries,route,ui}/**`
- `server/src/main/resources/db/mysql/migration/V44__animal_avatar_selection.sql`
- `server/src/main/kotlin/com/readmates/auth/{adapter,application,domain}/**`
- 관련 frontend/server unit, component, integration과 E2E tests

같은 manifest, migration, global CSS, fixture directory 또는 test database를 공유하는 task는 병렬로 수정하지 않는다.

## 14. Acceptance Matrix 연결

- **Actor/authorization:** 자신의 현재 membership만 변경할 수 있다. Server API tests와 permission E2E로 검증한다.
- **Club context:** avatar는 membership 단위이며 cross-club auth completion이 다른 club UI를 덮지 않는다. Scoped route와 multi-club E2E로 검증한다.
- **Persistence/migration:** V43에서 새 migration, check constraint 교체, deterministic existing-member reassignment와 concurrent allocation을 MySQL로 검증한다.
- **UI/runtime state:** draft/save/failure/focus/scroll state와 account/profile revalidation을 unit, component와 E2E로 검증한다.
- **Publication visibility:** public author는 기존 공개 규칙을 통과한 presentation key만 받고 `LEFT`/anonymous는 기본 key로 고정한다.
- **BFF/auth:** new proxy rule이나 trusted header는 없으며 existing same-origin BFF가 additive endpoint를 전달한다.

인접 범위 중 session lifecycle, cursor pagination, notification delivery, AI provider와 email은 변경하지 않는다. Full regression은 실행하지만 이 기능의 새로운 mutation이나 운영 계약으로 확장하지 않는다.

## 15. 잔여 위험과 release 고려

- contact sheet source의 캐릭터마다 oval 여백과 얼굴 크기가 달라 일괄 crop만으로 작은 크기 품질이 고르지 않을 수 있다. 40개를 개별 검수하고 필요한 slot만 crop offset을 조정한다.
- 동물이나 소품이 유사한 asset이 남아 있으므로 접근 가능한 이름과 인접한 전체 표시 이름을 유지한다.
- 40명보다 많은 표시 대상 멤버가 있는 club에서는 자동 배정 중복이 발생한다. 수동 중복도 승인된 동작이며 이름이 authoritative identity다.
- backend가 새 key를 반환하기 전에 frontend가 40개 asset/manifest를 제공하지 않으면 구형 frontend는 기본 avatar로 fallback한다. 실제 production release 계획은 정적 asset 호환성과 backend migration 순서를 별도로 잠가야 한다.
- 이 설계와 구현 검증은 repository/local evidence이며 production deploy, live member data mutation 또는 실제 rollout을 승인하지 않는다.
