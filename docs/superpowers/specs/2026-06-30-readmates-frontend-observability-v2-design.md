# ReadMates Frontend Observability v2 Design

작성일: 2026-06-30
상태: APPROVED DESIGN SPEC
대상 표면: frontend runtime observability, BFF telemetry intake, Spring metrics, Grafana/SLO/runbook docs

## 1. 배경

ReadMates는 production observability v1에서 Prometheus, Grafana, Alertmanager, 운영 runbook을 OCI compose runtime에 연결하는 방향을 확정했다. 그 결과 Spring API, notification, Redis, AI generation, JVM, DB pool 같은 backend 중심 신호는 운영자가 Prometheus/Grafana에서 볼 수 있는 기반이 생겼다.

하지만 v1 설계와 현재 observability 문서는 다음 신호를 후속으로 남긴다.

- frontend runtime errors
- route load time RUM
- frontend route SLO
- public/browser-side API failure pattern
- external uptime or blackbox monitoring

이번 v2는 그중 **frontend runtime observability**만 다룬다. 목표는 서버가 정상이어도 사용자가 흰 화면, React route error, JS runtime error, 느린 route transition, 반복 API 실패를 겪는 상황을 운영자가 볼 수 있게 만드는 것이다.

## 2. 목표

성공 기준:

- Browser SPA가 route load, runtime error, API failure summary를 low-cardinality event로 수집한다.
- 수집은 same-origin BFF endpoint를 통해 Spring으로 전달한다.
- BFF와 Spring은 raw URL, query string, stack trace, member data, token, private body를 저장하거나 metric label로 쓰지 않는다.
- Spring은 frontend event를 Micrometer metric으로 기록한다.
- Grafana dashboard와 observability docs가 frontend 신호를 설명한다.
- SLO 문서는 frontend route load와 runtime error ratio를 "측정 시작" 상태로 기록한다.
- 수집 실패는 사용자 흐름을 막지 않는다.
- public release candidate에 event artifact, private data, local absolute path, token-shaped value가 포함되지 않는다.

## 3. Non-goals

- Sentry, Cloudflare Web Analytics, browser RUM SaaS, OpenTelemetry collector, Loki, ELK, OCI Logging을 이번 범위에서 도입하지 않는다.
- 외부 blackbox uptime check, separate observability VM, managed synthetic monitoring은 이번 범위에 포함하지 않는다.
- 새 운영 화면을 ReadMates SPA 안에 만들지 않는다.
- frontend event 원문 ledger 또는 DB persistence를 만들지 않는다.
- raw stack trace, source map upload, full error message storage를 구현하지 않는다.
- club slug 원문, member email/name, membership id, user id, request body, response body, feedback document text를 보내지 않는다.
- browser bundle에 secret, deploy identifier, private domain, provider key, `VITE_*` server secret을 추가하지 않는다.
- frontend route, auth, OAuth, BFF trust boundary, server API product contract, DB schema를 제품 기능 관점에서 바꾸지 않는다.

## 4. 선택한 접근

선택한 접근은 **ReadMates-owned lightweight telemetry intake**다.

검토한 대안:

1. **SaaS error tracking/RUM 도입**
   - 장점: source map, session grouping, alerting이 빠르게 준비된다.
   - 단점: 비용, 데이터 반출, 개인정보 정책, source map 관리, public repo 문서화 범위가 커진다.

2. **Cloudflare Web Analytics 중심**
   - 장점: browser-facing edge와 잘 맞고 운영 부담이 작다.
   - 단점: React runtime error, app route pattern, API failure taxonomy를 ReadMates 도메인에 맞춰 통제하기 어렵다.

3. **자체 same-origin frontend telemetry intake** - 추천
   - 장점: 기존 BFF/Spring/Micrometer/Grafana 체계와 맞고, public-safety와 cardinality 정책을 코드로 강제할 수 있다.
   - 단점: SaaS 수준의 stack trace grouping이나 session replay는 제공하지 않는다.

이번 v2는 3번을 선택한다. 장기적으로 Sentry/RUM SaaS가 필요해져도 이번 event taxonomy와 개인정보 원칙은 그대로 이전 가능한 boundary가 된다.

## 5. Architecture

Runtime flow:

```text
Browser SPA
  -> front/shared/observability runtime collector
  -> same-origin /api/bff/observability/frontend-events
  -> Spring /api/observability/frontend-events
  -> Micrometer counters/timers
  -> Prometheus scrape
  -> Grafana panels and SLO docs
```

Responsibilities:

- `front/shared/observability` owns event contracts, route pattern normalization, queueing, sampling, and transport.
- `front/src/app` owns app-level wiring: route transition timing, route error boundary capture, API failure hook registration.
- `front/functions` owns same-origin BFF intake and upstream forwarding with existing trusted-header policy.
- `server/observability` owns request validation, event classification, Micrometer metric recording, and safe drop counters.
- `docs/operations/observability` explains metrics, panels, SLO interpretation, and triage.

The collector is not a product feature dependency. UI components must not call it directly. Route/app/shared-api boundaries add events at existing composition points.

## 6. Frontend Components

Candidate files:

```text
front/shared/observability/
  frontend-observability-contracts.ts
  route-patterns.ts
  frontend-observability-client.ts
  frontend-observability-client.test.ts

front/src/app/
  route-observability.ts
  route-observability.test.ts
  route-error.tsx
  router.tsx
```

### 6.1 Event Contracts

`frontend-observability-contracts.ts` defines public browser-to-BFF types. It should use literal unions for event type, navigation type, status class, severity, and API group. Event fields must be optional only when the event type does not use them.

### 6.2 Route Pattern Normalization

`route-patterns.ts` maps runtime locations to allowlisted route patterns.

Examples:

| Runtime path | Pattern sent |
| --- | --- |
| `/clubs/reading-sai/app/session/current` | `/clubs/:slug/app/session/current` |
| `/clubs/reading-sai/app/host/sessions/abc/edit` | `/clubs/:slug/app/host/sessions/:sessionId/edit` |
| `/admin/clubs/abc` | `/admin/clubs/:clubId` |
| unrecognized path | `unknown` |

The browser must not send raw path, raw slug, raw UUID, query string, or hash.

### 6.3 Transport

The client batches events and flushes asynchronously.

Preferred transport:

1. `navigator.sendBeacon` with JSON blob when available.
2. `fetch` with `keepalive: true` and a short timeout fallback.

Failure behavior:

- no user-visible error,
- no retry storm,
- bounded queue,
- testable drop reason for local unit tests.

### 6.4 Capture Points

Route load:

- observe navigation start and route settled points from app/router integration;
- emit `ROUTE_LOAD` with route pattern, duration, navigation type, and result.

Runtime error:

- emit from route error boundary and unhandled rejection listener;
- send error kind, normalized error code, severity, route pattern, and hash prefix only.

API failure:

- hook at `shared/api` error conversion or API client primitive;
- emit status class, safe API group, public-safe error code, and current route pattern.

## 7. BFF Endpoint

Candidate file:

```text
front/functions/api/bff/observability/frontend-events.ts
```

Responsibilities:

- allow only `POST`;
- require `Content-Type: application/json`;
- reject or drop bodies over the configured small limit;
- parse JSON safely;
- forward only validated body to Spring;
- attach BFF secret using existing environment policy;
- strip browser-supplied internal `x-readmates-*` headers;
- remove internal response headers from upstream responses;
- return public-safe response shape.

The endpoint should keep the same same-origin mutation and trusted-header posture as other BFF routes. Browser-provided club context headers are not trusted. No secret is exposed to the browser.

## 8. Server Slice

Candidate package:

```text
server/src/main/kotlin/com/readmates/observability/
  adapter/in/web/FrontendObservabilityController.kt
  application/model/FrontendObservabilityEvent.kt
  application/port/in/RecordFrontendObservabilityUseCase.kt
  application/service/FrontendObservabilityService.kt
```

The controller parses and validates request DTOs, then calls a use case. The application service owns metric classification. This keeps the server guide boundary: HTTP parsing in adapter, business/ops classification in application service.

Authentication is not required because public routes also need route load/error observability. BFF secret verification remains required.

The server does not write event rows to MySQL in v2. Metrics are the durable operational signal.

## 9. Data Contract

Request shape:

```json
{
  "events": [
    {
      "type": "ROUTE_LOAD",
      "routePattern": "/clubs/:slug/app/session/current",
      "durationMs": 420,
      "navigationType": "PUSH",
      "result": "success"
    },
    {
      "type": "RUNTIME_ERROR",
      "routePattern": "/admin",
      "errorKind": "render",
      "errorCode": "REACT_ROUTE_ERROR",
      "messageHash": "a1b2c3d4",
      "severity": "error"
    },
    {
      "type": "API_FAILURE",
      "routePattern": "/clubs/:slug/app",
      "apiGroup": "host-session",
      "statusClass": "5xx",
      "errorCode": "RESOURCE_UNAVAILABLE"
    }
  ]
}
```

Batch constraints:

- maximum event count: 20
- maximum body size: implementation-defined small JSON limit
- unknown fields ignored or rejected consistently
- invalid events dropped without affecting valid events in the same batch if implementation complexity stays reasonable

Allowed event families:

| Type | Required fields | Notes |
| --- | --- | --- |
| `ROUTE_LOAD` | `routePattern`, `durationMs`, `navigationType`, `result` | duration is clamped to a safe range |
| `RUNTIME_ERROR` | `routePattern`, `errorKind`, `errorCode`, `severity` | `messageHash` is optional and never raw text |
| `API_FAILURE` | `routePattern`, `apiGroup`, `statusClass`, `errorCode` | no URL, no response body |

## 10. Metrics

Metric names:

```text
readmates.frontend.route_load.seconds{route_pattern,result,navigation_type}
readmates.frontend.runtime_errors{route_pattern,error_kind,error_code,severity}
readmates.frontend.api_failures{route_pattern,api_group,status_class,error_code}
readmates.frontend.observability.dropped{reason}
```

Metric rules:

- labels are allowlisted low-cardinality values;
- `route_pattern` uses normalized patterns only;
- error code uses frontend-safe public code vocabulary;
- no label contains raw slug, UUID, email, user id, membership id, token, stack frame, SQL detail, provider raw error, or body text;
- drop reasons are low-cardinality values such as `invalid_type`, `invalid_route_pattern`, `oversized_batch`, `unsupported_value`, `rate_limited`.

## 11. SLO And Dashboard

Add documentation for measurement-start SLOs:

```text
frontend_route_load_p95:
  7-day rolling p95 < 1500ms

frontend_runtime_error_ratio:
  7-day runtime error count / route load count < 1%
```

These are not hard release gates in v2. They are operational baselines. The first few production windows should establish normal ReadMates route load/error shape before alert thresholds become paging rules.

Dashboard panels:

- route load p95 by route pattern;
- runtime error count by route pattern and error code;
- API failure count by API group and status class;
- dropped telemetry count by reason.

Runbook triage:

- if frontend error increases while server 5xx is normal, inspect recent frontend route or dependency changes first;
- if API failure rises with server 5xx, inspect backend/API health first;
- if route load p95 rises without API failures, inspect bundle, route lazy loading, CDN/cache, and browser console evidence;
- if dropped telemetry rises, inspect collector/BFF/server validation changes before trusting absence of frontend incidents.

## 12. Error Handling

Frontend:

- telemetry failure never blocks route transitions, rendering, login, host actions, or API calls;
- failed sends are dropped quietly;
- collector avoids repeated console noise;
- offline and unsupported browsers are safe no-ops.

BFF:

- invalid method, content type, size, or JSON returns public-safe failure or drop response;
- upstream failure does not leak Spring host, secret, stack trace, or internal header;
- response shape is safe for browser handling.

Server:

- invalid events increase dropped metric only;
- valid events in a valid batch record metrics;
- metric recording errors do not fail product requests because telemetry intake is a side path;
- rate-limited telemetry is dropped rather than blocking users.

## 13. Public Safety

Hard prohibitions:

- raw URL or query string;
- club slug value;
- UUID values;
- email, display name, account name;
- session cookie, OAuth code, BFF secret;
- request/response body;
- stack trace;
- provider raw error;
- local absolute path;
- VM IP, private domain, OCID, deployment state.

Allowed values:

- route patterns with placeholders;
- status class (`4xx`, `5xx`, etc.);
- public-safe frontend error code;
- hash prefix of a message, when generated client-side and not reversible in practice;
- enum-style API group names.

## 14. Testing

Frontend checks:

```bash
pnpm --dir front test -- observability
pnpm --dir front test
pnpm --dir front build
```

Frontend coverage:

- path normalization removes slug, UUID, query, hash;
- sendBeacon success and failure;
- fetch fallback;
- queue bounds and drop behavior;
- route error boundary still renders existing fallback;
- API failure event contains only safe code/status group.

BFF/Functions coverage:

- invalid method/content-type/body-size/JSON handling;
- trusted header forwarding with BFF secret;
- browser-supplied internal headers stripped;
- upstream internal response headers removed.

Server checks:

```bash
./server/gradlew -p server clean test
./server/gradlew -p server architectureTest
```

Server coverage:

- controller-to-use-case boundary;
- valid metrics emitted with safe labels;
- invalid event increments dropped metric only;
- raw URL/message/stack/email/token-shaped values cannot become labels;
- observability slice respects ArchUnit boundaries.

Operations/public release checks:

```bash
git diff --check -- front server ops docs CHANGELOG.md
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

`pnpm --dir front test:e2e` is not mandatory for the base implementation because telemetry does not add a user-facing flow. Add E2E if implementation changes route behavior, auth flow, API client semantics, or BFF behavior outside the telemetry endpoint.

## 15. Implementation Notes

Implementation should proceed in narrow slices:

1. frontend route pattern and client contract tests;
2. BFF endpoint validation and forwarding tests;
3. server intake and Micrometer metric tests;
4. app-level wiring for route load, runtime error, and API failure;
5. dashboard/docs/SLO updates;
6. release-readiness note and public-safety verification.

If any slice reveals a need for user/session identity, reject it for v2. The design intentionally favors aggregate operational visibility over per-user diagnostics.

## 16. Open Questions Resolved

- **Should telemetry require login?** No. Public route errors and route load matter too. BFF secret remains the trust boundary.
- **Should event rows be stored in MySQL?** No for v2. Metrics are enough for production visibility and keep privacy risk lower.
- **Should source maps be uploaded?** No. Source map/error grouping is an external error tracking follow-up.
- **Should frontend SLO page immediately alert?** No. The first release measures baselines; alerting can follow after evidence.
- **Should E2E be required?** Not by default. Add it only if route/auth/API semantics change beyond telemetry.

## 17. Residual Risk

- Same-origin telemetry still depends on the SPA being able to execute enough JavaScript to send an event. Total script load failure may remain invisible without external synthetic monitoring.
- Metrics-only storage does not provide detailed per-event forensic debugging.
- Hash-based message grouping can show repeated classes but cannot explain the exact error without local reproduction or separate error tracking.
- Route patterns must stay maintained as routes evolve; tests should fail when new route families are added without classification.
- Alert thresholds should wait for production baseline data.

These risks are acceptable for v2 because the immediate gap is aggregate frontend visibility, not full session replay or SaaS-grade error forensics.
