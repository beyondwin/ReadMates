# ReadMates Showcase

처음 보는 리뷰어가 제품, 아키텍처, 운영 증거, 유지보수 품질을 빠르게 따라가도록 만든 문서 모음입니다.

현재 동작의 기준은 코드, 테스트, scripts, migrations, `docs/development/architecture.md`입니다. Showcase는 그 자료를 대신하지 않고 읽는 순서만 알려 줍니다.

## 추천 리뷰 순서

1. `README.md`: 제품이 푸는 문제와 역할 모델
2. `docs/showcase/guest-mode-walkthrough.md`: 로그인 없이 볼 수 있는 공개 화면
3. `docs/showcase/architecture-evidence.md`: BFF, Spring API, MySQL, Redis/Kafka, AI 생성, 릴리즈 안전의 연결
4. `docs/showcase/engineering-confidence.md`: 테스트와 경계 검증이 막는 회귀
5. `docs/showcase/operational-proof.md`: 릴리즈, 배포, 관찰, postmortem 흐름

## 문서별 역할

| 문서 | 답하는 질문 |
| --- | --- |
| `guest-mode-walkthrough.md` | 로그인 없이 무엇을 볼 수 있고, 비공개 흐름은 어떤 근거로 확인하는가? |
| `architecture-evidence.md` | 단순 CRUD가 아니라 운영형 제품이라는 근거는 무엇인가? |
| `engineering-confidence.md` | 코드베이스가 커져도 무너지지 않게 하는 경계와 검증은 무엇인가? |
| `operational-proof.md` | 배포, 공개 릴리즈 안전, 장애 대응은 어떻게 관리하는가? |

## 공개 안전 기준

Showcase 문서에는 실제 멤버 데이터, private domain, 운영 secret, 배포 상태, OCID, token 모양 예시, 로컬 절대 경로를 넣지 않습니다. 비공개 흐름은 권한을 넓히지 않고 sanitized 설명, fixture, 테스트, runbook으로 설명합니다.
