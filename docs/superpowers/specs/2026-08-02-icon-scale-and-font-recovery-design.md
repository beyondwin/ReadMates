# ReadMates 아이콘 스케일과 로컬 폰트 403 복구 설계

작성일: 2026-08-02
상태: APPROVED — IMPLEMENTATION PLAN READY
대상 표면: frontend shared navigation, member home, notes, local Vite runtime

## 1. 목표

멤버 홈의 참석 명단과 최근 클럽 흐름, 클럽 노트, 데스크톱·모바일 공통 내비게이션에서 지나치게 작은 아바타와 아이콘을 읽기 쉬운 크기로 조정한다. 동시에 화면 전환 중 Pretendard 동적 서브셋 요청이 `403 Forbidden`으로 실패하는 로컬 개발 환경 오류를 실제로 복구한다.

기능, 권한, 데이터 계약, 문구와 정보 구조는 바꾸지 않는다. 기존 ReadMates의 차분한 편집 디자인과 최소 44px 조작 영역을 유지한다.

## 2. 확인된 현상과 원인

현재 로컬 `front/node_modules/pretendard` 링크는 현재 checkout이 아니라 다른 Codex worktree의 pnpm virtual store를 가리킨다. `front/src/styles/globals.css`가 Pretendard 동적 서브셋 CSS를 패키지에서 import하면 Vite는 각 폰트 파일을 `/@fs/` 절대 경로 요청으로 변환한다. 이 경로가 현재 Vite workspace 허용 범위 밖이므로 폰트 파일 요청을 403으로 거부한다.

Pretendard 동적 서브셋은 `unicode-range`별로 나뉘어 있다. 화면 전환 후 새 한글 글자가 DOM에 등장할 때 필요한 서브셋을 추가 요청하므로, 최초 로드보다 route 전환 중 오류가 몰려 보인다.

이 문제는 제품 API나 인증 오류가 아니라 로컬 의존성 링크가 다른 worktree를 가리키는 환경 오류다.

## 3. 승인된 시각 스케일

### 3.1 콘텐츠 아바타

| 표면 | 현재 | 변경 |
| --- | ---: | ---: |
| 데스크톱 최근 클럽 흐름 작성자 | 22px | 30px |
| 데스크톱 참석 명단 | 26px | 34px |
| 모바일 멤버 활동 작성자 | 26px | 32px |
| 데스크톱·모바일 노트 작성자 | 20–22px | 30px |

작성자 이름, 날짜, RSVP 상태와의 정렬을 함께 조정한다. 아바타만 커지고 행 높이 또는 간격이 그대로여서 답답해지지 않도록 동일 그룹의 gap을 광학적으로 맞춘다.

### 3.2 공통 내비게이션과 동작 아이콘

| 표면 | 현재 | 변경 |
| --- | ---: | ---: |
| 데스크톱·모바일 브랜드 마크 | 30px | 34px |
| 데스크톱 계정 아바타 | 28px | 32px |
| workspace 전환 아이콘 | 17–18px | 22px |
| 모바일 하단 탭 아이콘 | 20px | 24px |
| 모바일 바로가기 아이콘 | 18px | 22px |
| 노트 검색 아이콘 | 14px | 20px |
| 인라인 이동 chevron | 13–16px | 18px |

아이콘을 담는 버튼과 링크는 최소 44px 조작 영역을 유지한다. 작은 control 안에서 아이콘만 확대해 잘리는 경우에는 control의 시각 박스만 필요한 만큼 조정하되, 내비게이션 높이와 콘텐츠 시작점은 불필요하게 바꾸지 않는다.

### 3.3 적용 범위

- `front/shared/ui/top-nav.tsx`
- `front/shared/ui/mobile-header.tsx`
- `front/shared/ui/mobile-tab-bar.tsx`
- `front/shared/ui/readmates-brand-mark.tsx`
- `front/shared/ui/workspace-switch-icon.tsx`
- `front/features/member-home/ui/member-home-records.tsx`
- `front/features/member-home/ui/member-home.tsx`
- `front/shared/ui/notes-feed-list.tsx`
- `front/shared/ui/notes-session-filter.tsx`
- 관련 `front/src/styles/globals.css`, `front/shared/styles/mobile.css`, design-system navigation CSS

다른 기능의 의미 있는 상태 아이콘이나 조밀한 편집기 내부 아이콘은 일괄 확대하지 않는다. 이번 변경은 사용자가 지정한 읽기 표면과 공통 앱 chrome에 한정한다.

## 4. 폰트 403 복구

### 4.1 선택한 방식

저장소가 고정한 `pnpm@11.13.1`을 Corepack으로 실행해 현재 checkout의 의존성 링크를 다시 생성한다. 복구 후 현재 Vite 서버가 새 링크를 읽도록 전체 reload를 수행하고, 필요하면 기존 프로세스를 종료하지 않는 범위에서 별도 포트의 검증 서버를 사용한다.

성공 조건은 다음과 같다.

- `front/node_modules/pretendard`의 실제 경로가 현재 repository root 아래에 있다.
- `globals.css` 변환 결과의 Pretendard `/@fs/` URL이 현재 repository root 밖을 가리키지 않는다.
- 홈과 노트를 왕복한 뒤 Pretendard `.woff2` 요청에 403이 없다.
- `document.fonts.load()`에서 `Pretendard Variable`이 loaded 상태다.

### 4.2 하지 않는 것

- Vite `server.fs.allow`에 외부 worktree 또는 사용자 로컬 절대 경로를 추가하지 않는다.
- 저장소에 로컬 절대 경로를 기록하지 않는다.
- 403을 숨기기 위해 Pretendard를 제거하거나 시스템 폰트 fallback으로 바꾸지 않는다.
- 동일 폰트 바이너리를 `public/`에 중복 복사하지 않는다. 현재 원인은 패키징 방식이 아니라 잘못된 로컬 링크이므로 불필요한 저장소 용량 증가를 피한다.

## 5. 구현과 테스트

### 5.1 TDD

먼저 component test에서 승인된 크기를 observable bounding box로 검증해 현재 14–30px 값 때문에 실패하는 RED를 확인한다.

- TopNav: 브랜드, workspace 전환, 계정 아바타
- MobileHeader/MobileTabBar: 브랜드, workspace 전환, 하단 탭
- MemberHome records: 최근 흐름과 참석 명단 아바타
- Notes feed/session filter: 작성자 아바타와 검색 아이콘

이후 최소 구현으로 GREEN을 만들고 중복된 공통 크기만 shared primitive 또는 CSS token에서 정리한다.

### 5.2 자동 검증

집중 component/unit test를 먼저 실행한 뒤 다음 frontend gate를 실행한다.

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

아이콘 크기 변경은 API, 인증, BFF 또는 route 계약을 바꾸지 않으므로 server와 auth E2E는 이번 변경의 필수 검증이 아니다.

### 5.3 브라우저 검증

한 번의 desktop/mobile 묶음 검사에서 다음을 확인한다.

- `/clubs/:slug/app`의 최근 클럽 흐름과 참석 명단
- `/clubs/:slug/app/notes`의 작성자 아바타와 검색
- 데스크톱 top nav
- 모바일 header와 bottom tab bar
- 320px, 390px, wide desktop에서 overflow와 wrapping
- 최소 44px 조작 영역과 focus-visible
- 홈 → 노트 → 홈 전환 후 console의 Pretendard 403 부재

## 6. 비목표와 안전 경계

- 서버, BFF, 데이터베이스, migration, 권한 또는 공개 범위 변경 없음
- 실제 멤버 데이터, 비밀값, 배포 상태 또는 로컬 절대 경로를 코드·문서·테스트 fixture에 추가하지 않음
- 기존 사용자의 미커밋 문서 변경을 수정하거나 포함하지 않음
- commit, push, PR, deploy는 별도 요청 없이는 수행하지 않음

## 7. 완료 기준

1. 지정된 콘텐츠 아바타와 공통 chrome 아이콘이 승인된 크기로 렌더링된다.
2. 데스크톱과 모바일에서 정렬, 줄바꿈, 44px 조작 영역과 focus가 유지된다.
3. 현재 checkout의 Pretendard 링크가 정상화되고 화면 왕복 후 폰트 403이 재현되지 않는다.
4. 집중 테스트와 frontend lint/test/build가 통과한다.
5. 변경 diff에 기존 미커밋 문서나 로컬 절대 경로가 섞이지 않는다.
