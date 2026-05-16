# ReadMates 디자인 시스템 갤러리 고도화 설계

작성일: 2026-05-17
상태: USER-APPROVED DESIGN SPEC
문서 목적: 첫 디자인 시스템 구현 이후, 디자인/기획자가 ReadMates의 제품 인상과 Public/Member 패턴을 빠르게 판단할 수 있도록 `design/docs` 카탈로그와 필요한 `design/system` 패턴 컴포넌트를 고도화하는 범위를 정의한다.

## 1. 배경

현재 디자인 시스템은 `design/system` 패키지를 source of truth로 두고, `design/docs` 정적 사이트가 실제 패키지 컴포넌트를 렌더링한다. 안정 컴포넌트는 `Button`, `Badge`, `TextField`, `TextArea`, `Surface`이며, 기존 `TopNav`, `MobileHeader`, `MobileTabBar`는 route-aware props 분리가 끝나지 않아 legacy 상태다.

다음 고도화의 1차 사용자는 개발자가 아니라 디자인/기획 관점의 리뷰어다. 따라서 문서 사이트는 import path와 prop table보다 먼저 ReadMates의 분위기, 화면 밀도, 역할별 장면 차이를 직관적이고 깔끔하게 보여줘야 한다.

## 2. 목표

- `design/docs` 첫 화면을 컴포넌트 목록 중심에서 Editorial Pattern Gallery 중심으로 재구성한다.
- ReadMates의 방향인 조용한 문학 잡지, 개인 독서 책상, 차분한 아카이브 감각을 첫 화면에서 바로 느끼게 한다.
- `Public Literary Page`와 `Member Reading Desk` 장면을 나란히 비교할 수 있게 한다.
- 두 장면에 필요한 재사용 컴포넌트를 `design/system`에 추가한다.
- 모든 새 stable 후보는 desktop/mobile 예시, 상태 표현, public-safe 샘플 데이터 기준을 가진다.
- 전체 화면은 직관적이고 깔끔해야 하며, 긴 설명이나 빽빽한 API 문서처럼 보이지 않아야 한다.

## 3. 비목표

- Host operating ledger 패턴은 이번 고도화의 주인공으로 만들지 않는다. Migration/status 영역에 향후 후보로만 남긴다.
- route-aware navigation shell을 `design/system`으로 승격하지 않는다.
- 실제 `front` 제품 화면을 대규모로 리팩터링하지 않는다.
- 문서 사이트를 브라우저 기반 디자인 편집기로 만들지 않는다.
- Storybook 같은 외부 문서 도구를 새로 도입하지 않는다.

## 4. 선택한 접근

선택한 접근은 `Editorial Pattern Gallery`다.

문서 사이트는 다음 순서로 읽히게 한다.

```text
Overview
  -> Public Literary Page
  -> Member Reading Desk
  -> Components
  -> Migration
```

첫 화면은 긴 사용법 대신 짧은 브랜드 문장과 두 대표 장면 미리보기를 보여준다. Public 장면은 넓은 여백, 잡지형 헤드라인, 절제된 CTA를 강조한다. Member 장면은 현재 읽는 책, 세션 상태, 다음 액션을 더 촘촘하고 개인적인 책상처럼 보여준다.

개발자용 import path와 source metadata는 숨기지 않지만 보조 정보로 둔다. 이 사이트의 1차 목적은 디자인/기획자가 “ReadMates답게 보이는가”와 “이 장면에 어떤 패턴을 써야 하는가”를 빠르게 판단하는 것이다.

## 5. 새 컴포넌트 범위

이번 고도화에서 `design/system`에 추가할 컴포넌트는 Public/Member 장면을 구성하는 데 필요한 최소 범위로 제한한다.

| 컴포넌트 | 목적 | 주요 상태 |
| --- | --- | --- |
| `BookCover` | 공개 소개와 멤버 책상에서 책을 시각적으로 대표한다. | 이미지 있음, 이미지 없음 fallback, compact |
| `AvatarChip` | 호스트나 참여자 표시를 작게 보여준다. | initials fallback, 긴 이름, secondary metadata |
| `EmptyState` | 아직 콘텐츠가 없거나 조건을 만족해야 보이는 상태를 조용하게 안내한다. | 기본, action 포함, compact |
| `LockedState` | 권한 제한, 멤버 전용, 승인 대기를 숨기지 않고 명확히 보여준다. | member-only, pending, closed |
| `DocumentPanel` | 소개문, 읽기 노트, 세션 요약처럼 문서성 텍스트를 담는다. | default, quiet, divided content |

이 컴포넌트들은 route, API client, auth loader, feature-specific data shape를 import하지 않는다. 제품 의미는 props와 children으로 주입한다.

## 6. 대표 패턴 범위

`PublicShowcase`와 `ReadingDesk`는 실제 제품 화면을 복제하는 route component가 아니다. `design/docs`에서 문서화하는 대표 패턴이며, 실제 `@readmates/design-system` 컴포넌트를 조합해 ReadMates의 화면 톤을 보여주는 preview다.

### Public Literary Page

사용 장면:

- 클럽 공개 소개
- 초대 랜딩
- 공개 예정 읽기 섹션

시각 기준:

- 헤드라인은 문학 잡지처럼 읽히되 과장된 hero로 만들지 않는다.
- CTA는 명확하지만 화면을 지배하지 않는다.
- `DocumentPanel`, `BookCover`, `EmptyState`, `LockedState`를 통해 공개/비공개 경계를 보여준다.

### Member Reading Desk

사용 장면:

- 멤버의 현재 읽기 상태
- 다음 세션 또는 참여 상태
- 개인 노트와 세션 요약

시각 기준:

- Public보다 정보 밀도가 높지만 대시보드처럼 차갑지 않아야 한다.
- 책 표지, 상태 badge, 다음 액션이 모바일에서도 한 흐름으로 읽혀야 한다.
- `BookCover`, `AvatarChip`, `DocumentPanel`, `LockedState`를 중심으로 구성한다.

## 7. 문서 사이트 UX

데스크톱에서는 단순한 좌측 내비게이션을 둔다.

```text
ReadMates DS
Overview
Public
Member
Components
Migration
```

모바일에서는 좌측 내비게이션을 없애고 상단 탭 또는 세그먼트 형태로 바꾼다. 모든 섹션은 먼저 시각 예시를 보여준 뒤 필요한 설명만 붙인다.

UX 규칙:

- 첫 화면은 짧은 브랜드 문장과 두 대표 장면 preview로 시작한다.
- 섹션 수와 카드 수를 줄이고, 한 화면에서 판단 가능한 정보만 둔다.
- 컴포넌트 API보다 제품 장면과 사용 기준을 먼저 보여준다.
- 중첩 카드, 긴 설명형 hero, 장식용 그래픽, marketing-style 섹션을 피한다.
- 한국어와 영어가 섞인 텍스트가 버튼, badge, chip, panel 안에서 넘치지 않아야 한다.

## 8. 데이터와 Public Safety

`design/docs`는 API를 호출하지 않는다. 샘플 데이터는 문서 사이트 내부의 public-safe 데이터 파일에서만 제공한다.

금지 데이터:

- 실제 회원명, 이메일, 초대 token, session cookie
- private domain, deployment hostname, OCI 값
- secret이나 token처럼 보이는 예시
- 실제 운영 상태나 private 배포 상태

샘플 콘텐츠는 완전히 가상의 클럽, 책, 세션, 사람 이름만 사용한다. 이메일 예시가 필요하면 `host@example.com` 같은 안전한 placeholder만 사용한다.

## 9. 상태와 접근성 기준

새 컴포넌트는 다음 상태를 문서와 테스트에 포함한다.

- Focus-visible 상태가 기존 design-system focus ring과 일관된다.
- Disabled, locked, empty, pending 상태를 색상만으로 구분하지 않는다.
- `LockedState`는 권한 제한을 숨기지 않고 명확한 제목과 보조 설명을 제공한다.
- `BookCover`는 이미지가 없거나 alt text가 필요한 경우에도 깨지지 않는다.
- `AvatarChip`은 긴 한국어/영어 이름과 initials fallback을 안정적으로 처리한다.
- `DocumentPanel`은 긴 문서형 텍스트와 짧은 metadata가 섞여도 레이아웃이 무너지지 않는다.

## 10. Responsive 기준

Public 장면:

- 모바일에서 CTA, 소개문, 책 표지가 겹치지 않는다.
- headline은 과도하게 커지지 않고 첫 화면에서 다음 내용의 힌트를 남긴다.
- 공개/비공개 상태가 작은 화면에서도 명확하다.

Member 장면:

- 책 표지, 상태, 다음 액션이 세로 흐름으로 읽힌다.
- chip과 badge는 44px 터치 목표를 방해하지 않는다.
- 긴 제목이나 사람 이름이 control 밖으로 넘치지 않는다.

문서 사이트:

- 데스크톱 좌측 내비게이션은 모바일에서 상단 섹션 이동으로 전환한다.
- Preview는 좁은 화면에서도 가로 스크롤에 의존하지 않는다.
- 레이아웃 확인은 최소 desktop과 mobile viewport에서 수행한다.

## 11. 검증 계획

구현 완료 전 기본 검증:

```bash
pnpm design:check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

시각 검증:

- `design/docs`를 desktop viewport에서 열어 Overview, Public, Member, Components, Migration 흐름을 확인한다.
- mobile viewport에서 좌측 nav 제거, 상단 섹션 이동, Public/Member preview 줄바꿈을 확인한다.
- 새 컴포넌트가 docs와 product app에서 같은 token contract를 소비하는지 확인한다.

문서 검증:

```bash
git diff --check -- docs/superpowers/specs/2026-05-17-readmates-design-system-gallery-design.md
```

## 12. 후속 구현 계획 범위

이 설계가 승인되면 별도 implementation plan은 다음 순서로 작성한다.

1. 새 컴포넌트 API와 테스트 범위를 확정한다.
2. `design/system` 컴포넌트를 구현하고 export boundary test를 갱신한다.
3. `design/docs` IA와 화면 구조를 갤러리형으로 재구성한다.
4. Public/Member pattern preview와 public-safe 샘플 데이터를 추가한다.
5. desktop/mobile visual QA와 기존 frontend checks를 수행한다.
