# Hard Problem Case Studies 설계

상태: draft (작성자 검토 대기)
작성일: 2026-05-11
오너: docs / portfolio

## 목적

ReadMates 저장소를 30초 안에 스캔하는 시니어/CTO 면접관에게, "이 사람이 풀어낸 비자명한 문제 3가지"를 본 적 있게 만든다. 현재 README는 *what*은 잘 설명하지만 *어떤 어려움을 어떻게 풀었나*가 1단계 클릭 너머에 있다. 본 작업은 README 최상단에 짧은 highlight 섹션을 추가하고, 각 항목을 `docs/case-studies/` 하위에 deep-dive 문서로 작성한다.

ADR(0001~0010)이 *결정의 결과 카드*라면, case study는 *결정에 도달한 사고 과정과 운영 검증 이야기*다. 둘은 상호 보완.

## 현재 맥락

### README 첫 화면 분석

`README.md` (현재 v1.6.0 시점, 202줄):

- 1줄 요약 — 있음.
- 데모/링크 — 있음.
- 핵심 기능 — 있음.
- 기술 스택 — 있음.
- 아키텍처 요약 — 있음.
- 검증 방식 — 있음.
- 로컬 실행 — 있음.

빠진 것: **"이 프로젝트의 Hard Problems"**. 면접관 관점에서 풀스택 CRUD와 ReadMates를 구분지을 수 있는 압축된 신호가 README 첫 두 화면에 없다.

### 후보 hard problems

본 spec의 사전 분석 결과, 다음 3개가 *비자명함 + 운영 데이터 + 측정 가능한 결과* 모두를 만족한다:

1. **BFF 보안 경계와 무중단 secret rotation** — Cloudflare Pages Functions를 단순 프록시가 아니라 보안 경계로 운영. 단일 secret의 회전 다운타임 문제를 multi-secret + audit table로 해결.
2. **Mutation과 알림 발송의 결합 분리** — MySQL transactional outbox + Kafka relay로 mutation latency를 SMTP에 묶지 않고, 발송 실패가 mutation을 롤백하지 않게.
3. **Multi-club domain platform** — 한 인스턴스에서 path-routed shared fallback과 custom domain alias를 동일 codepath로 처리. host vs slug 우선순위 + dev/prod parity가 깨졌을 때의 incident 재현/수정.

각 케이스가 ADR과 1:1 매핑되지 않는다 — 한 case study는 여러 ADR(설계)과 한 incident(운영)를 *서사*로 묶는다.

## 결정

다음 두 산출물을 만든다:

1. README 최상단 (한 줄 요약 직후)에 **"Engineering Highlights"** 섹션 추가 — 3개 케이스 각 1문단, deep-dive 링크.
2. `docs/case-studies/` 신설 + 3개 deep-dive 문서.

### `docs/case-studies/` 구조

```text
docs/case-studies/
  README.md
  01-bff-security-and-secret-rotation.md
  02-notification-pipeline-with-outbox.md
  03-multi-club-domain-platform.md
```

### Case study 공통 구조

각 deep-dive는 다음 섹션을 가진다:

```markdown
# Case Study NN — <제목>

> TL;DR — 한 문단. 문제, 접근, 결과를 30초 안에.

## 문제

- 어떤 운영/사용자 상황이 트리거였나.
- 왜 *비자명한*가 (단순한 해법이 왜 통하지 않는가).
- 제약 (zero-cost, 1인 운영, 공개 저장소, 운영 사용자 존재 등).

## 접근

- 검토한 옵션들 (대안 표).
- 선택한 접근과 핵심 통찰.

## 구현

- 핵심 코드 위치 (path:line, 짧은 발췌).
- 데이터/이벤트/계약 모양.
- dev/prod parity 메커니즘.

## 검증

- 어떤 테스트가 이 결정을 지키는가 (architecture/contract/perf/e2e).
- 운영 메트릭/지표 (가능하면 수치).

## Trade-off와 한계

- 감수한 비용.
- 알려진 미해결 follow-up.

## 다시 한다면

- 같은 결정을 다시 한다면 무엇을 다르게 할까.
- 시간/규모가 달랐다면 다른 선택이 정당했을까.

## 관련

- ADR 링크.
- spec/plan 링크.
- post-mortem 링크 (해당 시).
```

### README "Engineering Highlights" 섹션 위치와 내용

위치: README 1줄 요약과 데모 링크 직후, 핵심 기능 섹션 *앞*. 한 면접관이 첫 스크롤 안에 본다.

내용 (초안 draft, plan에서 정밀화):

```markdown
## Engineering Highlights

운영 중인 서비스에서 풀어낸 비자명한 문제들입니다.

- **BFF 보안 경계와 무중단 secret rotation** — Cloudflare Pages Functions에서 cookie domain strip, 내부 헤더 차단, multi-secret 회전을 한 곳에 응집. 운영 중 분 단위 secret 회전과 audit log를 보유합니다. → [Case study](docs/case-studies/01-bff-security-and-secret-rotation.md)
- **Mutation과 알림 발송의 결합 분리** — MySQL transactional outbox + Kafka relay로 mutation 트랜잭션과 SMTP/in-app 발송을 분리. PENDING/PUBLISHING/PUBLISHED/FAILED/DEAD state machine과 masked audit ledger를 운영합니다. → [Case study](docs/case-studies/02-notification-pipeline-with-outbox.md)
- **Multi-club domain platform** — 하나의 인스턴스에서 path-routed shared fallback과 custom domain alias를 같은 codepath로. host/slug 우선순위 설계와 dev/prod parity가 깨진 실제 incident를 post-mortem으로 보유합니다. → [Case study](docs/case-studies/03-multi-club-domain-platform.md)
```

## Case study 1 — BFF 보안 경계와 무중단 secret rotation (개요)

**문제**: Cloudflare Pages Functions 위에서 SPA + edge function을 운영하면서, BFF가 단순 프록시가 아니라 보안 경계 역할을 해야 했다. 추가로 운영 중 secret 노출 의심 시 *분 단위*로 회전 가능해야 했다.

**비자명함**:
- Set-Cookie의 Domain 속성이 그대로 통과되면 cross-origin 노출 위험.
- 내부 추적용 `x-readmates-*` 헤더가 클라이언트로 새지 않아야 함.
- single secret 회전은 짧은 다운타임을 발생시킴 (BFF rollout과 Spring rollout 사이의 race).

**접근**:
- 보안 룰을 `front/functions/_shared/proxy.ts` 단일 헬퍼에 응집.
- secret 회전을 위해 `READMATES_BFF_SECRET` (primary) + `READMATES_BFF_SECRETS` (rotation candidates) 이중화.
- 모든 회전을 `bff_secret_rotation_audit` row에 기록.

**핵심 코드 인용**:
- `front/functions/_shared/proxy.ts` — `stripCookieDomain`, `copyUpstreamHeaders`, `clientIpFromRequest`.
- `front/functions/api/bff/[[path]].ts:151-154` — host/slug 헤더 정책.
- `server/.../BffSecretAuthenticator.kt` (위치는 plan에서 grep 확인).
- `db/mysql/migration/V*-create-bff-secret-rotation-audit.sql` (버전은 plan에서 확인).

**검증**:
- `front/tests/unit/cloudflare-bff.test.ts`, `cloudflare-oauth-proxy.test.ts`.
- `scripts/smoke-production-integrations.sh`.

**ADR 링크**: ADR-0001 (BFF 채택), ADR-0005 (secret rotation), ADR-0006 (session cookie).

**Trade-off**:
- BFF 룰이 한 헬퍼에 모이는 만큼, 그 헬퍼의 회귀가 *모든 API 호출에 영향*. 단위 테스트 비중을 높이는 것이 비용.
- multi-secret은 두 환경 변수 동기화 책임 (Cloudflare + Spring) — runbook 필요.

**다시 한다면**:
- secret 회전을 자동 90일 주기로 (현재는 수동).
- BFF 룰의 contract test를 server-side에서도 (현재는 client-side만).

## Case study 2 — Mutation과 알림 발송의 결합 분리 (개요)

**문제**: 세션 발행/멤버 초대/피드백 게시 mutation의 side effect로 이메일 + in-app 알림이 발송되어야 한다. 동기 발송은 mutation latency를 SMTP에 묶고, 발송 실패가 mutation을 롤백시킨다.

**비자명함**:
- "그냥 비동기로 던지자"는 outbox 없이 하면 *mutation은 성공했는데 알림은 못 받음* 또는 *알림은 갔는데 mutation rollback*이 발생.
- 트랜잭션 일관성을 유지하면서 SMTP/Kafka 같은 외부 시스템에 의존하지 않는 mutation path가 필요.

**접근**:
- MySQL `notification_event_outbox` 테이블에 mutation과 *같은 트랜잭션*에서 이벤트 기록.
- 별도 relay job이 outbox→Kafka publish.
- consumer가 `notification_deliveries` (channel별 row, EMAIL/INBOX) state machine으로 발송.
- state: PENDING → PUBLISHING → PUBLISHED | FAILED → DEAD.
- masked email + hash로 audit. plain/HTML body는 단일 helper로 생성 (drift 방지).

**핵심 코드 인용**:
- `server/.../notification/adapter.out.persistence/NotificationEventOutboxAdapter.kt`.
- `server/.../notification/application.service/NotificationDeliveryEngine.kt`.
- `server/.../notification/adapter.in.kafka/NotificationEventConsumer.kt`.
- `db/mysql/migration/V*-notification-*.sql` (버전은 plan에서 확인).

**검증**:
- `./server/gradlew -p server test --tests "*Notification*"` (Testcontainers Kafka).
- `CachedNotificationBacklogProvider` 1분 주기 backlog gauge → Prometheus.
- Host audit ledger UI (메뉴 위치는 plan에서 명시).

**ADR 링크**: ADR-0004 (transactional outbox), ADR-0009 (Zod contract — notification payload도 검증).

**Trade-off**:
- Redpanda 운영 부담 (또는 optional, fallback 모드).
- backlog 자체를 모니터링해야 함.

**다시 한다면**:
- DLQ 자동 alert (현재는 수동 audit 확인).
- consumer scale-out 정책 (현재 single).
- email open/bounce webhook 통합으로 발송 *후* 검증.

## Case study 3 — Multi-club domain platform (개요)

**문제**: 한 ReadMates 인스턴스가 여러 독서모임을 호스팅. 각 클럽이 custom domain (`my-club.com`)을 가질 수도 있고, path-routed shared fallback (`readmates.pages.dev/clubs/<slug>`)으로도 접근 가능해야 한다.

**비자명함**:
- 두 채널을 어느 한쪽으로 강제하면 한쪽 UX가 깨진다.
- BFF가 어떤 정보를 신뢰해서 club을 식별할지 — slug header? host header? 둘 다?
- dev (Vite proxy)와 prod (Cloudflare Pages function) 사이의 BFF 동작 parity가 깨졌을 때 *production-only bug*가 발생.

**접근**:
- club context 우선순위: `X-Readmates-Club-Slug` (명시) > `X-Readmates-Club-Host` (도메인 alias DB 조회) > unscoped.
- custom domain은 `club_domains` 테이블 (status=ACTIVE) + marker file로 health check.
- dev에서는 Vite proxy가 host 헤더를 strip (`vite.config.ts:42-51`). prod에서는 항상 host 헤더 전송.

**핵심 코드 인용**:
- `server/.../club/.../ClubContextResolver.kt`.
- `server/.../club/adapter.out.persistence/JdbcClubContextAdapter.kt`.
- `front/functions/api/bff/[[path]].ts:151-154` (host/slug 헤더 정책).
- `front/vite.config.ts:42-51` (dev parity).

**검증**:
- `./server/gradlew -p server test --tests "*ClubContext*"`.
- multi-club E2E (Playwright).

**ADR 링크**: ADR-0008 (multi-club domain).

**관련 incident**: 2026-05-11 — current-session refresh가 production에서만 빈 상태로 collapse. spec/plan: `docs/superpowers/specs/2026-05-11-current-session-refresh-club-context-design.md`. 이 case study는 incident → root cause → 영구 수정 → BFF 호스트 정책 follow-up으로 이어진다. **Post-mortem 1**과 1:1 연결.

**Trade-off**:
- BFF가 dev/prod에서 다르게 동작 → 잠재적 *production-only bug class*. case study에서 명시.
- club_domains 테이블 status 관리가 1인 운영자에게 수동 부담.

**다시 한다면**:
- BFF host 헤더는 *custom domain*에만 전송, shared fallback에서는 미전송. (현재 후속 ADR 후보.)
- 모든 BFF rule을 dev/prod parity test로 강제 (Vite proxy와 Pages function이 같은 헤더 변환을 수행함을 한 테스트로 검증).

## 비목표

- 새 case study 자동 생성 도구.
- 각 case study의 영어 번역.
- ADR 본문 이전을 기다리지 않음 (case study가 ADR을 인용; 두 작업은 병렬 가능하지만 ADR 링크는 ADR 작성 task와 동기화).
- README 전면 개편. Engineering Highlights 섹션 추가만.
- 신규 운영 메트릭 도입. 기존 메트릭/스크린샷을 인용만.

## 검증

작성 완료 시:

1. `docs/case-studies/` 4개 파일 (README + 3 case).
2. 각 case study가 공통 섹션을 모두 포함.
3. 모든 코드 인용(`path:line`)이 main 브랜치에서 실재.
4. 모든 ADR 링크가 ADR 파일 작성 후 깨지지 않음 (ADR plan과의 통합 검증).
5. README 최상단에 Engineering Highlights 섹션이 한 면접관이 첫 스크롤 안에 보이는 위치에 추가.
6. `./scripts/public-release-check.sh` 통과.

## 위험과 완화

| 위험 | 완화 |
|------|------|
| Case study가 ADR과 중복되어 *재포장*처럼 보임 | Case study는 ADR이 안 가지는 부분(운영 검증, 다시 한다면, incident 연결)을 *반드시* 포함. ADR과 같은 문장 재사용 금지. |
| 인용 코드가 ADR 작업 중 라인 변경 | ADR plan과 *동시 진행 시*, plan 실행자가 두 작업의 인용 라인을 한 번에 검증. 또는 case study를 ADR 완료 직후 작성. |
| 운영 수치(예: 회전 빈도, backlog 평균)가 부정확 | 정량 수치는 사실 확인된 것만. 모르면 "관측 가능 (`/actuator/prometheus`)"으로 적고 후속에 측정 추가. |
| README 첫 화면이 너무 무거워짐 | Engineering Highlights는 *3 bullet, 각 1~2문장 + 링크*. 본문은 deep-dive에. |
| Public repo 안전 — incident 서술에서 실제 호스트/회원/secret 노출 | sanitization 규약: 호스트는 `readmates.pages.dev` (이미 공개), 회원 이름 placeholder, secret value 0. |

## 대안과 기각 사유

| 대안 | 기각 이유 |
|------|----------|
| README에 case 본문 inline 작성 | README가 길어지면 첫 인상 파괴. deep-dive는 별도 문서가 자연스럽다. |
| `docs/blog/`처럼 시계열 글 | 운영 일기보다 *재사용 가능한 사례 카드*가 면접관에게 더 유용. |
| ADR과 case를 하나의 문서로 합침 | ADR은 *결정의 결과*, case는 *문제→해결→검증의 서사*. 청중과 톤이 다름. |
| 한 case에 여러 문제 묶기 | 문제 1개 = case 1개. 묶으면 핵심 통찰이 흐려짐. |

## 후속(범위 밖)

- Case 4: 공개 저장소 안전 자동화 (gitleaks + custom scanner) — 별도 case로 가치 있지만 첫 라운드에서는 ADR-0010이 충분.
- Case 5: zero-cost 운영 (Cloudflare Pages + OCI free tier) — 운영 비용 수치 측정 후.
- 영어 번역 (해외 채용 라운드).
- 각 case study에 *동영상 데모 30초* 첨부 (production 화면 녹화).
