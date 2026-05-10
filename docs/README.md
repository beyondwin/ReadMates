# ReadMates Documentation

ReadMates 문서의 진입점입니다. 어떤 일을 할 때 어디 문서를 보면 되는지 짧게 안내합니다. 문서 본문은 카테고리 디렉터리에서 관리합니다.

## 어디로 갈지

| 하려는 일 | 문서 |
| --- | --- |
| 코드의 현재 동작·경계를 이해하고 싶다 | [`development/architecture.md`](development/architecture.md) |
| 로컬에서 실행·테스트해 보고 싶다 | [`development/local-setup.md`](development/local-setup.md), [`development/test-guide.md`](development/test-guide.md) |
| 운영에 배포하거나 배포 절차를 확인한다 | [`deploy/README.md`](deploy/README.md) |
| 어떤 surface에 무엇을 쓸지 정해서 작업한다 | 루트 [`AGENTS.md`](../AGENTS.md) → [`agents/`](agents) 가이드 |
| 과거 분석/사후 보고서를 찾는다 | [`reports/README.md`](reports/README.md) |
| 과거 설계 spec과 구현 계획을 찾는다 | [`superpowers/specs`](superpowers/specs), [`superpowers/plans`](superpowers/plans) |

## 디렉터리 의미

- [`development/`](development) — 현재 동작 기준의 정전 가이드 (architecture, local setup, test, technical decisions, versioning, release management). 코드와 충돌하면 코드와 함께 갱신합니다.
- [`deploy/`](deploy) — 운영 배포 runbook. Cloudflare Pages, OCI Compose stack, OCI MySQL HeatWave, multi-club domain, public repo safety.
- [`agents/`](agents) — surface별 작업 가이드(front, server, design, docs). 루트 [`AGENTS.md`](../AGENTS.md)가 router, 이 디렉터리가 본문입니다.
- [`reports/`](reports) — 특정 시점의 분석·진단·사후 보고서. 파일명은 `YYYY-MM-DD-<주제>.md` 형식.
- [`superpowers/`](superpowers) — 과거 기능별 design spec과 implementation plan의 시계열 기록. 현재 동작 기준이 아니라 이력 보관용입니다.
- [`private/`](private) — 공개 저장소에 push하지 않는 운영 메모. `.gitignore`로 제외됩니다.

## 글쓰기 원칙

- 현재 동작은 `development/architecture.md`가 source of truth입니다. 다른 문서와 충돌하면 코드와 함께 architecture를 갱신합니다.
- `reports/`의 파일은 작성 시점의 스냅샷입니다. 시간이 지난 뒤 현재 기준처럼 읽지 않도록 파일명에 날짜를 박습니다.
- 실제 운영 secret, OCID, 사용자 데이터, 공개에 부적합한 도메인 목록은 어떤 문서에도 두지 않습니다 — `private/` 또는 Git 밖 채널에 둡니다.
