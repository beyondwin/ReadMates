# ReadMates 아바타 서정 이름 체계 설계

작성일: 2026-08-02

상태: 사용자 방향 승인 완료, 작성본 검토 대기

## 1. 요약

현재 30개 아바타의 선택 이름은 `초록 책을 읽는 OOO` 또는 `노트와 연필을 든 OOO`처럼 그림의 장면을 그대로 반복한다. 이 문구는 프로필 편집기의 현재 아바타 이름으로 노출되고 아바타 선택 버튼의 접근 가능한 이름으로도 사용된다. 그림 식별에는 정확하지만 각 선택지의 개성과 ReadMates의 조용하고 문학적인 정체성이 충분히 드러나지 않는다.

이 설계는 각 아바타에 짧은 서정 이름과 객관적인 그림 설명을 따로 둔다. 프로필 편집기에는 `문장 사이의 구름` 같은 서정 이름을 표시하고, 스크린 리더용 선택 버튼에는 `문장 사이의 구름, 초록 책을 읽는 구름 선택`처럼 이름과 그림 설명을 함께 제공한다.

아바타 asset, wire key, DB 값, API 계약, catalog 순서와 fallback key는 바꾸지 않는다.

## 2. 목표

1. 30개 아바타가 서로 구별되는 짧은 서정 이름을 갖는다.
2. 이름은 ReadMates의 독서, 여백, 질문, 대화, 기록과 회고 어휘를 사용한다.
3. 이름만으로 그림 정보를 추측하게 하지 않고 접근성용 객관적 설명을 보존한다.
4. 기존 프로필 편집 흐름, 저장 동작과 membership-scoped avatar 계약을 변경하지 않는다.
5. 내부 key 변경이나 migration 없이 frontend metadata만으로 적용한다.

## 3. 비목표

- 아바타 이미지 재생성, crop 또는 asset 교체
- wire key, 파일명, server enum, DB constraint 또는 migration 변경
- picker 순서, 선택 UI, 프로필 편집 layout 또는 저장 API 변경
- 사용자별 자유 작명, 이름 번역, 검색, 분류 또는 추천 기능
- 아바타 이름을 사용자 표시 이름이나 알림 발송 이름으로 사용

## 4. 선택한 이름 원칙

### 4.1 형식

서정 이름은 가능한 한 `독서와 기록에 관한 행동 또는 상태 + 그림의 주인공` 구조를 사용한다.

- 좋은 예: `문장을 줍는 버섯`, `대화를 끓이는 찻주전자`
- 피할 예: `귀여운 버섯`, `초록 책 버섯`, `버섯 1호`

이름은 설명문이 아니라 호칭처럼 읽혀야 한다. 대부분 10~16자 안에서 끝내고, 같은 동사를 불필요하게 반복하지 않는다. 그림에 없는 성격, 권한, 참석 상태나 독서 성과를 단정하지 않는다.

### 4.2 어휘 범위

ReadMates의 핵심 활동과 연결되는 다음 어휘를 우선한다.

- 읽기: 문장, 여백, 책갈피, 다음 장, 페이지
- 참여: 질문, 듣기, 나누기, 대화, 모임
- 기록: 적기, 모으기, 간직하기, 전하기, 밝히기

너무 장난스럽거나 게임 직업처럼 들리는 `마법사`, `전사`, `레벨`, `마스터`와 generic SaaS식 `전문가`, `리더`, `챔피언`은 사용하지 않는다.

### 4.3 접근성

서정 이름은 그림을 정확히 묘사하지 않으므로 객관적 `description`을 별도 보존한다.

- 화면 표시 이름: `문장 사이의 구름`
- 선택 버튼의 접근 가능한 이름: `문장 사이의 구름, 초록 책을 읽는 구름 선택`
- 선택 상태: 기존 `aria-pressed`와 check 표시 유지

일반 `AvatarChip`은 주변의 멤버 표시 이름이 identity를 소유하므로 계속 장식 이미지로 처리한다. 이번 변경에서 이미지 `alt`나 다른 consumer의 접근성 책임은 바꾸지 않는다.

## 5. 승인 이름 목록

Catalog 순서와 key는 현재 frontend manifest를 그대로 유지한다.

| Wire key | 서정 이름 | 객관적 그림 설명 |
| --- | --- | --- |
| `globe-notebook` | 세계를 펼치는 지구본 | 노트와 연필을 든 지구본 |
| `mushroom-green-book` | 문장을 줍는 버섯 | 초록 책을 읽는 버섯 |
| `lemon-green-book` | 여백에 머문 레몬 | 초록 책을 읽는 레몬 |
| `pudding-notebook` | 생각을 받아 적는 푸딩 | 노트와 연필을 든 푸딩 |
| `peach-green-book` | 이야기를 품은 복숭아 | 초록 책을 읽는 복숭아 |
| `radish-notebook` | 질문을 적는 무 | 노트와 연필을 든 무 |
| `apple-green-book` | 책갈피를 건네는 사과 | 초록 책을 읽는 사과 |
| `sailboat-green-book` | 다음 장으로 가는 돛단배 | 초록 책을 읽는 돛단배 |
| `palette-green-book` | 생각을 칠하는 팔레트 | 초록 책과 붓을 든 팔레트 |
| `balloon-green-book` | 이야기를 띄우는 열기구 | 초록 책을 읽는 열기구 |
| `dumpling-notebook` | 기록을 빚는 만두 | 노트와 연필을 든 만두 |
| `tulip-notebook` | 여백에 피어난 튤립 | 노트와 연필을 든 튤립 |
| `cheese-green-book` | 문장을 숙성하는 치즈 | 초록 책을 읽는 치즈 |
| `starfish-notebook` | 밑줄을 모으는 불가사리 | 노트를 든 불가사리 |
| `banana-green-book` | 한 장 더 읽는 바나나 | 초록 책을 읽는 바나나 |
| `milk-green-book` | 아침을 읽는 우유 팩 | 초록 책을 읽는 우유 팩 |
| `cloud-green-book` | 문장 사이의 구름 | 초록 책을 읽는 구름 |
| `teacup-green-book` | 책 곁에 머문 찻잔 | 초록 책을 읽는 찻잔 |
| `toast-brown-book` | 오래 읽는 식빵 | 갈색 책을 읽는 식빵 |
| `snowglobe-green-book` | 기억을 간직한 스노우볼 | 초록 책을 읽는 스노우볼 |
| `cherries-notebook` | 문장을 나누는 체리 | 노트와 연필을 든 체리 |
| `envelope-notebook` | 다음 책을 전하는 편지봉투 | 노트와 연필을 든 편지봉투 |
| `bell-notebook` | 모임을 여는 종 | 노트와 연필을 든 종 |
| `teacup-notebook` | 대화를 기록하는 찻잔 | 노트와 연필을 든 찻잔 |
| `candle-green-book` | 늦은 독서를 밝히는 촛불 | 초록 책을 읽는 촛불 |
| `sun-green-book` | 다음 장을 밝히는 해 | 초록 책을 읽는 해 |
| `teapot-green-book` | 대화를 끓이는 찻주전자 | 초록 책을 읽는 찻주전자 |
| `sheep-notebook` | 조용히 듣는 양 | 노트와 연필을 든 양 |
| `moon-green-book` | 밤의 페이지를 지키는 초승달 | 초록 책을 읽는 초승달 |
| `star-notebook` | 질문을 남기는 별 | 노트를 든 별 |

두 찻잔은 동일한 motif지만 역할이 다르다. 책을 읽는 찻잔은 `책 곁에 머문 찻잔`, 노트를 든 찻잔은 `대화를 기록하는 찻잔`으로 구별한다.

## 6. Frontend 설계

`front/shared/ui/book-club-avatar.ts`의 metadata를 다음 책임으로 확장한다.

```ts
export type BookClubAvatarDefinition = {
  key: string;
  label: string;
  description: string;
};
```

- `label`: 화면에 표시하는 서정 이름
- `description`: 실제 artwork를 설명하는 접근성 문구
- `bookClubAvatarLabel(value)`: 기존처럼 fallback을 정규화한 뒤 서정 이름 반환
- 신규 `bookClubAvatarDescription(value)`: fallback을 정규화한 뒤 객관적 설명 반환

`ProfileEditorDialog`는 기존 `bookClubAvatarLabel`을 그대로 사용하므로 별도 UI 변경 없이 선택된 아바타의 서정 이름을 표시한다.

`AvatarPicker`는 각 definition의 `label`과 `description`을 받아 `aria-label={`${label}, ${description} 선택`}`을 구성한다. `AvatarChip`, server response, query와 route data에는 metadata를 전파하지 않는다.

## 7. 오류와 fallback

Unknown 또는 잘못된 key는 현재와 같이 `cloud-green-book`으로 정규화한다.

- fallback 화면 이름: `문장 사이의 구름`
- fallback 그림 설명: `초록 책을 읽는 구름`
- fallback asset: `/assets/avatars/book-club/cloud-green-book.webp`

이미지 로드 실패 처리와 최종 무이미지 fallback은 기존 `AvatarChip` 동작을 유지한다. 이름 metadata 누락을 runtime에서 임의 문구로 보정하지 않고 manifest test로 막는다.

## 8. 테스트와 수용 기준

### 8.1 Manifest test

- 30개 definition 모두 공백이 아닌 한글 `label`과 `description`을 가진다.
- label은 30개 모두 고유하다.
- `bookClubAvatarLabel`과 `bookClubAvatarDescription`은 같은 key와 fallback에 맞는 값을 반환한다.
- asset set, key set, catalog 순서와 fallback key는 변경되지 않는다.

### 8.2 Picker test

- 선택 버튼은 서정 이름과 그림 설명을 모두 포함한 accessible name을 가진다.
- 선택, disabled, `aria-pressed`, error 연결과 `onChange` 동작은 유지된다.

### 8.3 Profile editor test

- 현재 선택 요약에는 서정 이름이 보인다.
- 저장 payload에는 기존 wire key만 포함되며 이름이나 description은 포함되지 않는다.

### 8.4 검증 명령

집중 검증부터 실행한다.

```bash
corepack pnpm --dir front exec vitest run \
  shared/ui/book-club-avatar.test.ts \
  features/archive/ui/my-page/avatar-picker.test.tsx \
  features/archive/ui/my-page/profile-editor-dialog.test.tsx
```

그 뒤 frontend 표면 검증을 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

이미지, layout, route, API, auth 또는 BFF 동작을 바꾸지 않으므로 별도 component screenshot과 E2E는 요구하지 않는다.

## 9. 구현 범위와 위험

예상 변경은 다음 네 파일로 제한하고, 회귀가 확인될 때만 프로필 편집기 테스트 한 곳을 추가로 고친다.

- `front/shared/ui/book-club-avatar.ts`
- `front/shared/ui/book-club-avatar.test.ts`
- `front/features/archive/ui/my-page/avatar-picker.tsx`
- `front/features/archive/ui/my-page/avatar-picker.test.tsx`
- 필요할 때만 `front/features/archive/ui/my-page/profile-editor-dialog.test.tsx`

주요 위험은 문학적 이름이 실제 그림 설명을 대체해 접근성을 떨어뜨리는 것이다. 이를 metadata 분리와 picker accessible-name test로 막는다. Server, DB와 wire key를 건드리지 않아 저장 호환성 위험은 만들지 않는다.
