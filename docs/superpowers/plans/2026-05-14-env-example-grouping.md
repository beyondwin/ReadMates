# .env.example Grouping & Inline Docs Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 71줄 `.env.example` 을 섹션 헤더와 한 줄 설명으로 재구성해 신규 기여자의 부트스트랩 시간을 줄인다.

**Architecture:** 값/키 변경 없음. 순서 재배열 + 주석 추가만. Spring 환경변수 매핑 규칙(`SPRING_*`)과 `READMATES_*` prefix는 그대로.

**Tech Stack:** dotenv 컨벤션, 변경 없음.

---

## 현재 상태 (line ranges)

- `.env.example:1-19` Spring API + Auth + BFF secret
- `.env.example:21-26` local MySQL
- `.env.example:28-30` OCI Compose
- `.env.example:32-40` Redis cache/rate limit
- `.env.example:42-54` Kafka + notification
- `.env.example:55-60` SMTP
- `.env.example:61-63` management endpoint
- `.env.example:65-71` Cloudflare Pages + BFF

순서가 시간순/우연순. 신규 기여자 관점에서 "필수 vs optional" 분기와 "프론트 vs 서버 vs 인프라" 분기가 시각적으로 부재.

## 비변경 보증

- key 이름, 기본값, placeholder 형식(`<...>`, `{...}`) 모두 동일.
- 빈 값 라인 (예: `READMATES_BFF_SECRETS=`) 유지.

---

### Task 1: .env.example 재구성

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: 새 구조 작성**

`.env.example` 전체를 다음으로 교체:

```dotenv
# ============================================================
# ReadMates Environment Example
# ------------------------------------------------------------
# 섹션 순서:
#   1) Spring server (필수)
#   2) Auth & BFF (필수)
#   3) Frontend / Cloudflare Pages (필수)
#   4) Local MySQL (compose dev)
#   5) Redis (optional)
#   6) Kafka & Notifications (optional)
#   7) SMTP (notifications 사용 시 필수)
#   8) OCI Compose stack (배포 시)
#   9) Legacy / rollback
# ============================================================

# ----- 1) Spring server -----
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:mysql://<mysql-private-host>:3306/readmates?useSSL=true&serverTimezone=UTC
SPRING_DATASOURCE_USERNAME=readmates
SPRING_DATASOURCE_PASSWORD=<db-password>

# ----- 2) Auth & BFF -----
# Primary base URL for both app and OAuth redirect.
READMATES_APP_BASE_URL=https://readmates.pages.dev
READMATES_AUTH_BASE_URL=https://readmates.pages.dev
# HMAC secret for OAuth return-state signing.
READMATES_AUTH_RETURN_STATE_SECRET={return-state-signing-secret}
READMATES_ALLOWED_ORIGINS=https://readmates.pages.dev
# Shared secret between Cloudflare Pages Functions and Spring BFF.
READMATES_BFF_SECRET=<shared-bff-secret>
# Optional rotation list (comma-separated, primary first). Takes priority over READMATES_BFF_SECRET when set.
READMATES_BFF_SECRETS=
READMATES_BFF_SECRET_REQUIRED=true
# rotation-only: 회전 중 secondary 사용도 감사. all: 모든 인증을 감사.
READMATES_SECURITY_BFF_AUDIT_MODE=rotation-only
READMATES_AUTH_SESSION_COOKIE_SECURE=true
# Seed for deterministic IP hashing in audit logs.
READMATES_IP_HASH_BASE_SECRET=<ip-hash-base-secret>
# Google OAuth client (web).
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=<google-oauth-client-id>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=<google-oauth-client-secret>
SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE=openid,email,profile

# ----- 3) Frontend / Cloudflare Pages -----
# Vite-only flag for local dev login fixture.
VITE_ENABLE_DEV_LOGIN=false
VITE_PUBLIC_PRIMARY_DOMAIN={primary-domain}
# BFF → Spring upstream URL (Pages Functions에서 사용).
READMATES_API_BASE_URL=https://api.example.com
# Pages Functions side BFF secret (서버와 동일 값 / 회전 리스트).
# READMATES_BFF_SECRET / READMATES_BFF_SECRETS 는 위 2) 섹션과 공유.
# 회전 단계 표시: stable / rotating / completed.
BFF_SECRET_ROTATION_STAGE=stable

# ----- 4) Local MySQL (compose dev) -----
# compose.yml 에서 참조. .env로 복사할 변수만 골라 쓰세요.
READMATES_LOCAL_MYSQL_ROOT_PASSWORD=<ci-mysql-password>
READMATES_LOCAL_MYSQL_DATABASE=readmates
READMATES_LOCAL_MYSQL_USERNAME=readmates
READMATES_LOCAL_MYSQL_PASSWORD=readmates
READMATES_LOCAL_MYSQL_PORT=3306

# ----- 5) Redis (optional cache + rate limit) -----
READMATES_REDIS_ENABLED=false
READMATES_REDIS_URL=redis://redis:6379
READMATES_REDIS_COMMAND_TIMEOUT=250ms
READMATES_RATE_LIMIT_ENABLED=false
# fail-closed for sensitive endpoints when Redis is unreachable.
READMATES_RATE_LIMIT_FAIL_CLOSED_SENSITIVE=false
READMATES_AUTH_SESSION_CACHE_ENABLED=false
READMATES_PUBLIC_CACHE_ENABLED=false
READMATES_NOTES_CACHE_ENABLED=false

# ----- 6) Kafka & Notifications (optional) -----
READMATES_NOTIFICATIONS_ENABLED=false
READMATES_KAFKA_ENABLED=false
READMATES_KAFKA_BOOTSTRAP_SERVERS=redpanda:9092
READMATES_KAFKA_NOTIFICATION_EVENTS_TOPIC=readmates.notification.events.v1
READMATES_KAFKA_NOTIFICATION_DLQ_TOPIC=readmates.notification.events.dlq.v1
READMATES_KAFKA_NOTIFICATION_CONSUMER_GROUP=readmates-notification-dispatcher
READMATES_KAFKA_NOTIFICATION_RELAY_BATCH_SIZE=50
READMATES_KAFKA_NOTIFICATION_MAX_PUBLISH_ATTEMPTS=5
# Comma-separated minute delays for retry backoff.
READMATES_NOTIFICATION_RETRY_DELAY_MINUTES=5,15,60,240
READMATES_NOTIFICATION_MAX_DELIVERY_ATTEMPTS=5
READMATES_NOTIFICATION_SENDER_NAME=ReadMates
READMATES_NOTIFICATION_SENDER_EMAIL=no-reply@example.com

# ----- 7) SMTP (notifications 사용 시 필수) -----
SPRING_MAIL_HOST=smtp.email.oci-region.oci.oraclecloud.com
SPRING_MAIL_PORT=587
SPRING_MAIL_USERNAME=<oci-smtp-username>
SPRING_MAIL_PASSWORD=<oci-smtp-password>
SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true
SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true

# ----- 8) OCI Compose stack -----
CADDY_SITE=api.example.com
READMATES_SERVER_IMAGE=readmates-server:local

# ----- 9) Legacy / rollback (host JAR 운영시) -----
# Compose stack overrides these in deploy/oci/compose.yml.
READMATES_MANAGEMENT_ADDRESS=127.0.0.1
READMATES_MANAGEMENT_PORT=8081
```

- [ ] **Step 2: key 보존 검증**

이전과 동일 key 집합인지 비교:

```bash
git show HEAD:.env.example | grep -oE '^[A-Z_]+=' | sort -u > /tmp/before.txt
grep -oE '^[A-Z_]+=' .env.example | sort -u > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt && echo "key set identical"
```

Expected: 출력 없음 + `key set identical`.

- [ ] **Step 3: 기존 docs 의 환경변수 참조 점검**

```bash
grep -rEn "READMATES_[A-Z_]+|SPRING_[A-Z_]+|VITE_[A-Z_]+|CADDY_SITE|BFF_SECRET_ROTATION_STAGE" docs/ scripts/ deploy/ 2>/dev/null | head -30
```

Expected: 참조가 존재해도 변경 없음 (key 명 동일). 점검 목적.

- [ ] **Step 4: gitleaks scan (placeholder 값 노출 확인)**

```bash
which gitleaks && gitleaks detect --no-banner --source . --config .gitleaks.toml --exit-code 0 || echo "gitleaks not installed; skip"
```

Expected: 0 finding (placeholder만 변경).

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs(env): group .env.example by concern with inline annotations"
```

---

## Self-Review 체크리스트

- [x] Spec coverage: 단일 파일 재구성 — Task 1
- [x] Placeholder: 없음. 모든 키와 placeholder 값 동일
- [x] Key set 보존 검증 단계 (Step 2) 포함

## Rollback

`git revert <hash>` 단일 커밋. 다른 파일 영향 없음.

## Out of Scope

- 실제 default 값 변경 — 본 PR 금지 (행동 변경 발생).
- `.env.example` 을 여러 파일(`.env.example.frontend`, `.env.example.server`) 로 분할 — 후속 후보.
