# ReadMates Engineering Proof Portfolio Design

작성일: 2026-05-17
상태: APPROVED DESIGN SPEC
문서 목적: ReadMates를 채용/포트폴리오 리뷰어, 미래 유지보수자, 오픈소스/기술 독자가 짧은 시간 안에 평가할 수 있는 "운영 가능한 풀스택 제품 증거물"로 고도화하는 분기급 설계를 정의한다.

## 1. 배경

ReadMates는 이미 단순 CRUD 애플리케이션 범위를 넘어섰다. 현재 제품은 여러 정기 독서모임의 공개 사이트, 멤버 앱, 호스트 운영 도구, 플랫폼 관리자 콘솔, Google OAuth, Cloudflare Pages Functions BFF, Spring Boot API, MySQL/Flyway, optional Redis/Kafka, 알림 outbox, in-app AI 세션 기록 생성, 공개 릴리즈 safety scan, 운영 runbook을 함께 갖고 있다.

최근 작업 흐름도 제품 신규 기능보다 운영형 플랫폼으로서의 완성도에 집중되어 있다.

- in-app AI 세션 생성과 PII-safe 운영 경계
- 플랫폼 관리자 triage 콘솔
- release risk remediation
- Flyway collation 사고 후속 정리
- public release candidate scan
- 디자인 시스템과 architecture boundary 강화

현재 강점은 많지만, 외부 리뷰어가 처음 README를 열었을 때 이 강점들이 하나의 주장으로 빠르게 연결되지는 않는다. 문서, case study, ADR, runbook, 테스트, CI, release checklist가 각각 존재하지만 "ReadMates는 어떤 어려운 문제를 어떤 근거로 해결했는가"라는 평가 흐름이 분산되어 있다.

이번 분기 고도화는 새 기능을 크게 늘리는 프로젝트가 아니다. 핵심은 이미 존재하는 제품과 엔지니어링 자산을 외부 평가 가능한 증거 체계로 묶고, 그 증거를 믿게 만드는 유지보수 품질 작업을 병행하는 것이다.

## 2. 목표

분기 목표는 다음 한 문장으로 고정한다.

> ReadMates를 "운영 가능한 풀스택 제품을 설계, 출시, 개선할 수 있는 엔지니어링 증거물"로 만든다.

구체 목표:

- README에서 5분 안에 제품 문제, 역할 모델, 운영 난이도, 기술 선택, 핵심 증거를 이해할 수 있게 한다.
- 공개 guest-mode 경로를 리뷰어용 walkthrough로 정리하되, 공개 권한을 넓히지 않는다.
- BFF 보안, 알림 outbox, multi-club domain, PII-safe AI 세션 생성, release safety 같은 강점을 case study와 테스트 근거로 연결한다.
- 프론트 서버 상태 관리, 서버 UseCase/transaction 경계, architecture/quality gate를 분기 내 작은 PR 단위로 개선한다.
- release readiness, public release scan, deploy runbook, post-deploy watch, postmortem을 하나의 운영 증거 흐름으로 묶는다.
- 공개 저장소 안전 규칙을 유지한다. 실제 멤버 데이터, secret, private domain, deployment state, OCID, token-shaped example, local absolute path를 추가하지 않는다.

## 3. 비목표

- 신규 대형 제품 기능을 만들지 않는다.
- 게스트 권한을 멤버/호스트/admin/AI workflow까지 넓히지 않는다.
- public bypass, demo auth, fake production admin entrypoint를 만들지 않는다.
- 실제 운영 멤버 데이터나 private 운영값을 데모에 사용하지 않는다.
- 분기 안에 전체 리팩터링 완료를 약속하지 않는다.
- 문서만 보기 좋게 만들고 코드/테스트 근거가 없는 showcase를 만들지 않는다.
- AI provider pricing, external platform limit, current model catalog 같은 변동성 높은 외부 사실을 새로 주장하지 않는다. 필요한 경우 공식 문서로 별도 검증하거나 "재검증 필요"로 표시한다.

## 4. 주요 대상

우선순위:

1. 채용/포트폴리오 리뷰어
2. 미래 유지보수자
3. 오픈소스/기술 독자

### 4.1 채용/포트폴리오 리뷰어

리뷰어가 확인하고 싶은 질문:

- 제품이 실제 문제를 푸는가, 아니면 데모성 CRUD인가?
- 한 사람이 프론트, BFF, 백엔드, DB, 배포, 운영까지 연결해 설계할 수 있는가?
- 보안, 권한, 공개 저장소 안전, 장애 대응을 진지하게 다루는가?
- 복잡한 기능을 테스트와 문서로 유지보수 가능하게 만들었는가?

이번 고도화는 이 질문에 README, walkthrough, case study, test evidence로 답한다.

### 4.2 미래 유지보수자

유지보수자가 확인하고 싶은 질문:

- 현재 동작의 source of truth는 어디인가?
- 변경할 때 어느 guide를 읽어야 하는가?
- frontend/server/doc boundary는 어떻게 나뉘는가?
- 어떤 테스트가 어떤 회귀를 막는가?
- release risk와 public safety는 어떻게 검증하는가?

이번 고도화는 문서 구조와 implementation backlog를 통해 유지보수자가 첫 변경을 안전하게 시작하도록 만든다.

### 4.3 오픈소스/기술 독자

기술 독자가 확인하고 싶은 질문:

- ReadMates에서 배울 수 있는 비자명한 기술 문제는 무엇인가?
- 왜 BFF, outbox, multi-club domain, AI audit/cost guard 같은 선택을 했는가?
- 설계가 코드와 테스트로 이어지는가?

이번 고도화는 case study와 architecture evidence를 README에서 자연스럽게 발견하게 한다.

## 5. 설계 원칙

### 5.1 Evidence Over Claims

문서에서 말하는 강점은 코드, 테스트, script, runbook, ADR, case study 중 하나 이상의 근거로 이어져야 한다.

예:

- "BFF 보안 경계가 있다"는 주장은 ADR, BFF proxy code, BFF tests, security-public-repo 문서로 이어져야 한다.
- "AI 세션 생성은 PII-safe하게 운영된다"는 주장은 AI runbook, audit/cost guard, PII check script, 관련 tests로 이어져야 한다.
- "릴리즈 안전장치가 있다"는 주장은 build-public-release-candidate script, public-release-check script, release-readiness-review 문서로 이어져야 한다.

### 5.2 Guest Access Is Not Demo Auth

기존 guest-mode는 공개 클럽 소개, 공개 기록, 공개 세션 상세를 보여주는 제품 권한 모델이다. 이번 고도화는 이를 리뷰어용 관람 동선으로 정리할 뿐, 접근 권한을 넓히지 않는다.

게스트가 볼 수 없는 멤버/호스트/platform admin/AI/알림 흐름은 다음 방식으로 설명한다.

- public-safe walkthrough 문서
- sanitized screenshot 또는 텍스트 캡처
- fixture 기반 설명
- case study
- 테스트와 runbook 근거

### 5.3 Code Keeps the Promise

문서 개편은 코드 품질 작업과 분리되지 않는다. 문서에서 "유지보수 가능하다"고 주장하려면 실제 boundary test, architecture test, lint/build/test, query migration 상태, transaction policy가 함께 정리되어야 한다.

### 5.4 Small Reviewable PRs

분기 로드맵은 큰 rewrite가 아니라 reviewer가 이해할 수 있는 작은 PR 단위로 나눈다.

좋은 단위:

- README entry flow 재정리
- guest-mode showcase 문서 추가
- claim-to-evidence map 추가
- `host/members` TanStack Query migration
- 서버 transaction boundary 정책 문서화
- 특정 service의 UseCase 분리

나쁜 단위:

- README와 architecture와 server 리팩터링과 UI 개편을 한 PR에 섞기
- 모든 frontend server state를 한 번에 migration
- 모든 server transaction annotation을 한 번에 이동

### 5.5 Public Repo Safety by Default

모든 문서와 fixture는 공개 저장소를 기준으로 작성한다.

금지:

- 실제 member 이름, 이메일, 메시지, 기록
- private domain
- real deployment state
- OCI OCID
- secret/token/API key 형태의 문자열
- local absolute path
- 운영 DB dump나 raw logs

허용:

- repo-relative path
- placeholder host (`https://api.example.com`, `host@example.com`)
- synthetic club/member/session fixture
- public fallback domain already documented by the project

## 6. 분기 로드맵

분기는 4개 milestone로 나눈다. 각 milestone은 "보여줄 결과물"과 "그 결과물을 믿게 만드는 코드/검증"을 함께 가진다.

### 6.1 Milestone 1: Portfolio Entry

목표: 리뷰어가 README에서 5분 안에 ReadMates의 문제, 제품 표면, 운영 난이도, 기술 선택을 이해한다.

주요 결과물:

- README entry narrative 개편
- case study index 정리
- architecture evidence map 초안
- "무엇을 먼저 보면 되는가" section

범위:

- README는 entrypoint로 유지하고 source of truth를 대체하지 않는다.
- architecture 상세는 `docs/development/architecture.md`로 link한다.
- deployment 상세는 `docs/deploy/`와 runbook으로 link한다.
- release safety는 script 문서와 release-readiness 문서로 link한다.

성공 기준:

- README 상단 1/3 안에서 제품 문제, 대상 역할, 핵심 기술 증거, guest-mode link가 보인다.
- README의 강점 항목은 최소 하나 이상의 evidence link를 가진다.
- 공개 저장소 안전 규칙을 새 문구가 깨지 않는다.

### 6.2 Milestone 2: Engineering Confidence

목표: "이 프로젝트는 커졌지만 무너지지 않게 관리되고 있다"는 근거를 만든다.

주요 결과물:

- frontend server-state migration 분기 계획
- `host/members`, `host/sessions`, `host/notifications` 중 2~3개 Query migration 또는 상세 계획화
- server UseCase/transaction boundary 후보 1~2개 정리
- architecture/quality gate evidence 문서 정리

프론트 후보:

1. `host/members`
   - 운영 빈도가 높고 state mutation이 명확하다.
   - route-owned data coordination과 TanStack Query invalidation 패턴을 보여주기 좋다.
2. `host/notifications`
   - manual dispatch preview/confirm, dispatch ledger, recipient state가 있어 운영형 UX 근거가 강하다.
   - E2E 영향이 있을 수 있어 작은 단위로 접근한다.
3. `host/sessions`
   - session lifecycle, visibility, current/upcoming state와 연결되어 제품 의미가 크다.
   - migration 범위가 넓을 수 있으므로 slice를 나누어야 한다.

서버 후보:

1. Host session command UseCase split
   - session draft mutation, lifecycle transition, attendance confirmation, publication update, dashboard query 책임을 더 좁힌다.
   - 기존 clean architecture 방향과 맞는다.
2. Transaction boundary policy
   - adapter-level `@Transactional`과 application-service transaction owner 정책을 문서화하고, 작은 slice부터 정리한다.
3. Auth package service location cleanup
   - `auth/application` 직속 service를 `auth/application/service`로 이동해 package convention을 맞추는 후보.

성공 기준:

- migration/cleanup은 "어떤 회귀를 줄이는가"가 문서에 적혀야 한다.
- 각 작업은 관련 guide와 최소 검증 명령을 명시한다.
- route-first/frontend boundary와 server clean architecture boundary를 약화하지 않는다.

### 6.3 Milestone 3: Operational Proof

목표: release, deploy, observability, incident response가 분리된 문서가 아니라 하나의 운영 증거 흐름으로 읽힌다.

주요 결과물:

- release evidence flow 문서
- public release candidate scan 설명 정리
- post-deploy watch/runbook link 정리
- incident/postmortem index 정리
- Flyway collation 사고와 AI 운영 리스크 대응을 public-safe learning으로 재구성

핵심 흐름:

```text

Change
  -> local checks
  -> release readiness review
  -> public release candidate build/check
  -> tag/release process
  -> deploy runbook
  -> smoke/post-deploy watch
  -> incident/postmortem if needed
```

성공 기준:

- README 또는 showcase에서 release safety 근거로 진입할 수 있다.
- release-readiness checklist는 "tests passed"만으로 충분하다고 표현하지 않는다.
- public safety scan과 deploy runbook 사이의 역할이 분명하다.
- 운영 학습 사례는 private 운영값 없이 재현 가능한 교훈 중심으로 설명된다.

### 6.4 Milestone 4: Guest-Mode Showcase & Evidence Path

목표: 이미 존재하는 guest-mode 공개 경로를 리뷰어가 의도대로 따라가며 제품 역량을 이해하도록 만든다.

이 milestone은 새 guest 기능이 아니다. 현재 public routes와 guest behavior를 문서화하고, private workflow는 evidence로 보완한다.

주요 결과물:

- guest-mode walkthrough 문서
- public-safe demo club/session narrative
- private workflow evidence section
- screenshot policy 또는 screenshot inventory
- README에서 guest-mode showcase로 가는 entry link

권한 원칙:

- 게스트는 공개 클럽 소개, 공개 기록, 공개 세션 상세까지만 본다.
- 멤버/호스트/platform admin/AI/알림 private workflow는 공개 접근을 열지 않는다.
- private workflow는 sanitized screenshot, fixture explanation, case study, test evidence로 설명한다.

성공 기준:

- 리뷰어가 로그인 없이 공개 제품 표면을 따라갈 수 있다.
- 리뷰어가 로그인 없이 볼 수 없는 기능도 "어떤 기능이고 어떤 근거로 검증되는지" 이해할 수 있다.
- demo path가 실제 멤버 데이터나 운영 secret을 요구하지 않는다.

## 7. Evidence Graph

중심 진입점은 README다. README는 모든 설명을 품지 않고, 평가 흐름을 다음 그래프로 안내한다.

```text

README
  -> Guest-Mode Showcase
  -> Architecture Evidence
  -> Case Studies
  -> Engineering Confidence
  -> Operational Proof
  -> Release Safety
```

### 7.1 Claim-to-Evidence Map

| Claim | Primary Evidence | Secondary Evidence | Verification |
| --- | --- | --- | --- |
| Cloudflare BFF가 browser-facing security boundary다 | `docs/development/adr/0001-cloudflare-pages-functions-bff.md`, `docs/development/architecture.md` | BFF proxy tests, security docs | frontend/BFF tests, public release check |
| Multi-club context가 slug/host 기반으로 안전하게 resolve된다 | `docs/case-studies/03-multi-club-domain-platform.md`, architecture docs | domain deploy runbook, host header ADR | server tests, BFF tests |
| 알림 발송은 mutation transaction과 분리되어 운영된다 | `docs/case-studies/02-notification-pipeline-with-outbox.md` | Flyway schema, notification runbook | server tests, outbox/consumer tests |
| AI 세션 생성은 PII-safe 운영 경계를 가진다 | AI runbook, AI design spec, case study | audit/cost guard tests, PII check script | `scripts/aigen-pii-check.sh`, targeted AI tests |
| 공개 저장소 안전이 자동화되어 있다 | `docs/deploy/security-public-repo.md`, `scripts/README.md` | release readiness docs | public release candidate build/check |
| 유지보수 경계가 테스트로 강제된다 | architecture docs, frontend/server agent guides | ArchUnit, frontend boundary tests | `architectureTest`, frontend unit tests |
| 운영 사고를 학습으로 남긴다 | postmortem docs, changelog release notes | release-risk remediation plans | release readiness review |

이 표는 milestone 1에서 별도 문서 또는 README section으로 정리한다. 각 row는 실제 존재하는 파일 링크만 포함해야 하며, 없는 evidence를 만들었다고 쓰지 않는다.

## 8. Proposed Document Structure

### 8.1 README 개편 방향

README는 다음 순서를 목표로 한다.

1. 제품 한 줄 설명
2. guest-mode로 볼 수 있는 것
3. 왜 이 프로젝트가 단순 CRUD가 아닌가
4. 역할별 제품 표면
5. 핵심 engineering evidence 4~5개
6. architecture overview
7. how to review this project
8. local setup/checks links
9. source-of-truth links

README가 피해야 할 것:

- 모든 runbook 상세를 README에 붙이는 것
- 이미 architecture 문서가 책임지는 상세 정책을 중복 서술하는 것
- "최신", "완전", "무결" 같은 검증하기 어려운 표현
- 실제 운영값이나 private path 노출

### 8.2 Guest-Mode Showcase 문서

권장 위치:

- `docs/showcase/guest-mode-walkthrough.md`

권장 구조:

1. 목적
2. 리뷰어가 로그인 없이 볼 수 있는 화면
3. 공개 클럽 소개 보기
4. 공개 기록 보기
5. 공개 세션 상세 보기
6. 게스트가 볼 수 없는 private workflow
7. private workflow를 확인하는 evidence links
8. public-safety notes

이 문서는 product walkthrough 문서다. 실제 source of truth는 route code와 architecture 문서다.

### 8.3 Architecture Evidence 문서

권장 위치:

- `docs/showcase/architecture-evidence.md`

권장 구조:

1. One-page architecture map
2. Browser/BFF/Spring/MySQL request path
3. Club context and role boundary
4. Async notification path
5. AI generation path
6. Release/operations path
7. Tests that enforce boundaries

주의:

- `docs/development/architecture.md`를 대체하지 않는다.
- 깊은 구현 상세 대신 "왜 이 구조가 운영 제품에 필요한가"를 설명한다.

### 8.4 Engineering Confidence 문서

권장 위치:

- `docs/showcase/engineering-confidence.md`

권장 구조:

1. Boundary tests
2. Server architecture tests
3. Query budget/migration tests
4. Frontend server-state migration state
5. Static analysis/coverage gates
6. Known improvement backlog
7. How to validate a change

### 8.5 Operational Proof 문서

권장 위치:

- `docs/showcase/operational-proof.md`

권장 구조:

1. Release evidence flow
2. Public release candidate checks
3. Deployment runbooks
4. Observability and request correlation
5. Incident/postmortem practice
6. Rollback and residual risk review

## 9. Technical Improvement Tracks

### 9.1 Frontend Server-State Track

현재 상태:

- TanStack Query v5 provider가 app root에 있다.
- `host/invitations` migration이 완료되어 있다.
- 후속 후보는 `host/members`, `host/sessions`, `host/notifications`, `current-session`, read-heavy public/archive/feedback이다.

분기 권장 순서:

1. `host/members`
   - 멤버 목록, 상태 변경, display name 변경, viewer/member lifecycle가 있다.
   - mutation invalidation 패턴을 보여주기 좋다.
2. `host/notifications`
   - manual dispatch options/preview/confirm/ledger가 있어 운영 UX를 보여준다.
   - preview TTL, resend confirmation, selected session state 때문에 route-owned coordination이 중요하다.
3. `host/sessions`
   - session editor, lifecycle, AI generation, JSON import와 결합되어 있어 크다.
   - 한 번에 전환하지 말고 list/read path와 mutation path를 나눠야 한다.

구현 원칙:

- 새 server state는 `features/<feature>/queries/<area>-queries.ts`에 둔다.
- query key는 const tuple factory로 관리한다.
- route loader는 initial data를 query cache에 handoff한다.
- UI component는 query hook을 직접 호출하지 않는다. route 또는 feature container가 props/callback으로 전달한다.
- mutation success는 targeted invalidation을 수행한다.

검증:

- `pnpm --dir front lint`
- `pnpm --dir front test`
- `pnpm --dir front build`
- route/auth/BFF/user-flow 영향 시 `pnpm --dir front test:e2e`

### 9.2 Server Boundary Track

현재 상태:

- feature-local clean architecture가 다수 slice에 적용되어 있다.
- ArchUnit boundary test가 application/adapter/domain 의존성을 강제한다.
- CQRS read/write package split convention이 문서화되어 있다.
- 일부 legacy service 책임과 transaction annotation 위치는 후속 정리가 필요하다.

분기 권장 순서:

1. Transaction policy documentation
   - application service가 transaction owner가 되는 기준
   - adapter-level transaction이 허용되는 예외
   - scheduler/Kafka listener transaction boundary
   - MySQL isolation expectation
2. Narrow service split candidate
   - Host session command service 책임을 draft/lifecycle/read/attendance/publication으로 나눌 수 있는지 검토
   - 단일 PR에서 interface split만 먼저 수행 가능
3. Package convention cleanup
   - auth service 위치 정리 후보
   - architecture test를 나중에 좁게 추가

검증:

- `./server/gradlew -p server unitTest`
- 변경 표면에 따라 `./server/gradlew -p server integrationTest`
- architecture boundary 변경 시 `./server/gradlew -p server architectureTest`
- PR-level confidence가 필요하면 `./server/gradlew -p server check`

### 9.3 Release Safety Track

현재 상태:

- public release candidate build/check script가 있다.
- release-readiness-review 문서가 있다.
- CHANGELOG가 release evidence를 담고 있다.
- public repo safety를 위한 docs/deploy 문서가 있다.

분기 권장 작업:

1. release evidence flow 문서 작성
2. README에서 release safety를 evidence로 link
3. recent incident learning index 정리
4. public release check가 무엇을 보장하고 무엇을 보장하지 않는지 명시

검증:

- docs-only change: `git diff --check -- <changed-docs>`
- public/release/deploy docs change:
  - `./scripts/build-public-release-candidate.sh`
  - `./scripts/public-release-check.sh .tmp/public-release-candidate`

## 10. Error Handling and Risk Management

이번 고도화는 기능 runtime error path를 새로 추가하지 않는다. 대신 문서와 계획의 오류를 다음 방식으로 관리한다.

### 10.1 Stale Claim Risk

위험: README/showcase가 현재 코드보다 앞서가거나, 이미 바뀐 동작을 오래된 상태로 설명한다.

대응:

- 문서 claim은 current code, config, tests, scripts, architecture 문서와 대조한다.
- historical `docs/superpowers` 문서는 현재 동작의 source of truth로 쓰지 않는다.
- 불확실한 내용은 "재확인 필요"로 표시하거나 제외한다.

### 10.2 Public Safety Risk

위험: showcase 과정에서 실제 운영값이나 private data를 노출한다.

대응:

- fixture와 screenshot은 synthetic 또는 sanitized만 사용한다.
- private workflow는 접근을 열지 않고 evidence로 설명한다.
- public release check와 targeted safety scan을 실행한다.

### 10.3 Scope Creep Risk

위험: 포트폴리오 고도화가 대형 제품 개발이나 전면 리팩터링으로 변한다.

대응:

- milestone마다 "보여줄 결과물"과 "검증"을 먼저 정의한다.
- technical improvement는 작은 PR 단위로 제한한다.
- 새 기능보다 evidence path를 우선한다.

### 10.4 Reviewer Confusion Risk

위험: 문서가 많아져 리뷰어가 무엇을 봐야 할지 더 혼란스러워진다.

대응:

- README에 "How to review this project" section을 둔다.
- showcase 문서는 3~4개로 제한한다.
- 각 문서의 첫 section에 "이 문서가 답하는 질문"을 둔다.

## 11. Testing and Verification Strategy

### 11.1 Docs-only Verification

모든 문서 변경:

```bash
git diff --check -- <changed-docs>
```

문서가 README, deploy, release, public safety를 건드릴 때:

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

### 11.2 Frontend Verification

frontend route/state/UI 작업:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

route/auth/BFF/user-flow 변경:

```bash
pnpm --dir front test:e2e
```

### 11.3 Server Verification

server application/API/persistence 작업:

```bash
./server/gradlew -p server clean test
```

boundary/static analysis/coverage 영향:

```bash
./server/gradlew -p server check
./server/gradlew -p server architectureTest
```

개발 중 fast lane:

```bash
./server/gradlew -p server unitTest
./server/gradlew -p server integrationTest
```

### 11.4 Evidence Verification

claim-to-evidence map을 작성한 뒤 다음을 점검한다.

- 모든 claim에 실제 파일 링크가 있는가?
- 링크된 파일이 current source of truth인가, historical plan인가?
- historical plan을 evidence로 쓸 경우 "history/context"로 명확히 표시했는가?
- claim이 code/test/script보다 과장되어 있지 않은가?
- public-safety rule을 새 문구가 깨지 않는가?

## 12. Milestone Acceptance Criteria

### Milestone 1 Acceptance

- README가 entrypoint로 재정리되어 있다.
- "How to review this project" 흐름이 있다.
- 핵심 engineering evidence가 case study/test/runbook으로 연결된다.
- `git diff --check`와 public safety scan이 실행되었거나, 실행하지 못한 이유가 기록된다.

### Milestone 2 Acceptance

- frontend server-state migration 후보가 최신 상태로 정리되어 있다.
- 최소 1개 이상의 migration/cleanup PR이 merged 가능 단위로 계획되거나 완료되어 있다.
- server transaction/UseCase boundary 후보가 구체 파일/검증 단위로 좁혀져 있다.
- 변경된 코드 표면의 lint/test/build 또는 server test가 실행된다.

### Milestone 3 Acceptance

- release evidence flow 문서가 있다.
- release readiness, public release candidate scan, deploy runbook, post-deploy watch가 연결된다.
- 운영 학습 사례가 public-safe하게 요약되어 있다.
- deploy/release docs 변경 시 public release candidate checks가 실행된다.

### Milestone 4 Acceptance

- guest-mode walkthrough가 있다.
- 공개 접근 범위와 private workflow evidence가 구분되어 있다.
- private workflow를 보기 위해 demo auth나 public bypass가 필요하지 않다.
- screenshot/fixture가 public-safe하다.

## 13. Implementation Planning Notes

상세 구현 계획은 이 스펙 승인 후 별도 implementation plan으로 작성한다. 구현 계획은 다음 단위로 나누는 것이 적절하다.

1. Documentation/showcase PRs
   - README entry flow
   - guest-mode walkthrough
   - architecture evidence
   - engineering confidence
   - operational proof
2. Frontend confidence PRs
   - `host/members` Query migration
   - `host/notifications` Query migration 또는 detailed plan
   - related tests
3. Server confidence PRs
   - transaction policy doc
   - one narrow UseCase split candidate
   - related tests/architecture checks
4. Release safety PRs
   - release evidence flow
   - public scan wording and docs cross-links
   - postmortem/incident learning index

각 implementation task는 다음을 반드시 포함한다.

- touched surface
- source files
- non-goals
- public safety constraints
- exact validation commands
- rollback or residual risk note

## 14. Open Questions Resolved in Brainstorming

- 우선순위는 D/C/B 중 D를 주축으로 하고 C, B를 보조한다.
- 리뷰 대상 우선순위는 채용/포트폴리오 리뷰어, 미래 유지보수자, 오픈소스/기술 독자 순이다.
- 시간 단위는 분기급 master plan이다.
- 접근 방식은 Engineering Proof Portfolio다.
- Milestone 4는 새 guest 기능이 아니라 기존 guest-mode를 리뷰어용 evidence path로 정리하는 것이다.

## 15. Final Design Summary

ReadMates는 이미 제품 기능과 운영 장치가 많다. 이번 분기 고도화의 핵심은 더 많은 기능을 붙이는 것이 아니라, 제품과 코드와 운영 기록을 하나의 평가 가능한 증거 흐름으로 연결하는 것이다.

리뷰어는 README에서 시작해 guest-mode 공개 화면을 보고, private workflow는 sanitized evidence로 이해하고, architecture/case study/test/runbook을 통해 엔지니어링 주장을 검증한다. 유지보수자는 같은 문서 흐름에서 source of truth와 검증 명령을 찾는다.

이 설계가 성공하면 ReadMates는 "많이 만든 프로젝트"가 아니라 "운영 가능한 제품을 설계하고 지속적으로 안전하게 개선한 프로젝트"로 읽힌다.
