# ReadMates 개발자 문서

ReadMates를 로컬에서 실행하고, 테스트하고, 구조를 이해하기 위한 개발자 문서 허브입니다. 루트 `README.md`는 포트폴리오 첫 화면에 집중하고, 세부 실행 절차는 이 디렉터리에서 관리합니다.

## 바로 가기

| 목적 | 문서 |
| --- | --- |
| 로컬 실행 | [local-setup.md](local-setup.md) |
| 테스트, 공개 릴리즈, 배포 smoke 점검 | [test-guide.md](test-guide.md) |
| 제품/기술 구조와 frontend route-first 경계 | [architecture.md](architecture.md) |
| 주요 기술적 의사결정 | [technical-decisions.md](technical-decisions.md) |
| 릴리즈 관리와 CHANGELOG | [release-management.md](release-management.md), [../../CHANGELOG.md](../../CHANGELOG.md) |
| 배포 문서 허브 | [../deploy/README.md](../deploy/README.md) |
| Cloudflare Pages 배포 | [../deploy/cloudflare-pages.md](../deploy/cloudflare-pages.md) |
| OCI backend 배포 | [../deploy/oci-backend.md](../deploy/oci-backend.md) |
| 공개 저장소 보안 | [../deploy/security-public-repo.md](../deploy/security-public-repo.md) |
| Release helper scripts | [../../scripts/README.md](../../scripts/README.md) |

## 주요 구조 문서

- 프런트엔드 route-first 경계, feature `api/model/route/ui` 책임, legacy 예외 제거 기준은 [architecture.md](architecture.md)의 "프런트엔드 route-first 경계" 섹션을 기준으로 합니다.
- 서버 current member 해석, optional Redis 계층, 멀티 클럽 context/domain model, 현재/예정 세션 조회, `DRAFT -> OPEN -> CLOSED -> PUBLISHED` lifecycle, 멤버 세션 쓰기, 호스트 세션 쓰기, 세션/기록 공개 범위, 멤버 알림 설정과 알림함, 호스트 알림 운영, 멤버 프로필/표시 이름 경계는 [architecture.md](architecture.md)의 "멀티 클럽 context와 도메인 모델", "서버 내부 구조", "Optional Redis 계층", "세션 lifecycle과 공개 범위", "이메일 알림, 멤버 알림함, 호스트 운영", "멤버 프로필과 표시 이름" 섹션을 기준으로 합니다.
- 핵심 기술 선택의 배경, trade-off, 관련 검증 명령은 [technical-decisions.md](technical-decisions.md)를 기준으로 합니다.
- 작업자는 루트 [../../AGENTS.md](../../AGENTS.md)에서 task별 agent guide를 먼저 고르고, 프런트엔드 패키지 안에서는 [../../front/AGENTS.md](../../front/AGENTS.md)의 패키지 지침도 함께 확인합니다.
- `docs/superpowers` 아래 문서는 과거 설계와 구현 계획의 기록입니다. 현재 동작의 source of truth는 이 디렉터리와 실제 코드, 테스트, 배포 스크립트입니다.

## 문서 경계

- 개발 문서는 한국어 설명을 기본으로 합니다.
- 명령어, 경로, 환경 변수, API path, 기술명은 코드와 같은 표기를 유지합니다.
- 운영 secret, 실제 멤버 데이터, DB dump, private deployment state, 로컬 절대 경로는 문서에 넣지 않습니다.
- 직접 backend/API origin 예시는 `https://api.example.com` 같은 placeholder만 사용합니다.
- 배포 절차의 상세 runbook은 `docs/deploy`에 두고, 이 디렉터리에서는 개발자가 알아야 할 연결점만 다룹니다.
