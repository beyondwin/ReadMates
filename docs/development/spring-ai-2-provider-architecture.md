# Spring AI 2 Provider And Trace Architecture

이 문서는 ReadMates의 현재 AI provider 호출, 비용 정산, 복구, privacy, 분산 추적 구조의 living source of truth입니다. 승인 설계 기록은 `docs/superpowers/`에 보존하지만 현재 사실은 코드, 설정, migration, 테스트와 이 문서를 기준으로 판단합니다.

## Before / After

전환 전에는 provider마다 generator, port, client, 직접 SDK 경로가 따로 있었고 legacy/grounded pipeline 선택이 남아 있었습니다. 지금은 grounded 경로 하나만 있습니다.

현재는 application이 모든 호출 정책을 소유하고 Spring AI는 정확히 한 번의 outbound transport/structured-output 변환만 담당합니다.

```mermaid
sequenceDiagram
    participant API as Spring MVC API
    participant R as Redis job/admission
    participant K as Kafka
    participant W as AiGenerationWorker
    participant E as Grounded executor/policy
    participant G as ProviderCallGate
    participant C as GroundedProviderCallCoordinator
    participant L as Redis atomic ledger
    participant S as Spring AI adapter
    participant P as Provider HTTP
    participant V as Validation/evidence
    participant A as MySQL audit
    API->>R: preflight and job payload (TTL 6h)
    API->>K: metadata-only job + W3C context
    K->>W: observed consumer span
    W->>E: grounded-only generation
    E->>G: circuit and semaphore permit
    G-->>E: permit or fail-fast rejection
    E->>C: one physical call command
    C->>L: atomically reserve slot + worst-case cost + IN_FLIGHT
    L-->>C: attempt ordinal or fail closed
    C->>S: one ChatClient call
    S->>P: exactly one non-streaming HTTP request
    P-->>S: structured response / safe failure
    S-->>C: domain output + four-channel usage
    C->>L: ACTUAL or ESTIMATED_UNKNOWN reconciliation
    C->>A: content-free attempt audit + trace ID
    C-->>E: outcome
    E->>V: schema/grounding validation; bounded next decision
    V->>R: validated result/evidence only
```

## Package Boundary And Bean Construction

- Application/domain packages know only `WholeTranscriptGroundedGenerator`, `ProviderCallGate`, `ProviderCallReservationPort`, `AiProviderObservationPort`, `AiTraceContextPort` and ReadMates models.
- `GroundedProviderCallPolicy` owns the pure maximum-three-call state machine. `GroundedProviderCallCoordinator` owns permit -> Redis reservation -> one transport -> reconciliation -> audit.
- `ResilientProviderCallGate` owns a provider-keyed Resilience4j circuit breaker and fail-fast semaphore; rejection reserves neither a slot nor cost.
- `RedisProviderCallReservationAdapter` and `ProviderCallReservationRedisScripts` own the single Lua reservation/reconciliation/recovery boundary.
- `AiGenerationSpringAiConfig` is loaded only for `readmates.aigen.enabled=true` and non-mock execution. It constructs explicit provider `ChatModel` instances and a `Map<Provider, ChatClient>`; Spring's default single-model selection stays disabled.
- `SpringAiWholeTranscriptGroundedGenerator`, `SpringAiProviderOptionsFactory`, `GroundedStructuredOutputConverter`, `SpringAiUsageMapper`, and `SpringAiErrorMapper` are the only provider execution boundary. `validateSchema()` and Spring AI advisors that can retry are not used.
- Disabled-by-default startup needs no provider key. When a provider is enabled, its allowlisted capability and key are mandatory; Google additionally requires the paid-tier retention confirmation flag.

Spring AI module version은 `org.springframework.ai:spring-ai-bom:2.0.0` 하나로 관리합니다(`server/build.gradle.kts`). Tracing은 `spring-boot-starter-opentelemetry`를 씁니다. OpenAI, Anthropic, Google SDK는 Spring AI model module의 전이 의존성으로만 존재하고, ReadMates는 SDK를 직접 선언하거나 호출하지 않습니다.

## Removed Boundary Mapping

| Removed type/path | Current replacement or reason |
| --- | --- |
| `ClaudeApiClient`, `OpenAiApiClient`, `GeminiApiClient` | Explicit Spring AI `ChatModel` beans in `AiGenerationSpringAiConfig` |
| `ClaudeApiPort`, `OpenAiApiPort`, `GeminiApiPort` | Spring AI `ChatModel` transport behind `ChatClient` |
| `ClaudeWholeTranscriptGroundedGenerator`, `OpenAiWholeTranscriptGroundedGenerator`, `GeminiWholeTranscriptGroundedGenerator` | One `SpringAiWholeTranscriptGroundedGenerator` configured per provider |
| `ClaudeContentGenerator`, `OpenAiContentGenerator`, `GeminiContentGenerator` | Deleted; legacy generation is not a fallback |
| `ClaudeContentRegenerator`, `OpenAiContentRegenerator`, `GeminiContentRegenerator` | Deleted; grounded section regeneration uses the shared coordinator/policy |
| `SessionContentGenerator`, `SessionContentRegenerator` | Deleted application ports; grounded-only `WholeTranscriptGroundedGenerator` remains |
| `LlmErrorMapper`, `LlmGenerationException` | `SpringAiErrorMapper` and content-safe `ProviderCallException` |
| `LlmPromptBuilder`, `SessionImportSchemaResource` | Grounded renderer, versioned `GroundedGenerationSchemaResource`, and converter |
| Legacy pipeline enum, record field and environment selector | Deleted; no runtime selector or dual execution path |
| SDK retry contract tests and direct-client live tests | Provider mock-HTTP Spring AI contract tests with exact request counts |

`GeminiSchemaCompatAdapter` remains only to reduce the shared schema to Google's supported subset. `DefaultGroundedRequestRenderer`, `GroundedDraftJsonCodec`, validation, evidence projection, Redis payload TTL, commit recovery, provider allowlist and kill switch remain application-owned.

## Provider Contract Matrix

| Provider/model | Request options | Structured output / usage | Official retention source (checked 2026-07-16) | Runtime/account verification status |
| --- | --- | --- | --- | --- |
| OpenAI `gpt-5.4-mini` | non-streaming, `maxCompletionTokens`, `store=false`, model allowlist, SDK `maxRetries=0` | shared versioned JSON schema; generic usage mapped to four channels | [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data): abuse-monitoring logs default to at most 30 days; ZDR/Modified Abuse Monitoring require separate eligibility/approval; `store=false` is not ZDR | Request option contract verified; ReadMates organization ZDR/MAM status **UNCONFIRMED**. Provider is off by default and rollout remains blocked by operator retention review. |
| Anthropic `claude-sonnet-4-6` | non-streaming, `maxTokens`, SDK `maxRetries=0`, `SYSTEM_ONLY` prompt cache | `$defs` are inlined for native output schema; native cache creation/read fields map independently | [Anthropic API retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data): API inputs/outputs are normally deleted from the backend within 30 days, with ZDR agreement, policy and legal exceptions | Native schema/cache contract verified; ReadMates organization ZDR/exception status **UNCONFIRMED**. Provider is off by default and rollout remains blocked by operator retention review. |
| Google `gemini-3-flash-preview` | non-streaming JSON, `thinkingBudget=0`, `includeThoughts=false`, search/tool invocations off, transport attempts 1, Spring retry 0 | Google-compatible schema and extended usage metadata; incomplete breakdown fails closed | [Gemini API terms](https://ai.google.dev/gemini-api/terms): paid services do not use prompts/responses for product improvement but may log them for an unspecified limited period for abuse prevention; an active billing account defines paid access | No-thinking/request contract verified; production project paid-tier status **UNCONFIRMED**. `sync-config` defaults confirmation to `false`, and enabling Gemini fails startup until an operator sets it `true`. The request header is best effort only. |

Model names, capabilities, prices and provider terms can drift. The source date records the official policy snapshot only; request/model contracts are verified separately by mock-wire tests, and no source check proves a ReadMates account setting. Live contract calls remain opt-in.

## Physical Calls, Retry, Fallback And Repair

The invariant for every possible network request is:

```text
permit -> atomic Redis reservation -> exactly one HTTP request -> ACTUAL or ESTIMATED_UNKNOWN
```

The gate, expired admission, changed job state, Redis failure, model/config rejection, or proven pre-transport failure consumes zero physical-call slots and zero cost. Once bytes may have been accepted, timeout/reset/response loss/worker crash never releases uncertain cost.

The application state machine counts primary, same-provider retry, cross-provider fallback, schema correction, grounding section repair and user-triggered regeneration in the same maximum of three physical calls. Schema correction and section repair are each single-use; correction/repair is not recursively retried. Transient and rate-limit delays are bounded by configured backoff and `Retry-After`. Spring AI retry is one attempt, OpenAI/Anthropic SDK retry is zero, and Google transport attempts is one. No provider-specific automatic fallback exists.

## Redis Reservation, Cost And Crash Recovery

| Key | Shape / lifetime |
| --- | --- |
| `aigen:job:<jobId>` | content-free job hash, `llmCallCount`, club binding; 6h |
| `aigen:job:<jobId>:provider-attempts` | per-attempt field prefix with ordinal/provider/model/mode/state/reserved cost/basis/safe code/times; 6h |
| `aigen:club:<clubId>:provider_admission` | owner token; 5m and renewed by reservation |
| `aigen:club:<clubId>:monthly_cost_usd` | reserved/reconciled USD counter; 31d |
| `aigen:job:<jobId>:{transcript,turns,result,evidence}` | four permitted pre-commit content payloads; 6h, immediate cleanup attempt on commit/cancel, TTL backstop |

One Lua reservation checks the job/status/club binding, live admission owner, three-call cap, monthly cap and single-use modes; it then increments `llmCallCount`, reserves worst-case USD and writes `IN_FLIGHT`. This is atomic only for the current single-node Redis topology. Redis Cluster is unsupported because the keys are not guaranteed to share a hash slot.

Worst-case cost prices estimated input at the higher of normal/cache-write input rates when cache write is possible and reserves full configured output. Reconciliation changes the reservation to `ACTUAL` only when complete usage is available. Unknown or incomplete usage keeps the reserved amount with `ESTIMATED_UNKNOWN`. A proven pre-transport outcome atomically releases slot and reserved cost and records `NONE`; an uncertain transport outcome may not.

On Kafka redelivery, a still-live `IN_FLIGHT` attempt is not sent again. After the stale cutoff it becomes `UNKNOWN`/`ESTIMATED_UNKNOWN`, retains its slot/cost, and only a new attempt ID may use a remaining slot. Commit receipt recovery remains the MySQL/Redis cross-store source of truth.

## Token And Audit Contracts

Internal `TokenUsage` has four independent channels: `nonCachedInputTokens`, `cacheWriteInputTokens`, `cacheReadInputTokens`, `outputTokens`. Cost and metrics price them separately. The public REST DTO remains exactly `input`, `cachedInput`, `output`; public input is non-cached plus cache-write, and public cached input is cache-read.

Flyway V38 additively extends `ai_generation_audit_log` with nullable `trace_id`, nullable `provider_attempt`, nullable `provider_call_mode`, non-null `cost_basis` defaulting to `NONE`, and non-null `cache_write_input_tokens` defaulting to 0. Existing session/club/user columns remain because MySQL audit identity is the established authorization/business-audit boundary. That does not authorize copying those identifiers to observability data.

## Trace And Privacy Contract

Spring MVC observations, Spring Kafka producer/consumer observations, the application provider observation and Spring AI/provider client observations use W3C trace context. `RequestIdFilter` remains a separate log lookup ID and does not replace `traceparent`.

AI observation allowlists are low-cardinality `provider`, allowlisted `model`, `callMode`, `outcome`, and safe `errorCode`; trace-only correlation may include `jobId` and attempt ordinal. Logs may include `traceId`, `spanId`, `requestId`, AI `jobId`, provider, stage and attempt. Prompt, completion, transcript, schema body, evidence, raw provider error, member/user ID, session ID, club ID/slug and baggage are forbidden in the AI trace path. HTTP observations drop raw URL high-cardinality tags. The PII scanner and observation tests enforce these boundaries.

Sampling defaults to 100% (`READMATES_TRACING_SAMPLING_PROBABILITY=1.0`). The OTLP exporter is asynchronous and bounded (`max-queue-size=2048`, `max-batch-size=512`, 5s timeout/delay). Export failure increments bounded delivery metrics and cannot fail product work. Tempo retains trace blocks for seven days. Trace data is operational metadata, not a content store.

## Tempo Topology

Local Compose exposes Prometheus, Grafana, Tempo query and OTLP HTTP only on `127.0.0.1`. Tempo receives OTLP on container ports 4317/4318, serves queries/metrics on 3200, and persists WAL/blocks in `readmates-local-tempo`.

OCI Compose attaches server, Prometheus, Grafana and Tempo to the same internal Compose network. Tempo publishes no host port; Grafana alone is loopback-bound for tunnel access. `readmates_tempo_data` persists seven-day data. Prometheus has exemplar storage enabled and scrapes Tempo internally; Grafana provisions Prometheus exemplar links and the internal Tempo datasource. Tempo is not an authentication boundary and must never receive a public port.

## Configuration Changes

Added/current controls include `READMATES_AIGEN_PROVIDER_REQUEST_TIMEOUT` (max 4m), `READMATES_AIGEN_MAX_CONCURRENT_PER_PROVIDER`, transient backoff base/max, `READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED`, four-channel per-model prices, `READMATES_AIGEN_KAFKA_MAX_POLL_INTERVAL` (default 16m), `READMATES_TRACING_SAMPLING_PROBABILITY`, and `READMATES_OTLP_TRACES_ENDPOINT`. Spring AI chat auto-selection and all content/error logging observations are disabled. The production `sync-config` path renders the Google confirmation from a repository variable with a fail-closed `false` default; `.env.example` and the bulk importer expose the same control without claiming account confirmation.

OCI `readmates-api` overrides the local OTLP default with `http://tempo:4318/v1/traces` on the shared Compose network. Tempo publishes no host port. `scripts/validate-production-ai-config.sh` pins that endpoint, the no-public-port rule, complete legacy-selector removal, and production Google confirmation wiring in CI, pre-push and the public release candidate.

The legacy pipeline mode environment control and every runtime selector were removed. Existing kill switch, provider allowlist and three provider key names remain. Key values are never documented or committed.

The 16-minute Kafka maximum poll interval covers three 4-minute provider calls, at most two bounded 30-second delays, validation/persistence margin, and JVM scheduling variance. Startup validation rejects an interval smaller than the configured worst-case processing budget.

## Verification

- CI 증거는 provider mock-HTTP contract test(정확한 요청 수), Redis/Kafka/architecture/privacy test, `scripts/aigen-pii-check.sh`, `scripts/validate-production-ai-config.sh`, `scripts/validate-tempo-config.sh`입니다.
- Live provider smoke(`scripts/aigen-smoke-*.sh`)는 provider key와 과금 호출이 필요하므로 opt-in이며 별도 승인 대상입니다.
- 테스트 profile(`server/src/test/resources/application.yml`)은 모든 Spring AI model auto-configuration을 명시적으로 끕니다.

## Residual Risks

- A provider without idempotency can bill a request whose response was lost. Unknown reconciliation and the three-call cap bound but cannot eliminate duplicate billing.
- Conservative `ESTIMATED_UNKNOWN` can close a club budget earlier than actual spend. Any adjustment is an audited operator action, never an automatic refund.
- Anthropic/Google native usage metadata, model capabilities, retention terms and prices can drift after the verification date. Incomplete breakdown fails closed and may require disabling a provider/cache until revalidated.
- 100% sampling and seven-day local Tempo storage can pressure an OCI VM. Monitor disk, Tempo readiness, received spans, exporter failures and queue drops before changing sampling/retention through review.
- Atomic reservation assumes single-node Redis. A Redis Cluster migration requires a new same-slot or transaction design before activation.
- Previous images do not understand grounded-only Redis attempts. Rollback cannot reinterpret active state safely.

## Ordered Rollback

1. Set the AI kill switch off and stop/disable the AI Kafka consumer. Do not route grounded jobs to a legacy path; none exists.
2. Wait for the six-hour AI Redis payload/attempt TTL so old and new images do not share incompatible live state. During an approved urgent incident, delete only the affected `aigen:job:<jobId>*` and bound admission keys after recording audit evidence. Never run a full Redis flush.
3. Roll back the application image to the previous known-good image. V38 is additive and remains; use forward-fix for schema changes rather than destructive migration rollback.
4. Restore only the prior image's supported configuration, verify DB/Redis/Kafka health, then re-enable consumers and AI intentionally. Tempo failure alone does not require product rollback; isolate exporter/Tempo first.
