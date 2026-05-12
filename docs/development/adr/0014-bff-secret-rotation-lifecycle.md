# ADR-0014: BFF secret rotation lifecycle — 4단계 절차 + preflight 진단 엔드포인트

- 상태: Accepted
- 결정일: 2026-05-12
- 작성자: front, security
- 관련: ADR-0005 (BFF shared secret + multi-secret rotation),
  ADR-0001 (Cloudflare Pages Functions BFF),
  `front/functions/_shared/proxy.ts`,
  `front/functions/api/bff/__internal/secret-status.ts`,
  spec `docs/superpowers/specs/2026-05-12-bff-secret-rotation-lifecycle-spec.md`

## 컨텍스트

ADR-0005는 무중단 회전을 위해 `READMATES_BFF_SECRETS` (comma-separated list) + `READMATES_BFF_SECRET` (legacy fallback) 두 환경 변수를 정의했다. 그러나 다음 두 가지가 코드와 문서 어디에도 명시되지 않았다:

### 문제 1: 회전 단계(rotation stage)가 코드 수준에서 표현되지 않음

Cloudflare Pages 환경 변수 갱신 후 재배포는 수십 초가 소요된다. 이 시간 동안 BFF가 새 secret을 사용하기 시작했지만 server는 아직 구 secret만 허용하는 "skew window"가 발생한다. 반대 방향(server 먼저, BFF 나중)의 단계 순서가 코드에 표현되지 않아 운영자가 착각해 역순으로 실행할 가능성이 있다.

회전 중 어느 단계에 있는지(새 secret이 staging인지, 이미 primary로 승격됐는지) BFF 환경에서 확인할 방법이 없다.

### 문제 2: 운영 상태 진단 수단 부재

현재 유효 secret list를 확인하려면 Cloudflare dashboard에 직접 접근해야 한다. secret 값 자체를 노출하지 않으면서 "몇 개의 secret이 설정되어 있고, primary가 무엇인지"를 확인하는 공개 진단 엔드포인트가 없다.

ADR-0005 후속 작업으로 "현재 유효 secret 목록을 운영 dashboard에 노출 — secret 값이 아닌 hash/fingerprint로"가 명시되어 있으나 구현되지 않았다.

## 결정

### 1. 4단계 회전 절차 (staging → candidate → primary → retire)

| 단계 | 이름 | server 상태 | BFF 상태 | cutoff 가이드 |
|------|------|-------------|----------|--------------|
| 1 | staging | 구 secret + **새 secret 추가** (둘 다 허용) | 구 secret (primary) | server 재시작 완료 + `/api/health` 확인 후 다음 단계 |
| 2 | candidate | 구 secret + 새 secret (둘 다 허용) | **새 secret을 첫 번째로** 이동 | Cloudflare Pages 재배포 완료 + BFF preflight 확인 후 다음 단계 |
| 3 | primary | 구 secret + 새 secret (둘 다 허용) | 새 secret (primary) | 24시간 이상 트래픽 모니터링 후 다음 단계 |
| 4 | retire | **구 secret 제거** (새 secret만 허용) | 새 secret (primary) | server 재시작 완료 후 완료 |

**Server-first 원칙**: 새 secret은 반드시 server에 먼저 추가한다. BFF가 새 secret으로 전송하기 시작하기 전에 server가 그 secret을 허용해야 한다. 순서를 역전하면 BFF가 새 secret을 전송하는 순간 server가 거부해 서비스 중단이 발생한다.

### 2. `BFF_SECRET_ROTATION_STAGE` 환경 변수

BFF Cloudflare Pages 환경에 `BFF_SECRET_ROTATION_STAGE` 환경 변수를 추가한다. 기본값은 `stable`.

| 값 | 의미 |
|----|------|
| `stable` | 회전 중이 아님. 정상 운영 상태. |
| `staging` | 새 secret이 server에 추가되었고 BFF가 새 secret으로 전환 중. 향후 트래픽 샘플링 hook 예정. |

현재 이 값은 진단 엔드포인트 응답에 포함되어 운영자가 BFF 배포 상태를 확인하는 데 사용된다. `staging` 값에 따른 코드 분기(예: 트래픽 샘플링)는 이번 ADR 범위 밖이며 별도 spec에서 정의한다.

### 3. `GET /api/bff/__internal/secret-status` 진단 엔드포인트

인증 없이 접근 가능한 진단 엔드포인트를 추가한다. raw secret 값을 노출하지 않으면서 현재 BFF 설정 상태를 확인할 수 있다.

**응답 필드:**

| 필드 | 타입 | 의미 |
|------|------|------|
| `configuredSecretCount` | `number` | 현재 BFF에 설정된 secret 개수 (0 이상). 회전 중에는 2 이상 가능. |
| `rotationStage` | `"stable" \| "staging"` | `BFF_SECRET_ROTATION_STAGE` 환경 변수 값. 미설정 시 `"stable"`. |
| `primarySecretFingerprint` | `string \| null` | 첫 번째(primary) secret의 SHA-256 앞 6 hex 자리. secret이 없으면 `null`. |

`primarySecretFingerprint`는 SHA-256 다이제스트의 앞 6 hex 자리(24비트)다. raw secret 값 복원이 불가능하고, 운영자가 "어떤 secret이 현재 primary인지" 서로 다른 두 secret을 구별하기에 충분하다.

**구현 위치:**
- `front/functions/api/bff/__internal/secret-status.ts` — Cloudflare Pages Function (GET handler)
- `front/functions/_shared/proxy.ts` — `getConfiguredBffSecrets`, `getRotationStage`, `secretFingerprint` 헬퍼

## 근거

1. **Server-first 원칙 명시**: 회전 순서의 실수를 방지하는 가장 효과적인 방법은 코드와 ADR에 순서를 명시하는 것이다. "server에 먼저 추가 → BFF 전환 → 구 secret 제거"라는 순서가 코드 레이어(단계 이름)와 ADR에 동시에 표현된다.

2. **Fingerprint는 public-safe**: SHA-256 앞 6 hex 자리는 무차별 대입으로 역추적하기 실용적으로 불가능하다(2^24 공간이 아니라 실제 secret entropy가 훨씬 크다). 운영자가 두 secret을 구별하는 데는 충분하다. 진단 엔드포인트에 인증이 없어도 secret 노출 위험이 없다.

3. **인증 미필요**: `secret-status`는 설정 개수와 fingerprint만 노출한다. 이 정보는 공격자에게 직접적인 이점을 주지 않는다(공격자는 이미 secret 자체를 모르면 fingerprint가 무의미하다). 인증을 요구하면 "BFF가 설정되기 전" 또는 "세션 없는 preflight 단계"에서 진단이 불가능해진다.

4. **`BFF_SECRET_ROTATION_STAGE`는 코드 hook**: 현재는 진단값으로만 사용되지만, 향후 트래픽 샘플링이나 slow rollout에 활용할 수 있다. BFF 재배포 없이 환경 변수 값 변경만으로 동작을 변경할 수 있다.

5. **헬퍼 함수 분리**: `getConfiguredBffSecrets`는 기존 `bffSecretFromEnv`와 중복되지만 역할이 다르다. `bffSecretFromEnv`는 "BFF가 upstream 요청에 사용할 단일 secret" 반환, `getConfiguredBffSecrets`는 "설정된 모든 secret의 전체 목록" 반환. 두 함수는 독립적으로 유지된다.

## 대안

| 대안 | 기각 이유 |
|------|----------|
| A — 진단 엔드포인트에 BFF secret 인증 요구 | 회전 중 BFF secret이 유효하지 않은 상태에서 preflight 불가. 인증이 진단 목적을 무효화. |
| B — fingerprint 대신 secret 길이만 노출 | 두 secret을 구별하기 불충분. 동일 길이의 구/신 secret을 구별 못함. |
| C — `BFF_SECRET_ROTATION_STAGE` 없이 configuredSecretCount > 1로 회전 중 추론 | 회전 완료 후 오래된 secret을 즉시 제거하지 않으면 "회전 중"으로 오탐. 명시적 stage가 더 명확. |
| D — 전용 rotation orchestration script로 단계 관리 | 스크립트가 Cloudflare Pages + OCI 양쪽에 접근해야 함. 인프라 credential 의존. 단순한 환경 변수 2개로 같은 효과 달성 가능. |
| **E — ADR + env var + fingerprint 엔드포인트 (채택)** | 위 근거 참조. |

## 결과

긍정적:
- Server-first 원칙이 ADR과 코드(단계 테이블)에 동시에 표현되어 회전 순서 실수 가능성 감소.
- `GET /api/bff/__internal/secret-status`로 BFF 재배포 없이 현재 설정 상태 확인 가능. 회전 완료 여부를 운영자가 브라우저/curl로 바로 확인.
- fingerprint는 public-safe — 인증 없이 접근 가능하면서도 raw secret 노출 없음.
- `BFF_SECRET_ROTATION_STAGE`가 코드 hook으로 남아 향후 트래픽 샘플링 등에 재사용 가능.
- 기존 `bffSecretFromEnv` 및 `[[path]].ts`의 동작에 영향 없음.

부정적/감수한 비용:
- `getConfiguredBffSecrets`와 `bffSecretFromEnv`의 로직이 일부 중복된다. 두 함수를 동기화해야 하는 책임이 생긴다.
- `BFF_SECRET_ROTATION_STAGE` 환경 변수를 Cloudflare Pages에 별도로 관리해야 한다. 설정하지 않으면 항상 `"stable"`이어서 무해하지만, 회전 중 `"staging"`으로 설정하지 않으면 진단 정보가 부정확하다.
- 진단 엔드포인트는 인증 없이 접근 가능하다. DDoS 벡터로 악용 가능성이 있으나, 응답이 고정 크기의 JSON이고 upstream 호출이 없어 amplification 위험이 낮다. 필요 시 Cloudflare rate limit으로 보호 가능.

## 검증

단위 테스트:
```bash
pnpm --dir front test cloudflare-bff-secret-status
```

테스트 범위:
- multi-secret 환경: configuredSecretCount=3, stage="stable", fingerprint 6 hex 자리
- legacy single-secret 환경: configuredSecretCount=1
- raw secret 값이 응답 body에 포함되지 않음

전체 프론트엔드 테스트/린트/빌드:
```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

public-repo 게이트:
```bash
./scripts/public-release-check.sh
```

## 후속 작업

- `BFF_SECRET_ROTATION_STAGE=staging` 시 트래픽 샘플링 구현 검토 — 회전 중 새 secret이 실제로 server에서 허용되는지 자동 검증하는 canary request.
- secret rotation runbook 작성 (`docs/deploy/`) — 4단계 단계별 검증 방법, rollback 절차, 인시던트 긴급 회전 포함.
- `configuredSecretCount > 2` 시 경고 로직 — 오래된 secret이 쌓이지 않도록 startup 또는 preflight에서 경고 추가 검토.
- ADR-0005 후속 작업 항목("rotation runbook", "현재 유효 secret dashboard 노출") 이 ADR로 부분 완료됨 — ADR-0005 후속 작업 목록 업데이트 검토.
