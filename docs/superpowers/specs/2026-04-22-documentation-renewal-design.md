# ReadMates 문서 리뉴얼 설계

작성일: 2026-04-22

## 목적

ReadMates 저장소를 포트폴리오 공개용으로 읽기 쉽게 정리한다. 1순위 독자는 채용 담당자와 면접관이며, README 첫 화면에서 프로젝트의 문제 정의, 제품 완성도, 기술적 판단, 검증 방식을 빠르게 이해할 수 있어야 한다. 동시에 기술 면접관이나 개발자가 로컬 실행, 테스트, 배포 구조를 확인할 수 있도록 개발자 문서를 한글로 분리한다.

## 현재 맥락

ReadMates는 소규모 독서모임을 위한 invite-only 풀스택 웹 애플리케이션이다. 공개 사이트, 멤버 세션 준비, 호스트 운영 도구, 피드백 문서 열람, 공개 기록을 하나의 제품 흐름으로 묶는다.

현재 README는 영어 중심이며 제품 설명, 아키텍처, 보안 경계, 로컬 실행, 테스트, 배포 개요가 한 문서에 함께 들어 있다. 공개 저장소 안전성, Cloudflare Pages Functions BFF, Google OAuth, 역할 기반 권한, Playwright E2E, Testcontainers, 공개 릴리즈 후보 검증 스크립트처럼 포트폴리오에서 강하게 보여줄 수 있는 요소가 이미 있으나, README 첫인상에서는 이 강점들이 충분히 선명하지 않다.

## 리뉴얼 방향

README는 전체 매뉴얼이 아니라 포트폴리오 첫 화면으로 재구성한다. 긴 실행법과 배포 절차는 README에서 요약만 제공하고, 상세 내용은 한글 개발자 문서로 연결한다.

핵심 메시지는 다음과 같다.

> ReadMates는 소규모 독서모임의 세션 준비, 참석 관리, 기록 공개, 피드백 문서 열람까지 연결한 풀스택 웹 애플리케이션입니다. 단순 CRUD가 아니라 초대 기반 멤버십, Google OAuth 로그인, 역할별 권한 제어, Cloudflare BFF 보안 경계, Spring Boot API, MySQL 마이그레이션, E2E 테스트, 공개 릴리즈 안전 점검까지 포함해 실제 서비스 운영 흐름을 기준으로 설계했습니다.

포트폴리오 강조점은 균형형으로 둔다. 풀스택 제품 완성도를 중심에 놓고, 보안/인증/권한 설계, 운영/배포 경험, 프론트엔드 UX, 테스트와 공개 안전성을 완성도의 증거로 배치한다.

## README 구조

README는 다음 순서로 정리한다.

1. 프로젝트 한 줄 요약
2. 데모 링크와 공개 저장소 안내
3. 왜 만들었는가
4. 핵심 기능
5. 기술 스택
6. 아키텍처 요약
7. 주요 기술적 의사결정
8. 검증 방식
9. 로컬 실행 요약
10. 개발자 문서 링크

상단에는 다음 정보를 빠르게 확인할 수 있게 둔다.

- Demo: `https://readmates.pages.dev`
- Stack: `React 19`, `TypeScript`, `Spring Boot`, `Kotlin`, `MySQL`, `Cloudflare Pages`
- Scope: 1개 독서모임과 1개 현재 세션에 최적화된 invite-only 서비스
- Highlight: 풀스택 제품 완성도, OAuth/BFF 보안 경계, 역할 기반 권한, AI-assisted 회고 콘텐츠 운영, E2E/릴리즈 안전 점검

## README 스토리라인

README는 다음 흐름으로 읽히게 한다.

1. 독서모임 운영에는 세션 공지, 참여 여부, 질문/서평 제출, 참석 기록, 피드백 문서 공유가 흩어지기 쉽다.
2. ReadMates는 공개 사이트, 멤버 앱, 호스트 운영 도구를 한 서비스 안에 묶어 세션 전후 흐름을 관리한다.
3. 게스트, 둘러보기 멤버, 정식 멤버, 호스트가 서로 다른 화면과 권한을 가진다.
4. 브라우저는 Spring API를 직접 호출하지 않고 Cloudflare Pages Functions BFF를 거치며, Spring은 BFF secret과 origin/referrer 검증으로 신뢰 경계를 둔다.
5. 세션은 `HttpOnly` cookie와 서버 측 session hash로 관리한다.
6. unit test, Playwright E2E, backend test, Testcontainers, 공개 릴리즈 후보 생성, secret/path scan으로 공개 가능한 저장소 상태를 검증한다.

## AI 활용 표현

AI는 앱 내부 자동 생성 기능으로 표현하지 않는다. 현재 ReadMates 서버와 프론트엔드는 AI API를 직접 호출하지 않는다. AI 활용은 앱 외부 운영 워크플로우에서 독서모임 대화 결과물을 정리하고, ReadMates가 그 산출물을 저장, 파싱, 권한 검증, 공개하는 구조로 설명한다.

문서에서 사용할 표현은 다음과 같다.

> ReadMates는 독서모임 대화에서 나온 피드백, 하이라이트, 한줄평을 AI로 정리한 뒤, 앱 안에서 세션 기록과 피드백 문서로 보관·공개·열람하는 운영 흐름을 지원합니다. AI 생성 자체는 앱 외부 워크플로우에서 수행하고, ReadMates는 생성된 Markdown 피드백 문서와 공개 기록 데이터를 안전하게 저장하고 역할별 권한에 맞게 노출합니다.

개발자 문서에서는 다음 제약을 명시한다.

- 서버는 현재 AI API를 직접 호출하지 않는다.
- 호스트가 업로드한 Markdown 피드백 문서를 서버가 파싱해 typed response로 제공한다.
- 공개 기록은 공개로 설정된 데이터만 public route/API에 노출한다.
- 참석자 전용 피드백 문서는 정식 멤버와 참석 여부를 기준으로 열람을 제한한다.

## 개발자 문서 구조

개발자 문서는 한글로 분리한다.

```text
README.md
docs/
  development/
    README.md
    local-setup.md
    test-guide.md
    architecture.md
  deploy/
    README.md
    cloudflare-pages.md
    cloudflare-pages-spa.md
    oci-backend.md
    oci-mysql-heatwave.md
    security-public-repo.md
scripts/
  README.md
```

각 문서의 역할은 다음과 같다.

- `README.md`: 포트폴리오 메인 문서. 프로젝트 요약, 데모 링크, 핵심 기능, 기술 스택, 아키텍처 요약, 주요 의사결정, 검증 방식, 개발자 문서 링크만 둔다.
- `docs/development/README.md`: 개발자 문서 허브. 로컬 실행, 테스트, 아키텍처, 배포 문서로 이동하는 링크를 제공한다.
- `docs/development/local-setup.md`: JDK, Node.js, pnpm, Docker Compose/MySQL 준비, 백엔드 실행, 프론트엔드 실행, dev-login 사용법을 단계별로 정리한다.
- `docs/development/test-guide.md`: 프론트 lint/unit/build, Playwright E2E, 백엔드 테스트, Testcontainers 조건, 공개 릴리즈 체크 명령을 한 곳에 모은다.
- `docs/development/architecture.md`: 제품 구조와 기술 구조를 설명한다. 공개 사이트, 멤버 앱, 호스트 앱, Cloudflare BFF, Spring API, MySQL, 권한 모델, AI-assisted 콘텐츠 운영 흐름을 다룬다.
- `docs/deploy/*.md`: 기존 배포 문서를 한국어 기준으로 문체와 용어를 맞춘다.
- `scripts/README.md`: 공개 릴리즈 후보 생성과 검증 스크립트를 한글로 설명한다.

## 용어 기준

본문 설명은 한국어로 작성한다. 명령어, 경로, 환경변수, API 경로, 기술명은 원문을 유지한다.

| 기존 표현 | 한글 문서 표현 |
| --- | --- |
| Guest | 게스트 |
| Viewer | 둘러보기 멤버 |
| Full member / Active member | 정식 멤버 |
| Host | 호스트 |
| Current session | 현재 세션 |
| Published session / public record | 공개 기록 |
| Feedback document | 피드백 문서 |
| BFF | BFF |
| Release candidate | 공개 릴리즈 후보 |

## 포함 범위

- README의 한글 포트폴리오 중심 재작성
- `docs/development` 개발자 문서 추가
- 기존 배포 문서의 한글 문체 통일
- `scripts/README.md` 한글화
- AI-assisted 콘텐츠 운영 방식의 정확한 설명
- 공개 저장소 안전성, 릴리즈 후보 생성, secret/path scan 설명 유지

## 제외 범위

- 앱 내부 AI API 호출 기능 추가
- 제품 기능 변경
- 배포 자동화 변경
- 테스트 코드 추가나 수정
- 실제 운영 데이터, 비공개 스크린샷, secret 값 포함

## 검증 기준

문서 리뉴얼 완료 후 다음을 확인한다.

- README 첫 화면만 읽어도 프로젝트 목적, 데모, 핵심 기술, 포트폴리오 강점이 드러난다.
- 개발자는 README에서 상세 실행 문서로 자연스럽게 이동할 수 있다.
- AI 관련 문구가 앱 내부 자동 생성 기능으로 오해되지 않는다.
- 공개 저장소에 real secret, 운영 계정값, 로컬 절대 경로, 비공개 모임 데이터가 들어가지 않는다.
- 명령어, 경로, 환경변수, API 경로가 기존 프로젝트 구조와 일치한다.
- 기존 dirty worktree의 무관한 변경은 건드리지 않는다.

## 승인된 접근

사용자는 2026-04-22 대화에서 다음 방향을 승인했다.

- 1순위 독자: 채용 담당자/면접관
- 개발자 문서도 필요함
- 문서는 한국어로 작성
- 강조 방식: 풀스택 제품 완성도를 중심으로 보안, 운영, UX, 테스트를 증거로 배치하는 균형형
- 문서 구조: 포트폴리오 README와 개발자 문서 분리
- AI 활용: 앱 외부에서 AI로 피드백, 하이라이트, 한줄평을 정리하고 ReadMates가 이를 운영 콘텐츠로 저장/공개/권한 제어
