# AI 세션 생성 운영 Runbook

> In-app AI session generation — 호스트 세션 편집기의 legacy 생성과 근거 기반 전체 대본 생성을 운영하는 절차입니다. 현재 계약은 [근거 기반 전체 대본 설계](../../superpowers/specs/2026-07-14-readmates-grounded-whole-transcript-ai-session-generation-design.md)와 현재 코드·설정을 기준으로 합니다.

이 runbook은 다음 상황에서 참조합니다.

- 호스트 또는 운영자가 AI 생성 흐름과 관련된 장애·이상 결과를 보고할 때
- `ops/prometheus/alerts/aigen-rules.yml`의 5개 alert가 발화했을 때
- 운영자가 모델 catalog, club/host cost cap, provider key, kill switch를 수정해야 할 때
- CI의 `scripts/aigen-pii-check.sh` 결과를 진단해야 할 때

## 사전 준비

- VPN, OCI Compose stack SSH (read-only 진단 키 우선; mutation은 deploy SSH 키), `kubectl`/`docker compose` 접근.
- MySQL read replica access (운영 placeholder `mysql://<host>:3306/readmates`) 또는 OCI MySQL HeatWave 콘솔.
- Redis CLI (`redis-cli -h <host> -a <password>`; production은 TLS 또는 stunnel).
- Prometheus + Grafana 대시보드. 대시보드 정의는 `ops/grafana/dashboards/aigen.json` (8 panels: throughput, latency P50/P95, completion-by-status, retry rate, queue depth, cost, validation failures, regenerations per item). Alert rules는 `ops/prometheus/alerts/aigen-rules.yml`.
- 환경별 secret 회전 채널 (`READMATES_AIGEN_ANTHROPIC_API_KEY`, `READMATES_AIGEN_OPENAI_API_KEY`, `READMATES_AIGEN_GEMINI_API_KEY`).
- 운영 감사 채널: 모든 manual override(키 삭제, cap 해제, kill switch 토글)는 incident ticket과 운영 chat에 timestamp + operator id를 함께 기록합니다.

설정 source of truth: `server/src/main/resources/application.yml`의 `readmates.aigen.*` 블록. 변경 시 deploy 절차는 [release-management.md](../../development/release-management.md)와 [post-deploy-watch.md](post-deploy-watch.md)를 따릅니다.

## Job 상태와 payload lifecycle

AI generation job은 Redis metadata hash와 네 개의 transient payload key를 분리해 운영합니다. 정상 상태 전이는 다음과 같습니다.

```text
PENDING -> RUNNING -> SUCCEEDED -> COMMITTING -> COMMITTED
                     |              |       |
                     |              |       +-- cleanup 실패: COMMITTED + cleanupPending
                     |              +-- receipt 없는 DB 실패/만료 lease: COMMIT_RETRY
                     +-- regenerate는 expectedRevision CAS 성공 시 revision 증가

COMMIT_RETRY -> COMMITTING -> COMMITTED

PENDING/RUNNING/SUCCEEDED -> CANCELLED
PENDING/RUNNING           -> FAILED
```

- Worker start/completion, regenerate, commit, cancel은 Redis CAS로 현재 상태가 기대값일 때만 진행합니다. Cancel/commit/worker completion이 경합하면 늦게 도착한 결과는 저장하지 않습니다.
- `aigen:job:<jobId>` hash는 status, stage, revision, token/cost 누적값, `llmCallCount`, model, lease, `cleanupPending` 같은 content-free metadata만 담고 6시간 TTL까지 유지됩니다.
- `:transcript`, `:turns`, `:result`, `:evidence` 네 payload는 모두 같은 6시간 TTL을 갖습니다. Commit/cancel은 네 payload를 삭제하고 terminal hash만 남깁니다. 이 중 필수 payload가 먼저 만료하면 부분 결과를 노출하지 않고 `JOB_EXPIRED`로 실패합니다.
- Kafka job message는 `jobId`, session/club/host ID, provider, model, job kind의 routing metadata만 전달하고 worker가 Redis에서 content payload를 다시 읽습니다. Transcript, turns, member/display name, prompt/instructions, result, evidence/excerpt는 Kafka에 넣지 않습니다.
- 전체 대본 primary 호출은 1회입니다. 정확히 한 section이 schema/grounding 검증에 실패할 때만 같은 actual provider에 전체 대본을 유지한 section repair 1회를 허용합니다. Availability fallback과 repair, regeneration은 모두 `readmates.aigen.job.max-llm-calls-per-job`(기본 3) 내에서만 실행됩니다.

운영자가 job 상태만 확인해야 할 때는 payload를 열지 말고 hash metadata와 key 존재 여부만 봅니다.

```bash
redis-cli -h <host> -a <password> --no-auth-warning HGETALL "aigen:job:<jobId>"
redis-cli -h <host> -a <password> --no-auth-warning EXISTS \
  "aigen:job:<jobId>:transcript" "aigen:job:<jobId>:turns" \
  "aigen:job:<jobId>:result" "aigen:job:<jobId>:evidence"
redis-cli -h <host> -a <password> --no-auth-warning TTL "aigen:job:<jobId>:transcript"
```

`COMMITTED`/`CANCELLED`인데 payload key가 없는 것은 정상입니다. 운영자는 `GET`, `MGET`, 대본 search, payload download로 내용을 열지 않고 `EXISTS`/`TTL`과 hash metadata만 확인합니다.

## 근거 기반 전체 대본 pipeline 운영 계약

### Rollout과 rollback

- 기본값은 `READMATES_AIGEN_PIPELINE_MODE=LEGACY`입니다. 환경별 mock/public-safe 검증, provider retention 검토, 별도 승인을 끝낸 제한된 환경에서만 GitHub Repository Variable을 `GROUNDED_WHOLE_TRANSCRIPT`로 변경하고 `sync-config` 후 재배포합니다. `READMATES_AIGEN_GROUNDED_RESERVED_OUTPUT_TOKENS`도 같은 경로로 전달되며 기본값과 상한은 `16384`입니다.
- Rollback은 같은 환경의 mode를 `LEGACY`로 되돌린 뒤 재배포하는 것입니다. 장애 중인 grounded job을 legacy result로 fallback하거나 Redis payload를 변환하지 않습니다. 보안·비용 사건은 mode rollback과 더불어 `READMATES_AIGEN_ENABLED=false` kill switch를 사용합니다.
- Global kill switch와 `enabled-providers` allowlist가 pipeline mode보다 우선합니다. Grounded mode에서 schema/grounding 실패를 legacy ungrounded generation으로 우회하지 않습니다.

### 입력, 회원, 수정 규칙

- 지원 입력은 UTF-8 또는 UTF-8 BOM `.txt`, `화자명 MM:SS` header와 이어지는 발언 본문입니다. 최대 1 MiB와 3시간을 동시에 적용하고, 시간은 단조 증가해야 합니다.
- 모든 고유 화자는 현재 같은 클럽의 `ACTIVE` membership 표시 이름 하나와 일치해야 합니다. 비교는 Unicode NFC + trim 후 case-sensitive exact match이며 fuzzy/alias/자동 후보 선택은 없습니다. 대본 화자는 활성 회원 집합의 부분집합이어도 됩니다.
- 비회원, 비활성/다른 클럽 회원, generic label, 중복 정규화 이름은 422로 거절되며 job ID, Redis, Kafka, provider, cost side effect가 없습니다. 호스트는 TXT의 화자명을 현재 표시 이름과 정확히 맞추거나 회원을 활성화한 뒤 새로 업로드합니다.
- Platform admin은 job ID, status, revision, safe error, `cleanupPending` 같은 metadata만 보고 cancel/retry-cleanup 같은 허용된 복구만 수행합니다. 회원 대신 콘텐츠를 열거나 고치고, 화자 검증을 bypass하거나, draft를 commit하지 않습니다.

### Model capability와 call budget

- Canonical model ID는 OpenAI `gpt-5.4-mini`, Claude `claude-sonnet-4-6`, Gemini `gemini-3-flash-preview`입니다. Pricing과 capability는 별도 catalog입니다. Model ID, structured output, context/output limit, pricing은 release 전 provider 공식 1차 문서와 현재 SDK/API surface로 다시 확인합니다.
- Capability가 없거나 structured output/output limit을 확인할 수 없으면 network call 전 503 `MODEL_CAPABILITY_UNAVAILABLE`로 fail closed합니다. Renderer가 만든 실제 요청의 보수적 입력 budget을 넘으면 422 `TRANSCRIPT_TOO_LONG_FOR_MODEL`이며 임의 chunking을 하지 않습니다.
- Application output reserve 기본값과 상한은 16,384 tokens입니다. 환경에서 낮출 수는 있지만 높이지 않습니다. 실제 provider 호출 전에 primary/fallback 요청을 같은 renderer와 capability catalog로 검증합니다.

### Privacy와 근거 열람 경계

- Transcript, parsed turns, draft result, evidence excerpt는 6시간 Redis payload와 현재 호스트 review response에만 있습니다. Kafka, MySQL receipt/audit, log, metric, notification, admin API, incident ticket/chat에는 transcript, 이름, prompt/instructions, provider response, result, excerpt, invalid speaker label을 넣지 않습니다. Audit/metric은 provider/model/status/revision과 turn/speaker/review/warning 같은 aggregate count만 기록합니다.
- 기본 evidence excerpt는 서버가 원본 turn에서 만든 최대 240 Unicode code point입니다. 전체 발언 확장은 현재 revision evidence가 실제 참조한 단일 turn에 대해 현재 호스트 route에서만 허용됩니다. 임의 turn 조회, transcript search/download endpoint는 없습니다.
- Private transcript를 live provider로 보내는 품질 평가는 CI/smoke/rollout의 암묵적 부분이 아닙니다. 보유·파기·provider data-use 조건을 확인한 후 별도의 명시적 승인을 받은 경우에만 실행하고, 이 Goal의 private/live 평가는 `SKIPPED_NOT_AUTHORIZED`입니다.

### Commit/recovery incident 절차

| 상황 | 운영 조치 |
| --- | --- |
| Provider outage | 영향 provider를 allowlist에서 제외하거나 pipeline을 `LEGACY`로 rollback합니다. 이미 검증된 호환 fallback은 전체 대본과 call cap을 그대로 유지합니다. |
| Revision conflict | `STALE_GENERATION_REVISION`으로 commit/regeneration을 멈추고 호스트가 최신 revision을 명시적으로 다시 불러 review를 재개하게 합니다. 운영자가 draft를 합치지 않습니다. |
| Expired job/payload | `JOB_EXPIRED`를 호스트에게 안내하고 public/private 대본을 운영 채널로 받지 않습니다. 호스트가 원본 TXT를 자신의 보안 경계 안에서 재업로드합니다. |
| Expired `COMMITTING` lease | Scheduler/admin metadata retry가 `jobId + revision` receipt를 확인합니다. Receipt가 있으면 DB write 없이 `COMMITTED`로 복구하고, 없으면 `COMMIT_RETRY`로 돌려 안전한 재시도만 허용합니다. |
| `cleanupPending=true` | DB commit은 성공한 상태입니다. Session import/participant upsert를 다시 실행하지 않고 cache invalidation과 네 Redis payload 삭제만 idempotent하게 재시도합니다. |

## 1. 새 모델 allowlist 추가/제거

새 모델 ID를 enable하려면 pricing, grounded capability, provider 활성, server model-list 응답을 함께 맞춰야 합니다. Pricing이 있다고 grounded capability가 검증된 것은 아닙니다.

1. `server/src/main/resources/application.yml`의 `readmates.aigen.pricing` map에 단가 항목을 추가합니다. 예 (`gpt-5.4-mini`):
   ```yaml
   readmates:
     aigen:
       enabled-providers: [CLAUDE, OPENAI, GEMINI]
       pricing:
         "[gpt-5.4-mini]":
           input-per-m-token-usd: 0.75
           cached-input-per-m-token-usd: 0.075
           output-per-m-token-usd: 4.50
   ```
   - Provider 접두사 매칭은 `YamlModelCatalog.providerFromName` (`claude-*`, `gpt-*`/`o\d+`, `gemini-*`). OpenAI 모델 ID는 provider API가 받는 canonical alias (`gpt-5.4-mini`)를 그대로 사용합니다.
   - Grounded canonical ID: `claude-sonnet-4-6`, `gpt-5.4-mini`, `gemini-3-flash-preview`. Legacy pricing catalog의 다른 모델은 capability catalog에 없으면 grounded model-list에 나오지 않습니다.
   - `readmates.aigen.grounded.capabilities` 항목에 context window, max output, structured-output support를 공식 provider 문서와 실제 SDK/API surface로 재검증한 값만 추가합니다. 불명하면 모델을 노출하지 않고 503으로 fail closed합니다.
2. 모델 제거는 같은 map에서 key를 삭제하고, `enabled-providers`에서 해당 provider 전체를 빼면 해당 provider 모델 전부가 한꺼번에 차단됩니다.
3. Frontend는 `GET /api/host/sessions/{sessionId}/ai-generate/models`의 server capability catalog을 source of truth로 사용합니다. Browser에 provider model ID를 별도 hardcode하지 않습니다.
4. PR merge 후 deploy (server → frontend 순). Deploy 절차는 [post-deploy-watch.md](post-deploy-watch.md).
5. Smoke script는 공개 안전 합성 회원 `공개 회원 A`가 `ACTIVE`인 전용 smoke 클럽에서만 실행합니다. Script가 지원 TXT를 임시로 만들며 private transcript 경로를 받지 않습니다. Live provider call은 retention 확인과 별도 명시 승인 후에만 실행합니다. 일반 gate는 `bash -n` 문법 검사만 수행합니다.

Rollback: `application.yml`의 직전 commit으로 되돌리고 재배포.

## 2. 클럽 cost cap 임시 상향 (Redis 키 수동 reset)

`readmates.aigen.caps.club-monthly-cost-usd` (기본 $20) 초과로 호스트가 503/`COST_CAP_EXCEEDED`를 받을 때 임시로 풀어야 하는 경우의 절차입니다.

1. **승인 게이트**: incident ticket을 먼저 만들고, 운영 책임자 1인의 명시 승인을 받습니다. Cap 정책은 spec §6 비용 보호의 핵심이라 무단 해제는 감사 위반입니다.
2. 현재 누적 비용 확인:
   ```bash
   redis-cli -h <host> -a <password> --no-auth-warning GET "aigen:cost:club:<clubId>:2026-05"
   ```
   값은 USD scale=4 BigDecimal의 문자열 표현입니다.
3. Audit-log로 합계와 교차검증:
   ```sql
   SELECT SUM(cost_estimate_usd) AS total
   FROM ai_generation_audit_log
   WHERE club_id = <clubId>
     AND created_at >= DATE_FORMAT(NOW(), '%Y-%m-01');
   ```
4. 임시 reset (감사 후 결정):
   ```bash
   redis-cli -h <host> -a <password> --no-auth-warning SET "aigen:cost:club:<clubId>:2026-05" "0.0000" EX 2678400
   ```
   `EX 2678400` (≈31d)는 monthly counter TTL과 일치합니다. 부분 차감이 필요하면 `SET <newValue>`로 명시값을 적습니다.
5. 같은 incident ticket에 `operator`, `timestamp`, `clubId`, `previousValue`, `newValue`, `justification`을 남기고 다음 영업일에 cap 재산정 또는 정책 변경 여부를 회의 안건으로 올립니다.

Backout: 원래 값을 다시 `SET`. Cap 자체를 영구 상향하려면 `application.yml`의 `caps.club-monthly-cost-usd`를 변경한 PR을 통합 검토합니다.

## 3. 호스트 일일 cap 임시 해제

`readmates.aigen.caps.host-daily-calls` (기본 10회) 초과로 호스트가 `HOST_DAILY_CAP_EXCEEDED`를 받을 때의 절차입니다.

1. **승인 게이트**: incident ticket 발급 + 운영 책임자 승인. 호스트 단위 일일 cap은 PII/abuse 보호 목적이므로 routine 해제 대상이 아닙니다.
2. 현재 카운트:
   ```bash
   redis-cli -h <host> -a <password> --no-auth-warning GET "aigen:cost:host:<userId>:2026-05-17"
   ```
3. Delete (counter TTL 24h):
   ```bash
   redis-cli -h <host> -a <password> --no-auth-warning DEL "aigen:cost:host:<userId>:2026-05-17"
   ```
   해제 후 카운트는 0부터 다시 누적됩니다.
4. Incident ticket에 `operator`, `timestamp`, `userId`, `previousCount`, `justification`, `revertPlan`을 남깁니다. 명시적인 revert plan이 없으면 다음 UTC 자정에 자연 reset됩니다 (TTL 만료).

Backout: TTL 만료를 기다리거나 즉시 counter를 직전 값으로 `SET ... EX 86400`.

## 4. Provider key 회전

Provider별 API key는 `READMATES_AIGEN_ANTHROPIC_API_KEY`, `READMATES_AIGEN_OPENAI_API_KEY`, `READMATES_AIGEN_GEMINI_API_KEY` 환경변수입니다. SDK는 부팅 시 환경값을 읽으므로 회전 후 재시작이 필요합니다.

1. 새 key를 provider 콘솔에서 발급하고 secret manager (OCI Vault 또는 동등)에 등록합니다.
2. Deploy stack의 env file (`/etc/readmates/readmates.env` 또는 compose secret)을 새 값으로 교체. raw 값은 Git에 남기지 않습니다.
3. Spring API 인스턴스 재시작:
   ```bash
   ssh -i <deploy-ssh-key> ubuntu@<vm-public-ip> 'sudo systemctl restart readmates-server'
   ```
4. Smoke (provider별):
   - Claude: `scripts/aigen-smoke-claude.sh`
   - OpenAI: `scripts/aigen-smoke-openai.sh`
   - Gemini: `scripts/aigen-smoke-gemini.sh`
   각 스크립트는 transcript size 검증 + multipart POST + polling을 수행합니다.
5. 5분 후 Grafana 대시보드에서 해당 provider의 success rate와 latency가 정상 범주인지 확인.

Rollback: secret manager에서 이전 key로 되돌리고 재시작. Provider 콘솔에서 새 key를 revoke.

## 5. Schema 실패 spike 조사

`AiGenSchemaFailureSpike` alert (1h SCHEMA_INVALID 비율 > 20%) 또는 호스트의 "AI 생성이 자꾸 실패한다" 보고에 대한 진단 절차입니다.

1. 최근 1h failure를 provider × model로 집계:
   ```sql
   SELECT provider, model, COUNT(*) AS failures
   FROM ai_generation_audit_log
   WHERE error_code = 'SCHEMA_INVALID'
     AND created_at > NOW() - INTERVAL 1 HOUR
   GROUP BY provider, model
   ORDER BY failures DESC;
   ```
2. 비교 분모:
   ```sql
   SELECT provider, model, COUNT(*) AS total
   FROM ai_generation_audit_log
   WHERE created_at > NOW() - INTERVAL 1 HOUR
   GROUP BY provider, model;
   ```
3. 의심 가설:
   - 직전 deploy로 prompt builder 또는 schema 변경 → `git log --since "2 hour ago" -- server/src/main/kotlin/com/readmates/aigen/`.
   - Provider 모델 마이너 버전 변경 (Gemini "auto-updated minor" 등) → provider release notes.
   - 특정 transcript pattern → 같은 club 또는 같은 host의 반복 실패라면 transcript의 형식이 enum off-allowlist일 가능성. 본문은 audit log에 저장되지 않으므로 호스트에게 transcript 재요청해 retro로 확인.
4. 단기 대응: 영향 provider/model을 1번 절차로 allowlist에서 일시 제거. 장기는 schema/prompt 패치.

관련 alert anchor: [`#schema-failure-spike`](#schema-failure-spike), [`#provider-error-burst`](#provider-error-burst).

## 6. 호스트의 결과 의심 보고 대응

호스트가 "AI가 만든 결과가 부정확하다 / 참석자 발언이 아닌 내용이다 / hallucination이다"라고 보고할 때의 절차입니다.

1. 호스트에게 `jobId` 또는 `sessionId`, 생성 시각 같은 metadata만 받습니다. 운영자가 transcript, 이름, result, evidence를 요청하거나 ticket/chat/log에 받지 않습니다. 호스트는 현재 revision의 evidence panel과 직접 편집으로 결과를 확인합니다.
2. Audit log 조회:
   ```sql
   SELECT id, job_id, session_id, club_id, host_user_id, kind, item, provider, model, status,
          error_code, input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd,
          latency_ms, created_at
   FROM ai_generation_audit_log
   WHERE session_id = '<sessionId>'
   ORDER BY created_at DESC;
   ```
3. Redis에 같은 jobId hash가 살아 있으면 (`aigen:job:<jobId>` 6h TTL) 운영자가 status/stage/revision/cleanup metadata와 payload 존재 여부만 확인할 수 있습니다. `COMMITTED`/`CANCELLED` 이후에는 네 transient payload가 삭제되므로 없어도 정상입니다:
   ```bash
   redis-cli -h <host> -a <password> --no-auth-warning HGETALL "aigen:job:<jobId>"
   redis-cli -h <host> -a <password> --no-auth-warning EXISTS \
     "aigen:job:<jobId>:transcript" "aigen:job:<jobId>:turns" \
     "aigen:job:<jobId>:result" "aigen:job:<jobId>:evidence"
   redis-cli -h <host> -a <password> --no-auth-warning TTL "aigen:job:<jobId>:transcript"
   ```
4. 호스트가 동일 transcript로 재검증을 원하면 host editor에서 직접 재생성합니다. 재생성은 revision을 증가시키고 네 section review를 전부 초기화하므로 새 근거를 다시 확인해야 합니다.
5. 의심 패턴이 반복되면 provider/model/pipeline, safe grounding status/count를 aggregate하여 follow-up을 만듭니다. Private source를 live provider로 재전송하는 평가는 별도 승인 없이 실행하지 않습니다.

## 7. Provider 장애 임시 fallback

특정 provider가 5xx/timeout/rate-limit를 burst하거나 [`#provider-error-burst`](#provider-error-burst) alert가 발화했을 때.

1. Provider status page (Anthropic / OpenAI / Google Cloud) 확인. 운영자가 transient 판단이면 5분 모니터링 후 자연 회복 확인.
2. 회복되지 않으면 `application.yml`의 `readmates.aigen.enabled-providers`에서 해당 provider를 제거 (예: `[CLAUDE, GEMINI]`).
3. PR merge + deploy (server 단일 변경, frontend 변경 없음).
4. 효과:
   - UI dropdown의 해당 provider 옵션은 catalog 결과에서 자동 제외됩니다 (`YamlModelCatalog`의 `enabled-providers` 필터).
   - 클럽 default가 해당 provider를 가리키고 있어도 catalog 미포함이라 generation 시도는 503/`PROVIDER_DISABLED`.
   - 호스트는 다른 provider로 수동 전환합니다.
5. Provider 회복 후 같은 PR을 revert deploy.

## 8. 전체 disable kill switch

전체 AI generation 흐름을 비상 정지해야 할 때 (예: 보안 사건, 전사 비용 통제, [`#redis-down`](#redis-down) 등 backbone 장애).

1. `application.yml`의 `readmates.aigen.enabled`를 `false`로 변경 후 PR + deploy. 또는 환경변수 `READMATES_AIGEN_ENABLED=false`로 override 가능.
2. 효과:
   - `AiGenerationKillSwitchFilter`가 `/api/host/sessions/*/ai-generate/**`와 `/api/host/clubs/*/ai-defaults` 요청을 가로채 503 + RFC 7807 `application/problem+json` (`code: AI_DISABLED`)을 반환합니다. Controller bean은 `@ConditionalOnProperty`로 등록되지 않지만, 운영자는 404가 아니라 명시적인 disable 응답을 봅니다.
   - Frontend AI 모드 토글은 여전히 보이지만 generation/default-model 요청은 `AI_DISABLED` 응답을 받아 사용자 안전 오류 상태로 전환됩니다. 토글 자체를 숨기려면 frontend feature flag 변경이 별도로 필요합니다.
   - Kafka consumer (`AiGenerationJobConsumer`)도 같은 flag로 로드되지 않으므로 in-flight job은 다음 부팅에 재처리되지 않습니다. PR 메시지 본문은 transcript 없이 metadata만이라 손실 영향은 job 재시도/만료 처리 범위로 제한됩니다.
3. 운영 chat과 incident ticket에 kill switch on/off 시간을 남깁니다.
4. 복원: flag를 `true`로 되돌리고 deploy. 부팅 후 첫 generation 요청을 smoke 스크립트로 1건 검증.

## 9. Gemini retention policy

`READMATES_AIGEN_GEMINI_API_KEY` 환경변수가 가리키는 Google AI Studio 프로젝트의 **billing tier**가 Gemini 트래픽의 retention 동작을 결정합니다. SDK / 코드 레벨에서 강제할 수 없는 운영-측 invariant이므로 키 회전(§4)·신규 환경 셋업·키 발급 위임 시 매번 검증합니다.

### 요구 조건

- API key는 **유료(paid) Google AI Studio 프로젝트** (Gemini API billing enabled)에서 발급해야 합니다. Paid tier 프로젝트는 prompt/response 데이터를 product improvement 용도로 사용하지 않는다는 Google 측 contractual guarantee가 적용됩니다.
- **무료(free) tier 프로젝트는 사용 금지**입니다. Free tier 트래픽은 Google이 product improvement 용도로 사용할 수 있으므로 spec §5.7 "retention 최소 옵션을 강제한다" 요구를 만족하지 못합니다.

### 검증 절차

1. Google AI Studio 콘솔(또는 GCP 콘솔)에서 키가 속한 프로젝트의 billing status를 확인합니다 (`Billing > Account management`).
2. Billing이 disabled / 무료 quota 상태라면 그 키는 절대 운영/스테이징 환경에 주입하지 마십시오. 잘못 주입된 경우 §4 절차로 즉시 회전하고 incident ticket을 발급합니다.
3. 키 발급/회전 PR을 머지하기 전 reviewer는 "paid-tier 프로젝트 확인됨"을 PR description에 명시적으로 남깁니다 (감사 trail).

### Best-effort 신호 (코드 동작 참고)

`GeminiApiClient`는 모든 요청에 `x-goog-data-policy: no-retention` HTTP 헤더를 함께 보냅니다. 이는 **belt-and-suspenders 정보성 신호**이며 public Gemini Developer API에 문서화된 계약이 아닙니다. Google 서버가 헤더를 묵묵히 무시할 수 있으므로 위 paid-tier 요구를 대체하지 않습니다 (헤더만으로는 retention 차단 보장이 안 됨).

또한 부팅 후 첫 generation 요청 시 INFO 레벨로 다음 로그가 한 번 emit됩니다 (JVM 라이프타임당 1회):

```
GeminiApiClient: retention policy depends on Google AI Studio project tier — confirm paid-tier provisioning; see docs/operations/runbooks/ai-session-generation.md
```

`journalctl -u readmates-server | grep "GeminiApiClient: retention policy"`로 부팅 후 해당 로그가 나왔는지 확인할 수 있습니다. 로그가 안 보인다면 아직 Gemini 호출이 한 번도 일어나지 않았거나 mock 프로필이 활성화된 상태입니다.

### 관련 항목

- [§4 Provider key 회전](#4-provider-key-회전) — 매 회전 시 본 절차로 tier 재검증.
- spec §5.7 (`docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md`) — retention 요구의 정책 근거.
- `server/src/main/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiClient.kt` — 헤더와 부팅 로그의 구현 위치.

## Alert response

다음 anchor 섹션은 `ops/prometheus/alerts/aigen-rules.yml`의 `runbook_url` 링크 대상입니다. 운영자가 alert 본문 링크를 클릭해 바로 도착하는 진입점입니다.

### <a id="provider-error-burst"></a> AiGenProviderErrorBurst (warn)

- **조건**: 특정 `provider` 라벨에 대해 `FAILED` 상태 job 비율이 10m 동안 10%를 초과.
- **즉시 triage**:
  1. Grafana `Completion by status` panel을 provider 필터로 확인.
  2. Audit log로 error_code 분포 확인:
     ```sql
     SELECT error_code, COUNT(*) FROM ai_generation_audit_log
     WHERE provider = '<PROVIDER>' AND status = 'FAILED'
       AND created_at > NOW() - INTERVAL 30 MINUTE
     GROUP BY error_code ORDER BY 2 DESC;
     ```
  3. Provider status page 확인.
- **에스컬레이션**: rate-limit/transient면 30분 관찰, 비-transient면 §7 절차로 provider 임시 fallback.
- **연관 항목**: [§7 Provider 장애 임시 fallback](#7-provider-장애-임시-fallback), [§8 kill switch](#8-전체-disable-kill-switch).

### <a id="schema-failure-spike"></a> AiGenSchemaFailureSpike (warn)

- **조건**: `SCHEMA_INVALID` validation failure 비율이 1h 동안 20% 초과.
- **즉시 triage**: §5의 SQL 쿼리 2개로 provider × model break-down 확인. 직전 deploy diff 확인.
- **에스컬레이션**: 단일 provider/model 집중이면 §1 절차로 임시 allowlist에서 제거. 전 provider면 spec §9 prompt builder 또는 schema regression 회귀.
- **연관 항목**: [§5 Schema 실패 spike 조사](#5-schema-실패-spike-조사), [§1 allowlist 관리](#1-새-모델-allowlist-추가제거).

### <a id="budget-exhaustion"></a> AiGenBudgetExhaustion (info)

- **조건**: 30d 전사 aggregate cost > $1000 (alert는 aggregate. 클럽별 cap은 app 코드에서 강제).
- **즉시 triage**: per-club drill-down은 metric label이 아니라 audit-log SQL로 수행 (spec §11.1 cardinality/PII 제약):
   ```sql
   SELECT club_id, SUM(cost_estimate_usd) AS spend
   FROM ai_generation_audit_log
   WHERE created_at > NOW() - INTERVAL 30 DAY
   GROUP BY club_id
   HAVING SUM(cost_estimate_usd) >= 20
   ORDER BY spend DESC;
   ```
- **에스컬레이션**: 특정 클럽이 cap을 자주 친다면 §2 cap 정책 재산정 안건으로 회의 상정. 전사 cost가 예산 초과면 §1로 비싼 모델을 catalog에서 제거 또는 §8 kill switch.
- **연관 항목**: [§2 클럽 cap 상향](#2-클럽-cost-cap-임시-상향-redis-키-수동-reset), [§3 호스트 cap 해제](#3-호스트-일일-cap-임시-해제), [§1 catalog 축소](#1-새-모델-allowlist-추가제거).

### <a id="queue-lag-high"></a> AiGenQueueLagHigh (warn)

- **조건**: Redis active AI job backlog `readmates_aigen_queue_depth > 50` 5m 지속. 이 gauge는 `PENDING` + `RUNNING` job 수를 `AiGenerationJobStore.loadActiveJobs()`에서 읽는다.
- **즉시 triage**: `/admin/ai-ops`에서 `PENDING`/`RUNNING` job을 확인하고, worker 로그, Redis 연결 상태, provider latency burst를 순서대로 본다.
- **Kafka 확인**: Kafka consumer group lag은 같은 증상의 원인일 수 있지만 이 metric 자체의 의미는 아니다. Kafka lag이 필요하면 별도 consumer lag metric 또는 broker 도구로 확인한다.
- **에스컬레이션**: 실제 backlog면 worker 인스턴스 추가, provider 장애 동반이면 §7. Backbone 장애 의심이면 §8.
- **연관 항목**: [§7 provider fallback](#7-provider-장애-임시-fallback), [§8 kill switch](#8-전체-disable-kill-switch).

### <a id="redis-down"></a> AiGenRedisDown (critical)

- **조건**: `redis_up == 0` AND HTTP 5xx rate > 1 req/s, 1m 지속.
- **즉시 triage**:
  1. Redis health 확인: `redis-cli -h <host> -a <password> --no-auth-warning PING` → `PONG` 미반환이면 redis 장애 확정.
  2. Spring API health: `journalctl -u readmates-server --since "5 min ago" | jq 'select(.level=="ERROR")' | head`.
  3. AI generation은 idempotency, cap counter, job state 전부 Redis 의존이므로 Redis가 down이면 generation은 503/`REDIS_UNAVAILABLE` 또는 silent failure.
- **에스컬레이션**: Redis 복구 작업과 **동시에** §8 절차로 kill switch flip. 복원 후 다시 enable. Redis 복구는 [Read-only diagnostics](read-only-diagnostics.md)와 OCI 운영 매뉴얼 참고.
- **연관 항목**: [§8 kill switch](#8-전체-disable-kill-switch).

## <a id="pii-regression"></a> PII regression check (scripts/aigen-pii-check.sh)

CI는 모든 PR에서 `scripts/aigen-pii-check.sh`를 실행합니다. Fail 시 PR이 차단됩니다. 검사는 Redis 네 payload key의 adapter 경계·TTL·삭제, grounded hash 콘텐츠 금지, Kafka routing-metadata-only message, content-free Flyway/audit/receipt schema, low-cardinality metric label, request/response 객체를 문자열로 남기지 않는 log/exception 규칙을 검증합니다.

### 실패 진단

1. 로컬 재현:
   ```bash
   bash scripts/aigen-pii-check.sh
   ```
2. 출력의 실패 메시지는 어느 invariant가 (1-10) 깨졌는지와 file:line을 가리킵니다.
3. 다음 중 하나로 대응:
   - **신규 코드가 실제 PII 누출**: 해당 라인을 제거하거나 invariant를 만족하도록 리팩터.
   - **신규 코드가 정당** (예: invariant 자체를 설명하는 주석/문서): script 안에 명시적인 allowlist를 추가하고 왜 안전한지 주석으로 정당화합니다. 무근거 allowlist 추가는 review에서 reject.

### 새 invariant 추가

새 PII 누출 surface가 발견되면:

1. `scripts/aigen-pii-check.sh`에 `check6()` (또는 다음 번호)를 추가합니다. 기존 함수의 패턴(grep 또는 ripgrep으로 금지 패턴 검출 → 발견 시 exit non-zero + 명확한 메시지)을 따릅니다.
2. 이 runbook 섹션에 새 invariant의 의도와 디버깅 힌트를 한 단락 추가합니다.
3. PR description에 spec 어느 부분이 새 invariant의 근거인지 명시합니다.

스크립트 자체 수정은 task 6.4 영역이므로 변경 시 review에 task 6.4 owner를 함께 reviewer로 추가합니다.
