# ReadMates Showcase

이 디렉터리는 ReadMates를 처음 보는 리뷰어가 제품, 아키텍처, 운영 증거, 유지보수 품질을 빠르게 따라갈 수 있도록 만든 reviewer-facing guide입니다.

현재 동작의 source of truth는 코드, 테스트, scripts, migrations, `docs/development/architecture.md`입니다. Showcase 문서는 그 자료를 대체하지 않고 읽는 순서를 제공합니다.

## 추천 리뷰 순서

1. `README.md`에서 제품 문제와 역할 모델을 확인합니다.
2. `docs/showcase/guest-mode-walkthrough.md`에서 로그인 없이 볼 수 있는 공개 제품 표면을 따라갑니다.
3. `docs/showcase/architecture-evidence.md`에서 BFF, Spring API, MySQL, Redis/Kafka, AI generation, release safety가 어떻게 연결되는지 봅니다.
4. `docs/showcase/engineering-confidence.md`에서 테스트와 경계 검증이 어떤 회귀를 막는지 확인합니다.
5. `docs/showcase/operational-proof.md`에서 release, deploy, observability, postmortem 흐름을 확인합니다.

## 문서별 역할

| 문서 | 답하는 질문 |
| --- | --- |
| `guest-mode-walkthrough.md` | 로그인 없이 무엇을 볼 수 있고, private workflow는 어떤 evidence로 확인하는가? |
| `architecture-evidence.md` | 이 프로젝트가 단순 CRUD가 아니라 운영형 제품인 근거는 무엇인가? |
| `engineering-confidence.md` | 코드베이스가 커져도 무너지지 않게 하는 경계와 검증은 무엇인가? |
| `operational-proof.md` | 배포, 공개 릴리즈 안전, 장애 대응은 어떤 흐름으로 관리되는가? |

## 공개 안전 기준

Showcase 문서는 실제 멤버 데이터, private domain, 운영 secret, deployment state, OCID, token-shaped example, local absolute path를 포함하지 않습니다. Private workflow는 접근 권한을 넓히지 않고 sanitized 설명, fixture, 테스트, runbook으로 설명합니다.
