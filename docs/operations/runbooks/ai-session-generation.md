# AI 세션 생성 운영 Runbook

> Phase 0-7 (in-app AI session generation) — 호스트 세션 편집기 안에서 LLM이 생성한 회차 기록의 운영 절차를 모은 문서입니다. 변경 배경은 CHANGELOG `Phase 0` (도메인 계약), `Phase 1` (백엔드 서비스/Redis/Audit), `Phase 2` (Kafka + E2E + 신뢰 경계 정합), `Phase 3` (프런트 모드), `Phase 4-5` (OpenAI/Gemini adapter), `Phase 6` (운영 통합) 항목과 spec [`docs/superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md`](../../superpowers/specs/2026-05-16-readmates-in-app-ai-session-generation-design.md)을 참조합니다.

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

## 1. 새 모델 allowlist 추가/제거

새 모델 ID를 enable하려면 (a) pricing 항목 추가, (b) provider 활성, (c) frontend 노출까지 함께 맞춰야 합니다.

1. `server/src/main/resources/application.yml`의 `readmates.aigen.pricing` map에 단가 항목을 추가합니다. 예 (`gpt-4-1-mini`):
   ```yaml
   readmates:
     aigen:
       enabled-providers: [CLAUDE, OPENAI, GEMINI]
       pricing:
         gpt-4-1-mini:
           input-per-mtok-usd: 0.40
           cached-input-per-mtok-usd: 0.10
           output-per-mtok-usd: 1.60
   ```
   - Provider 접두사 매칭은 `YamlModelCatalog.providerFromName` (`claude-*`, `gpt-*`/`o\d+`, `gemini-*`). `openai-*` 접두사는 현재 inert이므로 `gpt-*`로 키를 통일합니다 (Phase 4 known follow-up).
2. 모델 제거는 같은 map에서 key를 삭제하고, `enabled-providers`에서 해당 provider 전체를 빼면 해당 provider 모델 전부가 한꺼번에 차단됩니다.
3. Frontend `front/features/host/aigen/api/aigen-model-options.ts`의 하드코딩 allowlist를 함께 갱신합니다 (catalog endpoint로 교체될 때까지 임시).
4. PR merge 후 deploy (server → frontend 순). Deploy 절차는 [post-deploy-watch.md](post-deploy-watch.md).
5. Smoke: provider별 manual script 실행 — `scripts/aigen-smoke-claude.sh`, `scripts/aigen-smoke-openai.sh`, `scripts/aigen-smoke-gemini.sh`. 라이브 API key가 환경변수에 있는 노드에서만 실행합니다.

Rollback: `application.yml`의 직전 commit으로 되돌리고 재배포.

## 2. 클럽 cost cap 임시 상향 (Redis 키 수동 reset)

`readmates.aigen.caps.club-cost-monthly-usd` (기본 $20) 초과로 호스트가 503/`COST_CAP_EXCEEDED`를 받을 때 임시로 풀어야 하는 경우의 절차입니다.

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

Backout: 원래 값을 다시 `SET`. Cap 자체를 영구 상향하려면 `application.yml`의 `caps.club-cost-monthly-usd`를 변경한 PR을 통합 검토합니다.

## 3. 호스트 일일 cap 임시 해제

`readmates.aigen.caps.host-daily-jobs` (기본 30회) 초과로 호스트가 `HOST_DAILY_CAP_EXCEEDED`를 받을 때의 절차입니다.

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

1. 호스트에게 `jobId` 또는 `sessionId`, 생성 시각을 받습니다. **본문(transcript) 재요청은 호스트에게 직접** — audit log와 Redis에는 transcript 본문이 저장되지 않습니다 (PII 보호 invariant).
2. Audit log 조회:
   ```sql
   SELECT id, job_id, session_id, club_id, host_user_id, kind, item, provider, model, status,
          error_code, input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd,
          latency_ms, created_at
   FROM ai_generation_audit_log
   WHERE session_id = '<sessionId>'
   ORDER BY created_at DESC;
   ```
3. Redis에 같은 jobId의 결과 snapshot이 살아 있으면 (`aigen:job:<jobId>` 6h TTL) 운영자가 PREVIEW 상태 결과를 확인할 수 있습니다:
   ```bash
   redis-cli -h <host> -a <password> --no-auth-warning HGETALL "aigen:job:<jobId>"
   ```
4. 호스트가 동일 transcript로 retro 검증을 원하면 host editor에서 직접 재생성 (`✨ 재생성` 버튼 또는 새 generation 시도). 운영자가 transcript를 받아 stash하지 않습니다.
5. Hallucination 패턴이 반복되면 spec §9.3의 5개 hallucination 룰 강화를 prompt builder 작업으로 follow-up.

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
   - `AiGenerationController` bean이 `@ConditionalOnProperty`로 등록되지 않아 `/api/host/sessions/{id}/ai-generate/**` 경로는 404/Spring 기본 응답을 반환합니다 (controller가 없으므로 405도 아님; 실 동작은 `AiGenerationControllerTest` kill switch case 확인).
   - Frontend AI 모드 토글은 여전히 보이지만 generation 시도 시 위 응답을 받아 `ERROR` 상태로 전환됩니다. 토글 자체를 숨기려면 frontend feature flag 변경이 별도로 필요.
   - Kafka consumer (`AiGenerationJobConsumer`)도 같은 flag로 로드되지 않으므로 in-flight job은 다음 부팅에 재처리되지 않습니다 (PR 메시지 본문은 transcript 없이 metadata만이라 손실 영향 제한).
3. 운영 chat과 incident ticket에 kill switch on/off 시간을 남깁니다.
4. 복원: flag를 `true`로 되돌리고 deploy. 부팅 후 첫 generation 요청을 smoke 스크립트로 1건 검증.

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

- **조건**: `readmates_aigen_queue_depth > 50` 5m 지속.
- **현재 상태**: 이 gauge는 task 6.1 시점에 placeholder (항상 0)이며, Kafka consumer lag wiring이 들어올 때까지 alert가 실제 발화하지 않습니다. Pre-rollout 단계에서는 noisy alert로 간주하지 마십시오.
- **즉시 triage (wiring 후)**: Kafka consumer group lag 확인 (`kafka-consumer-groups.sh --describe`), worker pool 메모리/CPU 점검, provider latency 동시 burst 여부 확인.
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

CI는 모든 PR에서 `scripts/aigen-pii-check.sh`를 실행합니다. Fail 시 PR이 차단됩니다. 4개 invariant는 spec §11.5의 PII 보호 약속을 코드 레벨로 검증합니다 (transcript 본문이 Kafka payload/Redis key/audit-log/metric label에 누출되지 않음).

### 실패 진단

1. 로컬 재현:
   ```bash
   bash scripts/aigen-pii-check.sh
   ```
2. 출력의 실패 메시지는 어느 invariant가 (1-4) 깨졌는지와 file:line을 가리킵니다.
3. 다음 중 하나로 대응:
   - **신규 코드가 실제 PII 누출**: 해당 라인을 제거하거나 invariant를 만족하도록 리팩터.
   - **신규 코드가 정당** (예: invariant 자체를 설명하는 주석/문서): script 안에 명시적인 allowlist를 추가하고 왜 안전한지 주석으로 정당화합니다. 무근거 allowlist 추가는 review에서 reject.

### 새 invariant 추가

새 PII 누출 surface가 발견되면:

1. `scripts/aigen-pii-check.sh`에 `check5()` (또는 다음 번호)를 추가합니다. 기존 4개 함수의 패턴(grep 또는 ripgrep으로 금지 패턴 검출 → 발견 시 exit non-zero + 명확한 메시지)을 따릅니다.
2. 이 runbook 섹션에 새 invariant의 의도와 디버깅 힌트를 한 단락 추가합니다.
3. PR description에 spec 어느 부분이 새 invariant의 근거인지 명시합니다.

스크립트 자체 수정은 task 6.4 영역이므로 변경 시 review에 task 6.4 owner를 함께 reviewer로 추가합니다.
