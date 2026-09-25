# Architecture Evidence

ReadMates가 단순 CRUD 앱이 아니라 운영형 멀티 클럽 제품인 이유를 한 장으로 보여 줍니다. 상세 기준은 `docs/development/architecture.md`입니다.

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

| 주장 | 왜 중요한가 | 근거 |
| --- | --- | --- |
| 브라우저 요청은 same-origin BFF를 거친다 | 보안 정책, trusted header, OAuth proxy, cookie 처리를 edge 경계 한 곳에 모읍니다. | `docs/development/adr/0001-cloudflare-pages-functions-bff.md`, `docs/case-studies/01-bff-security-and-secret-rotation.md` |
| 클럽 context는 slug나 등록된 host로 정해진다 | 역할, cache, 공개 URL, OAuth 복귀가 클럽 단위로 유지돼야 합니다. | `docs/case-studies/03-multi-club-domain-platform.md`, `docs/deploy/multi-club-domains.md` |
| 서버 feature slice는 clean architecture를 따른다 | controller는 HTTP만 해석하고, application service가 권한과 조율을, persistence는 port/adapter 뒤에서 처리합니다. | `docs/development/architecture.md`, `ServerArchitectureBoundaryTest` |
| 알림은 transactional outbox를 쓴다 | mutation이 SMTP/in-app 발송을 기다리지 않고, 재시도와 감사 상태가 명시적입니다. | `docs/case-studies/02-notification-pipeline-with-outbox.md` |
| AI 생성은 feature flag와 감사 경계 안에 있다 | 대본 처리, provider 호출, 비용 한도, kill switch, PII 정책이 운영 경계입니다. | `docs/case-studies/04-pii-safe-ai-session-generation.md`, `docs/operations/runbooks/ai-session-generation.md`, `scripts/aigen-pii-check.sh` |
| 피드백 문서 템플릿은 버전으로 관리된다 | v1 문서를 깨지 않고 v2 선택 섹션을 더합니다. parser가 두 마커를 모두 읽고, 선택 섹션은 있을 때만 검증·표시합니다. | `docs/development/adr/0072-feedback-document-template-v2.md`, `FeedbackDocumentParser` |
| Admin은 route catalog 한 곳에서 관리된다 | `/admin`은 9개 lazy-split 라우트로 나뉘고, 좌측 nav·상단 status strip·권한 매트릭스가 같은 catalog를 봅니다. | `front/features/platform-admin/model/admin-route-catalog.ts`, `front/src/app/routes/admin.tsx` |
| 공개 릴리즈 안전은 스크립트로 확인한다 | 공개 후보를 빌드하고 scan한 뒤에 릴리즈를 판단합니다. | `scripts/README.md`, `docs/deploy/security-public-repo.md` |

## Request Flow

1. 브라우저가 same-origin SPA나 `/api/bff/**`를 요청합니다.
2. Pages Functions가 신뢰할 수 없는 내부 header를 지우고 trusted BFF header를 붙입니다.
3. Spring이 BFF secret, session cookie, membership, role, 공개 범위를 검증합니다.
4. MySQL/Flyway가 source of truth로 남습니다.
5. Redis와 Kafka는 optional 보조 계층입니다. 대본이나 membership의 영속 저장소가 되지 않습니다.

## What This Document Does Not Replace

- API와 역할 상세: `docs/development/architecture.md`
- 로컬 실행과 점검: `docs/development/README.md`
- 릴리즈 안전 상세: `scripts/README.md`
- 배포 runbook: `docs/deploy/README.md`
