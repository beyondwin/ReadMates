# ReadMates 개발자 문서

로컬 실행, 테스트, 구조 이해를 위한 개발자 문서 허브입니다. 루트 `README.md`는 제품 개요이고, 세부 절차는 이 디렉터리에 있습니다.

## 바로 가기

| 목적 | 문서 |
| --- | --- |
| 프로젝트 지형과 변경 유형별 읽는 순서 | [project-map.md](project-map.md) |
| 신규 합류 개발자 온보딩 | [new-developer-onboarding-guide.md](new-developer-onboarding-guide.md) |
| 변경 slice의 risk evidence 선택 | [acceptance-matrix.md](acceptance-matrix.md) |
| 로컬 실행 | [local-setup.md](local-setup.md) |
| 테스트, 공개 릴리즈, 배포 smoke 점검 | [test-guide.md](test-guide.md) |
| Lighthouse 진단과 시각 회귀 baseline | [test-guide.md#lighthouse-diagnostic](test-guide.md#lighthouse-diagnostic), [test-guide.md#시각-회귀-컴포넌트-하니스](test-guide.md#시각-회귀-컴포넌트-하니스) |
| Frontend build 크기 예산 | [performance-budget.md](performance-budget.md) |
| 제품/기술 구조와 frontend route-first 경계 | [architecture.md](architecture.md) |
| Cross-surface vertical slice 체크리스트 | [vertical-slice-checklist.md](vertical-slice-checklist.md) |
| AI 세션 생성, JSON 가져오기, 피드백 문서 템플릿 | [session-import-generator.md](session-import-generator.md) |
| Spring AI provider, 비용·복구, trace/privacy | [spring-ai-2-provider-architecture.md](spring-ai-2-provider-architecture.md) |
| TanStack Query 이관 현황과 패턴 | [server-state-migration.md](server-state-migration.md) |
| Admin 화면 하드닝 체크리스트 | [admin-hardening-baseline.md](admin-hardening-baseline.md) |
| 디자인 시스템과 pattern catalog | [../../design/README.md](../../design/README.md) |
| 주요 기술적 의사결정 | [technical-decisions.md](technical-decisions.md) |
| Architecture Decision Records | [adr/README.md](adr/README.md) |
| 버저닝과 release tag 기준 | [versioning.md](versioning.md) |
| 릴리즈 관리와 CHANGELOG | [release-management.md](release-management.md), [../../CHANGELOG.md](../../CHANGELOG.md) |
| 릴리즈 준비와 잔여 위험 점검 | [release-readiness-review.md](release-readiness-review.md) |
| 배포 문서 허브 | [../deploy/README.md](../deploy/README.md) |
| Cloudflare Pages 배포 | [../deploy/cloudflare-pages.md](../deploy/cloudflare-pages.md) |
| OCI Compose stack 배포 | [../deploy/compose-stack.md](../deploy/compose-stack.md) |
| OCI backend 배포 | [../deploy/oci-backend.md](../deploy/oci-backend.md) |
| 공개 저장소 보안 | [../deploy/security-public-repo.md](../deploy/security-public-repo.md) |
| 운영 runbook과 observability | [../operations/README.md](../operations/README.md) |
| Release helper scripts | [../../scripts/README.md](../../scripts/README.md) |

## 주요 구조 문서

- **처음 작업할 때**: [project-map.md](project-map.md)에서 source of truth 우선순위, 코드 지형, 변경 유형별 읽는 순서, 검증 선택표를 봅니다.
- **새로 합류했을 때**: [new-developer-onboarding-guide.md](new-developer-onboarding-guide.md)에서 제품 표면, 저장소 구조, frontend/BFF/backend/DB/Redis/Kafka 흐름을 한 번에 봅니다.
- **risk evidence 선택**: [acceptance-matrix.md](acceptance-matrix.md)에서 selected row와 인접 high-risk 제외 사유를 고르고 handoff에 남깁니다.
- **여러 표면을 함께 바꿀 때**: frontend, BFF, server API, auth, persistence, public-safety가 겹치면 [vertical-slice-checklist.md](vertical-slice-checklist.md)로 범위를 먼저 정합니다.
- **경계의 기준**: frontend route-first 경계, 멀티 클럽 context, 서버 내부 구조, Optional Redis 계층, 세션 lifecycle과 공개 범위, 피드백 문서 흐름, 세션 기록 JSON 가져오기, AI-assisted 콘텐츠 운영, 이메일 알림과 호스트 운영은 모두 [architecture.md](architecture.md)의 같은 이름 섹션이 기준입니다.
- **UI 품질 증거**: Lighthouse diagnostic은 public/member/host/admin dev-seed route의 비차단 baseline입니다. 시각 회귀는 props만으로 검증할 수 있는 route-critical UI 조각을 Docker renderer baseline으로 관리합니다. 명령은 [test-guide.md](test-guide.md)에 있습니다.
- **기술 선택 배경**: [technical-decisions.md](technical-decisions.md)와 [adr/README.md](adr/README.md)를 봅니다.
- **버전**: 제품 버전은 Git tag `vMAJOR.MINOR.PATCH` 하나입니다. 기준은 [versioning.md](versioning.md)입니다.
- **작업 규칙**: full source checkout에 repository-local contributor guidance가 있으면 먼저 확인합니다. 공개 artifact에서는 이 문서와 실제 코드·테스트·scripts로 표면과 검증을 고릅니다.
- **과거 기록**: `docs/superpowers`와 `docs/reports`는 과거 기록입니다. 현재 동작 기준은 이 디렉터리와 코드, 테스트, 배포 스크립트입니다.

## 문서 경계

- 개발 문서는 한국어가 기본입니다. 명령어, 경로, 환경 변수, API path, 기술명은 코드 표기를 그대로 씁니다.
- 운영 secret, 실제 멤버 데이터, DB dump, 배포 상태, 로컬 절대 경로는 넣지 않습니다.
- 직접 backend/API origin 예시는 `https://api.example.com` 같은 placeholder만 씁니다.
- 배포 상세 runbook은 `docs/deploy`에 두고, 여기서는 개발자가 알아야 할 연결점만 다룹니다.

## 문서 업데이트 완료 기준

- 코드, 설정, 테스트, 스크립트와 맞는 사실만 현재 동작으로 씁니다.
- `docs/superpowers`의 과거 계획은 맥락으로만 보고 현재 기준으로 올리지 않습니다.
- 배포, public release, secret 처리를 설명하면 관련 `docs/deploy`와 `scripts/README.md`도 함께 확인합니다.
- 바꾼 문서에 `git diff --check -- <changed-docs>`를 실행하고, targeted safety scan이나 공개 릴리즈 후보 점검을 했는지 적습니다.
