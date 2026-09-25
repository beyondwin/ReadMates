# ReadMates Documentation

ReadMates 문서의 진입점입니다. 하려는 일에 맞는 문서를 고릅니다.

## 어디로 갈지

| 하려는 일 | 문서 |
| --- | --- |
| 프로젝트 지형과 작업 표면을 빠르게 잡는다 | [`development/project-map.md`](development/project-map.md) |
| 공통 작업 계약(권한, local-runtime 경계)을 확인한다 | [`agents/execution.md`](agents/execution.md) |
| 변경 slice의 risk evidence를 고른다 | [`development/acceptance-matrix.md`](development/acceptance-matrix.md) |
| 현재 동작과 경계를 이해한다 | [`development/architecture.md`](development/architecture.md) |
| 로컬에서 실행하고 테스트한다 | [`development/local-setup.md`](development/local-setup.md), [`development/test-guide.md`](development/test-guide.md) |
| Lighthouse 진단과 시각 회귀 baseline을 확인한다 | [`development/test-guide.md#lighthouse-diagnostic`](development/test-guide.md#lighthouse-diagnostic), [`development/test-guide.md#시각-회귀-컴포넌트-하니스`](development/test-guide.md#시각-회귀-컴포넌트-하니스) |
| frontend/server/BFF/auth/persistence를 함께 바꾼다 | [`development/vertical-slice-checklist.md`](development/vertical-slice-checklist.md) |
| AI 세션 생성, JSON 가져오기, 피드백 문서 템플릿 형식을 확인한다 | [`development/session-import-generator.md`](development/session-import-generator.md) |
| 기술 결정의 배경을 찾는다 | [`development/adr/README.md`](development/adr/README.md) |
| 디자인 시스템과 gallery catalog를 본다 | [`../design/README.md`](../design/README.md) |
| 배포하거나 배포 절차를 확인한다 | [`deploy/README.md`](deploy/README.md) |
| 배포 진단, 관측성, 사후 보고 절차를 본다 | [`operations/README.md`](operations/README.md) |
| surface별 작업 규칙을 확인한다 | 루트 [`AGENTS.md`](../AGENTS.md) → [`agents/`](agents) 가이드 |
| 비자명한 문제의 deep-dive를 읽는다 | [`case-studies/README.md`](case-studies/README.md) |
| 과거 분석·사후 보고서를 찾는다 | [`reports/README.md`](reports/README.md) |
| 과거 설계 spec과 구현 계획을 찾는다 | [`superpowers/specs`](superpowers/specs), [`superpowers/plans`](superpowers/plans) |

## 디렉터리 의미

| 디렉터리 | 내용 |
| --- | --- |
| [`showcase/`](showcase/README.md) | 처음 보는 리뷰어용 읽기 순서: guest-mode walkthrough, architecture evidence, engineering confidence, operational proof |
| [`development/`](development) | 현재 동작 기준의 개발 문서: architecture, local setup, test, ADR, versioning, release management. 코드와 다르면 코드와 함께 고칩니다. |
| [`../design/`](../design) | 재사용 UI package와 정적 디자인 catalog |
| [`deploy/`](deploy) | 배포 runbook: Cloudflare Pages, OCI Compose stack, OCI MySQL HeatWave, multi-club domain, 공개 저장소 안전 |
| [`operations/`](operations) | 반복 운영 runbook, observability, postmortem. 실제 운영 출력 전문은 Git 밖에 둡니다. |
| [`agents/`](agents) | 공통 실행 계약과 surface별 작업 가이드(front, server, design, docs). 루트 [`AGENTS.md`](../AGENTS.md)가 router입니다. |
| [`case-studies/`](case-studies) | *문제 → 접근 → 구현 → 검증 → trade-off* deep-dive. ADR이 결정 카드라면 case study는 그 결정까지의 과정입니다. |
| [`reports/`](reports) | 특정 시점의 분석·진단·사후 보고서. 파일명은 `YYYY-MM-DD-<주제>.md`입니다. |
| [`superpowers/`](superpowers) | 과거 기능별 spec과 plan 기록. 현재 동작 기준이 아닙니다. |

## 글쓰기 원칙

- 현재 동작의 기준은 코드와 `development/architecture.md`입니다. 다른 문서가 다르면 코드와 함께 architecture를 고칩니다.
- `reports/`는 작성 시점 snapshot입니다. 현재 기준처럼 읽지 않도록 파일명에 날짜를 붙입니다.
- 운영 secret, OCID, 사용자 데이터, 공개하면 안 되는 도메인은 어떤 문서에도 두지 않습니다. 이런 정보는 Git 밖에서 관리합니다.
