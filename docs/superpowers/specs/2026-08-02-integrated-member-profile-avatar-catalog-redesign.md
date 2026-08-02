# ReadMates 통합 멤버 프로필 및 30개 아바타 카탈로그 개편 설계

작성일: 2026-08-02

상태: 사용자 승인 완료, 작성본 검토 대기

## 1. 요약

`/clubs/:clubSlug/app/me`의 프로필 요약은 아바타 변경과 이름 변경을 서로 다른 UI로 제공한다. 아바타 아래의 별도 링크와 이름 옆의 별도 버튼은 시각적 위계를 나누고, 이름은 인라인 form인데 아바타는 큰 선택 modal이라 같은 프로필을 고치는 흐름이 일관되지 않다. 현재 선택 목록은 많은 항목을 평면적으로 나열하며 원본 일러스트의 크림색 타원, `AvatarChip`의 원형 프레임, 선택 tile의 사각 프레임이 겹쳐 보인다.

이 설계는 프로필 요약을 읽기 전용 identity card로 단순화하고 `프로필 편집` 하나로 이름과 아바타를 함께 편집한다. 데스크톱은 오른쪽 편집 panel, 모바일은 전체 화면 editor를 사용한다. 한 번의 원자적 저장으로 현재 club membership의 이름과 아바타를 함께 갱신한다.

기존 동물 아바타 40개는 사용자가 제공한 7개 source sheet에서 선별한 정물·동물·자연물 아바타 30개로 전면 교체한다. 각 asset은 이웃 타원이 보이지 않게 개별 crop하고, crop 검수 뒤 한 번만 무작위로 섞어 고정된 catalog 순서로 커밋한다. 일반 화면에서는 원본 일러스트의 크림색 타원 하나만 보이며, 추가 원형·사각 프레임은 표시하지 않는다.

이 문서는 다음 역사 설계에서 겹치는 범위를 대체한다.

- `2026-08-02-animal-avatar-selection-design.md`의 40개 catalog, 별도 avatar endpoint, picker modal/bottom-sheet 설계
- `2026-08-01-member-profile-name-editor-refinement-design.md`의 인라인 이름 편집 설계

기존 문서는 당시 결정 기록으로 유지하며 수정하지 않는다.

## 2. 확인한 현재 상태와 문제

### 2.1 분리된 편집 흐름

- 프로필 summary 안에서 아바타와 이름이 서로 다른 action과 저장 흐름을 사용한다.
- 아바타는 큰 overlay, 이름은 summary 내부의 inline form이라 사용자가 같은 identity를 두 방식으로 관리해야 한다.
- 모바일과 데스크톱 모두 action label이 identity hierarchy 사이에 끼어 레이아웃이 불안정하다.

### 2.2 과밀한 선택 UI

- 40개 선택지를 desktop 8열, mobile 4열로 한 번에 보여 주어 훑기보다 스크롤과 비교 부담이 커진다.
- 긴 dialog와 sticky footer가 오류 문구, 저장 action, viewport keyboard와 경쟁한다.

### 2.3 중첩된 아바타 경계

현재 선택 tile은 다음 세 경계가 동시에 보인다.

1. 원본 이미지의 크림색 세로 타원
2. `AvatarChip`의 원형 배경과 border
3. picker tile의 둥근 사각 border

선택 상태와 focus 상태가 추가되면 경계가 더 늘어난다. 아바타보다 container가 먼저 보이는 것이 문제다.

### 2.4 crop 오염

기존 asset 일부는 한 slot을 독립적으로 잘라내지 않아 중앙 아바타의 좌우에 이웃 slot의 타원 조각이 보인다. 단순한 동일 폭 분할만으로는 source sheet의 실제 타원 간격 차이를 안전하게 처리하지 못한다.

### 2.5 club scope와 원자성

- 현재 avatar mutation은 명시적 club context를 요구하지만 이름 mutation은 같은 수준으로 scope가 고정되지 않았다.
- 이름과 아바타를 두 endpoint로 저장하면 하나만 성공하는 부분 저장이 생길 수 있다.
- 사용자가 확인한 local 403은 새 avatar API가 추가되기 전에 시작된 backend process가 계속 실행된 stale runtime이었다. 서버 재시작 후 같은 요청이 성공했다.

## 3. 목표

1. `/app/me` 프로필 summary를 읽기 중심 identity card로 단순화한다.
2. 이름과 아바타를 하나의 adaptive editor에서 함께 편집하고 원자적으로 저장한다.
3. 모든 own-profile mutation을 명시적으로 해석된 현재 club membership에 제한한다.
4. 기존 40개 아바타를 승인된 30개로 전면 교체한다.
5. source sheet의 이웃 타원이나 불필요한 outer frame이 없는 256×256 WebP를 만든다.
6. crop 완료 뒤 catalog를 한 번 무작위로 섞고 그 결과를 frontend, server와 migration의 고정 순서로 사용한다.
7. 기존 membership을 새 30개에 재현 가능하게 재배정한다.
8. 참석 명단, 세션 board, 기록, host member 관리와 public record를 포함한 모든 `AvatarChip` consumer에서 한 겹 시각 규칙을 유지한다.
9. desktop, mobile, keyboard, zoom, 오류, 권한 변화, multi-club와 동시 저장 사각지대를 검증한다.
10. stale local runtime이 시각 검수까지 숨어 들어가지 않게 실제 mutation contract smoke를 선행한다.

## 4. 비목표

- 사용자 이미지 upload, 임의 crop UI, 외부 URL 또는 Google profile image 사용
- runtime image generation, moderation 또는 avatar 변경 이력 UI
- host가 다른 member의 avatar를 대신 선택하는 기능
- avatar별 권한, RSVP, attendance 또는 membership 상태 표현
- avatar 검색, 분류, 즐겨찾기, 추천 또는 pagination
- production deploy, live member data mutation, tag 또는 release 생성
- local backend hot reload 도입이나 전체 개발 실행 도구 개편
- 기존 역사 spec 수정

## 5. 선택한 접근과 제외한 대안

### 5.1 선택: 읽기 전용 summary와 adaptive 통합 editor

프로필 summary에는 avatar, `내 프로필`, 표시 이름, club·role·합류 시점과 `프로필 편집` button 하나만 둔다. button은 desktop에서 오른쪽 panel, mobile에서 전체 화면 editor를 연다. editor는 current avatar, 표시 이름 field와 하나의 `변경사항 저장` action을 제공한다.

avatar를 누르면 같은 editor shell 안에서 avatar selection step으로 전환한다. 선택은 draft만 바꾸며 editor의 최종 저장 전에는 server나 다른 identity surface에 반영하지 않는다.

이 접근은 summary의 읽기 hierarchy를 안정시키고 두 mutation을 한 transaction으로 묶으며 mobile과 desktop에 적합한 공간을 제공한다.

### 5.2 제외: 현재 위치의 두 개별 편집기 유지

변경량은 작지만 서로 다른 action hierarchy, 부분 저장, 큰 picker와 inline name form의 불일치가 남는다.

### 5.3 제외: 모든 편집을 `/app/me/settings`로 이동

summary는 가장 단순해지지만 사용자가 identity를 확인한 문맥에서 바로 편집하지 못한다. `/app/me/settings`는 계정과 membership 관리, `/app/me`는 개인 identity와 독서 summary라는 현재 정보 구조를 유지한다.

## 6. 승인된 30개 asset

### 6.1 번호 규칙

각 source sheet는 위 행 왼쪽부터 1–5, 아래 행 왼쪽부터 6–10으로 번호를 매긴다. 7개 sheet 70개 중 40개를 제외하고 30개를 유지한다.

| Sheet | 제외 slot | 유지 slot | 유지 수 |
| --- | --- | --- | ---: |
| 1 | 1, 2, 3, 4, 5, 7, 8, 10 | 6, 9 | 2 |
| 2 | 3, 4, 6, 7, 9, 10 | 1, 2, 5, 8 | 4 |
| 3 | 3, 5, 6, 7, 9, 10 | 1, 2, 4, 8 | 4 |
| 4 | 2, 3, 6, 7, 8, 9 | 1, 4, 5, 10 | 4 |
| 5 | 2, 3, 6, 7, 8, 9 | 1, 4, 5, 10 | 4 |
| 6 | 3, 4, 6, 9, 10 | 1, 2, 5, 7, 8 | 5 |
| 7 | 5, 9, 10 | 1, 2, 3, 4, 6, 7, 8 | 7 |
| 합계 | 40개 제외 | 30개 유지 | 30 |

### 6.2 stable key와 접근 가능한 label

Key는 source 위치가 아니라 실제 motif를 설명한다. 따라서 한 번의 catalog shuffle이 DB wire value나 asset identity를 바꾸지 않는다.

| Sheet-slot | Wire key | 선택 label |
| --- | --- | --- |
| 1-6 | `starfish-notebook` | 노트를 든 불가사리 |
| 1-9 | `teacup-notebook` | 노트와 연필을 든 찻잔 |
| 2-1 | `banana-green-book` | 초록 책을 읽는 바나나 |
| 2-2 | `cherries-notebook` | 노트와 연필을 든 체리 |
| 2-5 | `pudding-notebook` | 노트와 연필을 든 푸딩 |
| 2-8 | `snowglobe-green-book` | 초록 책을 읽는 스노우볼 |
| 3-1 | `peach-green-book` | 초록 책을 읽는 복숭아 |
| 3-2 | `radish-notebook` | 노트와 연필을 든 무 |
| 3-4 | `balloon-green-book` | 초록 책을 읽는 열기구 |
| 3-8 | `palette-green-book` | 초록 책과 붓을 든 팔레트 |
| 4-1 | `lemon-green-book` | 초록 책을 읽는 레몬 |
| 4-4 | `sailboat-green-book` | 초록 책을 읽는 돛단배 |
| 4-5 | `sheep-notebook` | 노트와 연필을 든 양 |
| 4-10 | `globe-notebook` | 노트와 연필을 든 지구본 |
| 5-1 | `apple-green-book` | 초록 책을 읽는 사과 |
| 5-4 | `cheese-green-book` | 초록 책을 읽는 치즈 |
| 5-5 | `milk-green-book` | 초록 책을 읽는 우유 팩 |
| 5-10 | `bell-notebook` | 노트와 연필을 든 종 |
| 6-1 | `sun-green-book` | 초록 책을 읽는 해 |
| 6-2 | `tulip-notebook` | 노트와 연필을 든 튤립 |
| 6-5 | `teapot-green-book` | 초록 책을 읽는 찻주전자 |
| 6-7 | `envelope-notebook` | 노트와 연필을 든 편지봉투 |
| 6-8 | `candle-green-book` | 초록 책을 읽는 촛불 |
| 7-1 | `cloud-green-book` | 초록 책을 읽는 구름 |
| 7-2 | `star-notebook` | 노트를 든 별 |
| 7-3 | `moon-green-book` | 초록 책을 읽는 초승달 |
| 7-4 | `mushroom-green-book` | 초록 책을 읽는 버섯 |
| 7-6 | `dumpling-notebook` | 노트와 연필을 든 만두 |
| 7-7 | `teacup-green-book` | 초록 책을 읽는 찻잔 |
| 7-8 | `toast-brown-book` | 갈색 책을 읽는 식빵 |

기본 fallback은 `cloud-green-book`으로 고정한다. 탈퇴·익명화 projection과 unknown key fallback도 같은 key를 사용한다.

### 6.3 crop 계약

- Source sheet와 중간 crop은 repository에 추가하지 않는다.
- 동일 폭 일괄 분할 결과를 최종 asset으로 사용하지 않는다.
- 각 유지 slot에서 선택된 크림색 타원과 subject만 독립적으로 분리한다.
- 좌우 이웃 타원의 fragment, 다른 캐릭터, 잘린 타원 border와 큰 바깥 여백을 제거한다.
- 최종 crop은 256×256 WebP다.
- 선택된 타원 외부는 투명 처리하고, 타원 주변에는 최소 8%의 안전 여백을 둔다.
- 얼굴과 책·노트 같은 기억 단서가 20px에서도 구분되도록 subject scale과 중심을 slot별로 조정한다.
- 각 asset은 왼쪽·오른쪽 edge에 이웃 타원에서 온 불연속 component가 없는지 검사한다.
- 20, 22, 24, 26, 28, 32, 46, 52, 72px contact sheet에서 전부 육안 검수한다.

### 6.4 한 번의 shuffle

30개 crop과 품질 검수가 끝난 뒤 final catalog를 한 번만 무작위로 섞는다. 그 결과를 frontend manifest의 literal order로 커밋하고 server enum order와 migration assignment list가 동일한 순서를 사용하게 한다.

Runtime에서는 다시 섞지 않는다. 새로고침, login, device 또는 build에 따라 picker 순서가 바뀌지 않는다. Wire key와 file name도 shuffle 전후 동일하다. 구현 검증은 final manifest가 위 source 순서와 동일하지 않으며 정확히 같은 30-key set임을 확인한다.

## 7. 시각 시스템과 전역 consumer 규칙

### 7.1 한 겹 원칙

일반 상태에서는 원본 artwork의 크림색 타원 하나만 보인다.

- `AvatarChip`의 원형 background와 border를 제거한다.
- picker button은 최소 target을 제공하지만 상시 사각 card border를 표시하지 않는다.
- hover는 subtle surface change만 허용하며 새 shape를 추가하지 않는다.
- selected와 keyboard focus는 하나의 accent ring을 공유한다.
- selected state는 ring 외에 check badge와 `aria-pressed`로도 표현한다.
- selected와 focus가 동시에 발생해도 ring을 중첩하지 않는다.
- image와 default image가 모두 실패한 경우에만 border 없는 neutral fallback 한 겹을 표시한다.

### 7.2 사용처별 크기

| 범주 | 대표 사용처 | 크기 | 규칙 |
| --- | --- | ---: | --- |
| Compact author | public highlight, one-line review, member record | 20–22px | frame 없이 subject 식별 우선 |
| Roster and board | member roster, mobile prep, question, host attendance | 24px | RSVP·attendance를 avatar frame으로 표현하지 않음 |
| Reading metadata | member activity와 record row | 26px | 인접 text가 identity를 소유 |
| Account identity | top navigation, account menu | 28px | 별도 account ring 없음 |
| Member identity | host member list, public host | 32px | membership badge와 시각적으로 분리 |
| Profile summary | `/app/me` identity card | 72px | artwork 타원만 표시 |
| Editor and picker | current preview, selection grid | 46–52px 이상 | 선택·focus 때만 단일 ring과 check |

### 7.3 상태 의미 분리

RSVP, attendance, membership status, role과 current-session participation은 기존 text 또는 badge가 표현한다. Avatar hue, border 또는 opacity를 authoritative 상태 표현으로 사용하지 않는다. 특히 `NO_RESPONSE`가 avatar에 별도 border를 추가하지 않게 한다.

## 8. 프로필 UI 상세 설계

### 8.1 읽기 상태

Desktop과 mobile 모두 같은 content hierarchy를 사용한다.

```text
[avatar]  내 프로필                         [프로필 편집]
          표시 이름
          club · role · 합류 시점
```

- 표시 이름은 page의 profile heading이다.
- avatar 아래 `아바타 바꾸기`와 이름 옆 `이름 변경`을 제거한다.
- `프로필 편집`은 하나의 44px 이상 button이며 long Korean/English name과 충돌하면 자연스럽게 다음 행으로 이동한다.
- 편집 불가 membership은 button을 숨기고 빈 placeholder를 만들지 않는다.

### 8.2 Desktop editor

- 현재 page 위에 오른쪽 panel로 열린 modal dialog다.
- 폭은 `min(480px, 100vw)`이고 viewport height 안에서 scroll한다.
- header에는 `프로필 편집`, 설명과 close button을 둔다.
- body에는 current avatar preview, `아바타 선택`, `표시 이름` field와 validation helper를 둔다.
- footer에는 `취소`와 `변경사항 저장`을 둔다.
- panel 밖 page scroll은 잠그고 dialog 안 focus trap과 opener focus 복귀를 제공한다.

### 8.3 Mobile editor

- 같은 dialog가 viewport 전체를 사용한다.
- safe-area top과 bottom, software keyboard, dynamic viewport height를 고려한다.
- top bar의 back/close action과 bottom save action이 content와 겹치지 않는다.
- 320px width와 200% zoom에서도 horizontal scroll이 없어야 한다.

### 8.4 Avatar selection step

- `아바타 선택`을 누르면 같은 editor shell 안에서 selection step으로 전환한다.
- desktop은 5열, mobile은 3열이다.
- tile border는 기본적으로 보이지 않으며 minimum target은 44×44px다.
- 현재 draft에는 단일 ring, check와 `aria-pressed=true`를 표시한다.
- 선택하면 editor draft만 바꾸고 `프로필 편집` step으로 돌아갈 수 있다.
- selection step에서 source order, sheet number 또는 internal wire key를 노출하지 않는다.

### 8.5 Draft, dismissal과 focus

- editor open 시 server-backed current profile을 baseline으로 복사한다.
- name 또는 avatar가 baseline과 다르면 dirty다.
- dirty editor에서 Escape, backdrop, mobile back 또는 close를 누르면 `변경사항을 버릴까요?` 확인 step을 표시한다.
- `계속 편집`은 draft와 focus context를 유지한다.
- `변경사항 버리기`만 editor를 닫고 opener focus를 복구한다.
- pristine editor는 추가 확인 없이 닫는다.
- 저장 중에는 field, selection, dismissal과 중복 submit을 잠근다.
- 저장 실패 후 draft, active step과 scroll context를 유지하고 retry action으로 focus를 이동한다.

## 9. API와 server 설계

### 9.1 신규 원자적 replace endpoint

새 UI는 full profile state를 idempotent하게 저장한다.

```http
PUT /api/me/profile?clubSlug=<current-club>
Content-Type: application/json

{
  "displayName": "호스트1",
  "avatarKey": "cloud-green-book"
}
```

Browser는 same-origin `/api/bff/**`를 경유한다. BFF가 query의 normalized club slug를 trusted `X-Readmates-Club-Slug` header로 전달하고 server는 그 context를 명시적으로 해석한다. Controller는 browser가 보낸 internal header를 신뢰하지 않는다.

`PUT` request의 두 field는 모두 required다. null, blank 또는 누락은 structured bad request다. 이름과 avatar validation을 모두 통과한 뒤 같은 transaction에서 current membership row를 갱신한다.

### 9.2 Compatibility endpoints

현재 `PATCH /api/me/profile`과 `PATCH /api/me/avatar`는 cached client와 기존 test contract를 위해 이번 변경에서 제거하지 않는다. 새 UI는 둘을 호출하지 않는다.

- 기존 endpoint의 권한과 validation을 약화하지 않는다.
- `/api/me/avatar`는 새 30-key allowlist만 저장할 수 있다.
- 구형 picker가 제거된 40-key 중 하나를 보내면 `AVATAR_KEY_INVALID`를 반환한다.
- compatibility endpoint 제거와 장기 deprecation policy는 별도 release decision이다.

### 9.3 책임 경계

- Inbound adapter: request parsing, club context resolution, use case call, response와 application error mapping
- Application service: authenticated member resolution, membership edit permission, name·avatar validation, duplicate-name lock, atomic orchestration, cache invalidation
- Outbound port: club-scoped profile row lock와 display name·avatar update
- JDBC adapter: SQL, conditional row update와 result mapping

Host가 다른 member 이름을 수정하는 기존 DTO와 endpoint에는 avatar field를 추가하지 않는다. Own-profile `PUT`은 별도 request와 command를 사용하여 host workflow를 결합하지 않는다.

### 9.4 Validation과 error

기존 display-name rule과 다음 avatar rule을 유지한다.

- `DISPLAY_NAME_REQUIRED`, `DISPLAY_NAME_TOO_LONG`, `DISPLAY_NAME_INVALID`, `DISPLAY_NAME_RESERVED`, `DISPLAY_NAME_DUPLICATE`
- `AVATAR_KEY_REQUIRED`, `AVATAR_KEY_INVALID`
- `AUTHENTICATION_REQUIRED`, `MEMBERSHIP_NOT_ALLOWED`, `MEMBER_NOT_FOUND`
- 잘못되거나 해석되지 않는 club context는 fail closed한다.

이름 duplicate나 avatar validation이 실패하면 어느 field도 저장하지 않는다. Conditional update 중 membership status가 바뀌면 transaction을 rollback하고 permission 또는 not-found error로 다시 분류한다.

### 9.5 Cache와 authoritative response

Commit 뒤 해당 club content cache를 한 번 무효화한다. Response는 `membershipId`, `displayName`, `accountName`, `profileImageUrl`, `avatarKey`를 포함하는 authoritative profile shape다.

Frontend는 성공 response를 local override로 반영하고 auth identity와 `/app/me` loader/query를 재검증한다. 최종 revalidation이 같은 generation의 stale response보다 우선하도록 현재 override fencing을 두 field 단위가 아닌 profile revision 단위로 단순화한다.

## 10. Persistence와 migration

### 10.1 Forward-only catalog replacement

현재 마지막 migration인 V44를 수정하지 않는다. 구현 시 최신 번호를 다시 확인하고 그 다음 forward-only MySQL migration을 추가한다.

Migration 순서는 다음과 같다.

1. 기존 `memberships_avatar_key_check`를 제거한다.
2. 모든 membership을 final shuffled 30-key list에 결정적으로 재배정한다.
3. 모든 row가 새 allowlist 안에 있고 null이 아님을 검증한다.
4. 새 30-key check constraint를 추가한다.

### 10.2 기존 member 결정적 재배정

각 club에서 표시 대상 status인 `INVITED`, `VIEWER`, `ACTIVE`, `SUSPENDED`를 먼저 두고, membership identifier와 versioned salt를 hash한 stable order를 만든다. Row number를 final shuffled 30-key list에 modulo mapping한다.

같은 pre-migration data는 항상 같은 결과를 만든다. 한 club의 첫 30개 표시 대상은 중복 없이 배정되고 31번째부터 catalog 순환으로 중복될 수 있다. `LEFT`와 `INACTIVE`도 schema invariant를 위해 새 key를 저장하지만 신규 allocation의 used-key 집계에서는 제외한다.

사용자가 기존 40개 중 직접 선택했던 값도 새 catalog에 일대일 대응이 없으므로 같은 결정적 규칙으로 교체한다. 이는 40개 전면 교체 결정의 일부다.

### 10.3 신규 및 재가입 allocation

- Club row `FOR UPDATE` lock을 유지한다.
- 표시 대상 membership이 아직 사용하지 않은 새 key를 우선 후보로 둔다.
- 후보 중 test-controlled random index로 하나를 선택한다.
- 30개가 모두 사용 중이면 전체 catalog에서 선택한다.
- 재가입 시 stored key가 새 30-key allowlist에 있으면 보존한다.
- 수동 선택은 같은 club 안의 중복을 허용한다.

## 11. Frontend 구조

### 11.1 Feature boundary

- `features/archive/api`: own-profile `PUT` request/response contract와 BFF call
- `features/archive/queries`: atomic mutation과 archive/profile invalidation
- `features/archive/route`: club context, baseline/draft controller, auth refresh, revalidation fencing과 UI callback 조립
- `features/archive/ui/my-page`: prop/callback 기반 summary, editor shell, selection grid, discard confirmation과 accessible focus behavior
- `shared/ui/AvatarChip`: allowlisted local asset rendering과 image failure fallback만 담당

UI module은 API, query, route 또는 shared API client를 import하지 않는다.

### 11.2 Manifest contract

Frontend manifest는 final shuffled order의 30개 `{key, label}` literal을 소유한다. 다음 invariant를 test로 고정한다.

- key 30개가 unique다.
- 모든 key에 같은 이름의 256×256 WebP가 하나 있다.
- product directory에 legacy 40개 WebP가 남지 않는다.
- server enum과 migration list의 key set이 같다.
- fallback `cloud-green-book`이 manifest와 asset에 존재한다.
- path traversal, uppercase 또는 unknown key는 local fallback 외 path를 만들 수 없다.

### 11.3 Error behavior

| 상황 | UI 동작 |
| --- | --- |
| 성공 | editor 닫기, summary·account identity 갱신, opener focus 복귀 |
| 이름 validation | name field와 연결된 구체적 inline alert, draft 유지 |
| avatar validation | selection control과 연결된 alert, draft 유지 |
| membership permission 변화 | 저장하지 않고 권한 오류 표시, retry 대신 reload 안내 |
| session 만료 | 기존 login recovery flow 사용 |
| network 또는 5xx | editor와 draft 유지, retry 제공 |
| contract mismatch 또는 endpoint 없음 | generic permission으로 오인하지 않고 local smoke에서 먼저 실패 |
| requested image decode 실패 | `cloud-green-book`으로 한 번 fallback |
| fallback도 실패 | border 없는 neutral placeholder, 인접 name과 action 유지 |

## 12. Stale runtime 보완

Local backend source 변경은 이미 실행 중인 `bootRun` process에 자동 반영된다고 가정하지 않는다. 이 범위에서 hot reload dependency는 추가하지 않는다.

대신 browser visual QA 전에 실제 stack을 대상으로 다음 contract smoke를 실행한다.

1. 현재 backend process가 새 own-profile `PUT` endpoint를 제공하는지 확인한다.
2. Test membership으로 name과 avatar를 함께 변경한다.
3. HTTP 200 response의 두 field를 확인한다.
4. scoped `GET /api/app/me`와 auth identity가 같은 값을 반환하는지 확인한다.
5. Test database row가 같은 club membership에서만 바뀌었는지 확인한다.
6. Fixture를 원상 복구한다.

Endpoint 없음, 404·405, unexpected 403 또는 response shape mismatch는 UI bug와 분리해 stale runtime 또는 contract mismatch로 보고하고 browser QA를 중단한다. Security filter나 club context requirement를 완화해 smoke를 통과시키지 않는다.

## 13. 접근성 및 responsive 계약

- Summary heading과 editor dialog name이 명확해야 한다.
- Editor open 시 heading 또는 current avatar control로 focus를 옮긴다.
- Focus trap, Escape, backdrop, mobile back과 opener focus 복귀를 일관되게 처리한다.
- Dirty dismissal confirmation은 keyboard와 touch 모두 접근 가능하다.
- 모든 button과 avatar selection target은 최소 44×44px다.
- Selected state는 color 외 check와 `aria-pressed`를 사용한다.
- 일반 avatar image는 인접한 member name이 identity를 소유하므로 decorative다.
- 320px width, 390px mobile, 1280px desktop과 200% zoom에서 horizontal overflow가 없다.
- Mobile software keyboard와 safe-area inset이 field, error 또는 save action을 가리지 않는다.
- Reduced motion 환경에서 panel과 step transition을 즉시 전환한다.
- 긴 Korean/English display name이 avatar, action 또는 badge와 겹치지 않는다.

## 14. 검증 설계

### 14.1 Asset와 catalog

1. 유지·제외 table 합계가 30·40인지 검증한다.
2. Final frontend, server와 migration key set이 정확히 30개로 일치하는지 검증한다.
3. Final manifest order가 source sheet order와 다르고 runtime마다 동일한지 검증한다.
4. 모든 asset이 256×256 WebP이고 file name이 allowlisted key인지 확인한다.
5. Edge contamination scan과 개별 inspection으로 이웃 타원 fragment가 없음을 확인한다.
6. 20, 22, 24, 26, 28, 32, 46, 52, 72px contact sheet를 확인한다.
7. 기본, selected, focus, selected+focus, decode-failure 상태에서 이중 원·사각 frame이 없는지 확인한다.

### 14.2 Server unit와 API

1. 두 field validation과 atomic success를 검증한다.
2. Duplicate name 또는 invalid avatar에서 둘 다 rollback되는지 검증한다.
3. Active, viewer, suspended와 blocked membership status를 검증한다.
4. Missing·invalid club context, 다른 club context와 authentication 없음의 denied path를 검증한다.
5. 같은 user가 여러 club에 있을 때 요청 club membership 하나만 바뀌는지 검증한다.
6. Double request와 conditional update 중 status change를 검증한다.
7. Compatibility `PATCH` endpoint가 남고 legacy key를 새 DB에 재도입하지 못하는지 검증한다.

### 14.3 Migration과 allocation

1. V44 state에서 새 migration이 성공한다.
2. 기존 40-key row가 모두 새 30-key row로 바뀐다.
3. Active 계열, `LEFT`, `INACTIVE` row가 모두 새 constraint를 만족한다.
4. 동일 fixture가 동일 reassignment 결과를 만든다.
5. 한 club 첫 30개 표시 대상이 unique하고 31번째부터 안전하게 중복되는지 검증한다.
6. Concurrent 신규 allocation이 club lock과 valid key invariant를 유지하는지 검증한다.

### 14.4 Frontend state와 component

1. Summary에 profile edit action 하나만 있는지 검증한다.
2. Desktop panel과 mobile full-screen geometry, scroll lock과 focus trap을 검증한다.
3. Avatar selection이 30개이며 desktop 5열, mobile 3열인지 검증한다.
4. Name/avatar draft가 final save 전 전역 identity에 반영되지 않는지 검증한다.
5. Save pending 중 double submit과 dismissal을 막는지 검증한다.
6. Failure 뒤 두 draft와 active step을 유지하고 retry 가능한지 검증한다.
7. Dirty dismissal confirmation과 pristine dismissal을 검증한다.
8. Success 뒤 summary, top navigation, account menu와 loader/query가 갱신되는지 검증한다.
9. Slow old-club response가 current-club profile을 덮지 않는지 검증한다.

### 14.5 Consumer regression

다음 모든 `AvatarChip` consumer를 component 또는 browser evidence로 확인한다.

- Member current-session roster desktop/mobile
- Current-session question와 review board
- Member home reading records
- Archive session detail과 notes feed
- Host attendance editor와 host member list
- Top navigation과 account menu
- Public club host와 public session highlight·one-line review
- Profile summary와 avatar selection editor

RSVP·attendance·membership badge가 avatar frame에 의존하지 않고 text 또는 badge로 유지되는지도 확인한다.

### 14.6 Canonical commands

Focused test를 먼저 실행한 뒤 다음 repository gate를 사용한다.

```bash
corepack pnpm --dir front exec vitest run \
  shared/ui/book-club-avatar.test.ts \
  features/archive/queries/profile-queries.test.tsx \
  features/archive/route/profile-update-controller.test.tsx \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/member-space-sections.test.tsx

corepack pnpm --dir front exec playwright test \
  -c playwright-ct.config.ts \
  shared/ui/avatar-chip.ct.tsx \
  features/archive/ui/my-page/avatar-picker.ct.tsx

./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
git diff --check
```

실제 local browser evidence는 stale-runtime contract smoke를 통과한 backend에서만 수집한다.

## 15. Acceptance matrix 연결

- **Actor or authorization:** own current membership만 수정하며 unauthenticated, blocked membership과 다른 club denied path를 server API와 E2E로 검증한다.
- **Club context:** trusted BFF-derived slug, missing·invalid slug와 cross-club race를 검증한다.
- **Persistence or migration:** V44 upgrade, new constraint, deterministic reassignment, 31st-member reuse와 concurrent allocation을 MySQL integration test로 검증한다.
- **BFF or OAuth:** same-origin proxy, cookie, trusted header stripping과 actual mutation smoke를 검증한다.
- **UI or runtime state:** pristine, dirty, pending, validation, network error, stale response, desktop, mobile, zoom와 software keyboard를 검증한다.
- **Publication visibility:** public author projection과 `LEFT`·anonymous fallback이 새 key를 사용하면서 기존 visibility rule을 유지하는지 검증한다.

Notification delivery, session lifecycle mutation, AI provider, email과 archive pagination은 contract consumer regression 외에는 변경하지 않는다.

## 16. 구현 순서와 ownership

1. Approved slot crop, one-time shuffle, 30-key manifest와 asset QA
2. Server enum, fallback와 forward-only migration
3. Atomic own-profile command, service, store와 `PUT` endpoint
4. Frontend API/query/route controller를 atomic profile revision으로 전환
5. Read-only summary, adaptive editor, selection step와 dirty dismissal
6. `AvatarChip` one-layer visual contract와 all-consumer regression
7. Focused tests, migration/integration, local contract smoke, browser/responsive evidence와 full gates

같은 manifest, migration, global design token, fixture database 또는 screenshot directory를 수정하는 task는 병렬로 실행하지 않는다.

## 17. 잔여 위험과 release boundary

- Source artwork마다 타원과 subject 크기가 달라 자동 crop만으로 균일한 품질을 보장할 수 없다. 30개 모두 개별 offset과 small-size contact sheet를 검수한다.
- 30명을 넘는 표시 대상 member가 있는 club은 automatic avatar가 중복된다. 표시 이름이 authoritative identity이며 수동 중복도 허용된 동작이다.
- 기존 40개를 전면 교체하므로 모든 기존 member avatar가 한 번 바뀐다. Migration은 안정적이지만 과거 선택을 보존하지 않는다.
- 구형 cached frontend는 제거된 key를 선택할 수 있으며 compatibility endpoint에서 structured invalid-key error를 받을 수 있다. Zero-downtime production 전환은 backend, migration과 static frontend 배포 순서를 별도 release plan에서 잠가야 한다.
- 이 설계와 이후 repository implementation은 production deploy 또는 live member data 변경을 승인하지 않는다.
