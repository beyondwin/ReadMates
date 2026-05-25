# Architecture Evidence

이 문서는 ReadMates가 단순 CRUD 앱이 아니라 운영형 멀티클럽 제품인 이유를 한 장으로 보여줍니다. 상세 source of truth는 `docs/development/architecture.md`입니다.

## One-Page Map

```text
Browser
  -> Cloudflare Pages SPA
  -> Pages Functions BFF (/api/bff/**, OAuth proxy)
  -> Spring Boot API
  -> MySQL/Flyway source of truth
  -> optional Redis cache/rate-limit/job state
  -> optional Kafka/Redpanda notification and AI job pipeline
  -> SMTP/in-app notification side effects
```

## Evidence Table

| Product/engineering claim | Why it matters | Evidence |
| --- | --- | --- |
| Browser traffic goes through a same-origin BFF | Keeps browser-facing security policy, trusted headers, OAuth proxying, and cookie handling at the edge boundary. | `docs/development/adr/0001-cloudflare-pages-functions-bff.md`, `docs/case-studies/01-bff-security-and-secret-rotation.md` |
| Club context is scoped by slug or registered host | Multi-club operation needs role, cache, public URL, and OAuth return behavior to stay club-aware. | `docs/case-studies/03-multi-club-domain-platform.md`, `docs/deploy/multi-club-domains.md` |
| Server feature slices follow clean architecture | Controllers parse HTTP; application services own authorization/orchestration; persistence stays behind ports/adapters. | `docs/development/architecture.md`, `ServerArchitectureBoundaryTest` |
| Notifications use transactional outbox | Mutations do not block on SMTP/in-app delivery; retry and audit state are explicit. | `docs/case-studies/02-notification-pipeline-with-outbox.md` |
| AI generation is feature-gated and audited | Transcript handling, provider calls, cost guard, kill switch, and PII policy are operational boundaries. | `docs/case-studies/04-pii-safe-ai-session-generation.md`, `docs/operations/runbooks/ai-session-generation.md`, `scripts/aigen-pii-check.sh` |
| Public release safety is scripted | Public candidates are built and scanned before release assumptions are made. | `scripts/README.md`, `docs/deploy/security-public-repo.md` |
| Admin IA Foundation (2026-05-25) | `/admin` 단일 페이지를 9-라우트 lazy-split 패밀리로 분해, `admin-route-catalog` 한 곳을 SSOT로 좌측 nav · 상단 status strip · empty state · 권한 매트릭스를 일관시켰다. 후속 슬라이스가 자기 라우트를 `coming_soon → ready`로 토글하는 한 줄 변경으로 자기 자리를 채울 수 있다. | `docs/superpowers/specs/2026-05-25-readmates-admin-vnext-s1-ia-foundation-design.md`, `front/features/platform-admin/model/admin-route-catalog.ts`, `front/src/app/routes/admin.tsx` |

## Request Flow

1. Browser requests same-origin SPA or `/api/bff/**`.
2. Pages Functions strips untrusted internal headers and adds trusted BFF headers.
3. Spring validates BFF secret, session cookie, membership, role, visibility, and attendance rules.
4. MySQL/Flyway remains source of truth.
5. Redis and Kafka are optional supporting layers, never the durable source of private transcript or membership truth.

## What This Document Does Not Replace

- API and role details: `docs/development/architecture.md`
- Local setup and checks: `docs/development/README.md`
- Release safety details: `scripts/README.md`
- Deployment runbooks: `docs/deploy/README.md`
