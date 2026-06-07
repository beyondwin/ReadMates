# ReadMates v1.13.0 릴리스 리스크 해소 설계

- 날짜: 2026-06-07
- 표면: frontend `/admin/analytics`, deploy workflow, release documentation
- 상태: DRAFT DESIGN SPEC
- 짝 구현 문서: `docs/superpowers/plans/2026-06-07-readmates-release-risk-remediation.md`

## 1. 배경

`v1.12.1..HEAD` 릴리스 전 검토에서 코드 기능 자체의 즉시 blocker는 발견되지 않았다. 다만
새 버전 발행 전 닫아야 할 운영 리스크가 두 가지 확인됐다.

1. **프론트/서버 배포 순서 skew 리스크**
   - 새 프론트는 `/api/admin/analytics/overview`의 `admin.analytics_overview.v2` 응답을 전제로
     `overview.series`를 렌더링한다.
   - tag push 시 `Deploy Front`와 `Deploy Server Image` workflow가 서로 독립적으로 시작된다.
   - 서버 이미지 scan/promote 이후 OCI Compose promotion이 끝나기 전 Cloudflare Pages가 먼저
     배포되면, 새 프론트가 구 서버의 v1 응답을 만날 수 있다.
   - 현재 production parser는 runtime validation 비용을 피하려고 cast만 하므로, `series` 누락
     응답을 받으면 `/admin/analytics` UI 또는 CSV export가 런타임에서 깨질 수 있다.

2. **deploy-server workflow 검증 명칭과 실제 gate 불일치**
   - `Deploy Server Image` workflow의 `Test and build server jar` 단계는
     `./server/gradlew -p server clean test bootJar`를 실행한다.
   - 현재 Gradle 구성에서 `test` task는 skip될 수 있고, 실제 CI 품질 gate는 `check`
     (`ktlint + detekt + unitTest + JaCoCo + architectureTest`)다.
   - tag deploy workflow의 단계명이 "Test"를 말하지만 실제 release-quality gate를 그대로
     실행하지 않아, 운영자가 release artifact 검증 강도를 오해할 수 있다.

이 설계는 두 리스크를 새 기능으로 확장하지 않고, **하위호환 렌더링 + 릴리스 절차 명확화 +
deploy workflow gate 정합화**로 닫는다.

## 2. 목표

- 새 프론트가 구 서버의 `admin.analytics_overview.v1` shape를 만나도 `/admin/analytics`가
  정상 렌더링된다.
- `admin.analytics_overview.v2`의 trend table은 유지하되, `series`가 없으면 정직한 빈 상태
  "KPI 추세를 만들 충분한 데이터가 없습니다."를 보여 준다.
- CSV export도 `series`가 없는 응답에서 빈 trend 섹션을 안전하게 처리한다.
- `v1.13.0` Deployment Notes와 release runbook이 서버 image promote, OCI backend promotion,
  frontend/admin smoke 순서를 명확히 말한다.
- `Deploy Server Image` workflow가 실제 backend quality gate인 `check`를 실행한 뒤 `bootJar`를
  만든다.
- public repo safety를 유지한다. 운영 domain, VM IP, secret, real member data, provider state,
  local absolute path를 문서에 넣지 않는다.

## 3. 비목표

- Cloudflare Pages와 server image workflow 사이에 GitHub Actions dependency를 새로 만들지 않는다.
  두 workflow는 tag push에서 독립적으로 시작되는 기존 모델을 유지한다.
- `admin.analytics_overview.v1` 서버 contract를 다시 살리거나 서버 endpoint를 downgrade하지 않는다.
- 전체 deploy automation을 재설계하지 않는다.
- production smoke를 로컬 문서 작성 단계에서 실행했다고 주장하지 않는다.
- CT visual regression을 CI에 통합하지 않는다. 이는 별도 인프라 작업이다.

## 4. 현재 사실 근거

### 4.1 프론트 contract

- `front/features/platform-admin/model/platform-admin-analytics-model.ts`
  - `AdminAnalyticsOverview.schema`는 `"admin.analytics_overview.v2"` 리터럴이다.
  - `series: AdminAnalyticsKpiSeries[]`가 필수 필드다.
  - `buildAnalyticsCsv()`는 `overview.series`를 순회한다.
- `front/features/platform-admin/ui/admin-analytics-overview.tsx`
  - `AdminAnalyticsSeriesTable`에 `overview.series`를 필수로 넘긴다.
- `front/features/platform-admin/api/platform-admin-analytics-contracts.ts`
  - DEV에서만 Zod parse, production에서는 cast.
  - 현재 schema는 `"admin.analytics_overview.v2"` literal과 필수 `series`를 요구한다.

### 4.2 서버 contract

- `server/src/main/kotlin/com/readmates/admin/analytics/application/model/AdminAnalyticsModels.kt`
  - `AdminAnalyticsOverview.schema = "admin.analytics_overview.v2"`.
  - `series` 기본값은 `emptyList()`.
- 새 서버가 먼저 적용되면 새 프론트와 구 프론트 모두 문제 없다.
- 구 서버가 먼저 남아 있고 새 프론트가 먼저 적용되면 `series` 누락 가능성이 있다.

### 4.3 배포 workflow

- `.github/workflows/deploy-front.yml`
  - `push.tags: v*`에서 Cloudflare Pages production deploy를 시작한다.
- `.github/workflows/deploy-server.yml`
  - `push.tags: v*`에서 GHCR server image scan/promote를 시작한다.
  - OCI Compose promotion은 workflow 이후 별도 운영 단계다.
- `docs/deploy/release-publish-runbook.md`
  - 현재 "Frontend Smoke"가 "Backend OCI Promotion"보다 앞에 배치되어 있다.
  - 서버/API/frontend contract가 함께 바뀐 릴리스에서는 이 순서가 실제 안전 순서와 다르다.

## 5. 설계 결정

### 5.1 프론트 하위호환 normalization

`parseAdminAnalyticsOverview()`가 API 응답을 **UI view model로 normalize**한다.

결정:

- DEV parser는 v1/v2 양쪽을 받아들인다.
- `series`는 optional로 받아서 없으면 `[]`로 normalize한다.
- 반환 타입은 기존 `AdminAnalyticsOverview`를 유지한다.
- 반환 객체의 `schema`는 UI model 기준 `"admin.analytics_overview.v2"`로 고정한다.
  - 이유: UI는 v2 view model(`series` 필드 존재, 없으면 빈 배열)을 소비한다.
  - 구 서버 응답을 v2 서버 응답이라고 주장하는 것이 아니라, 프론트 내부 모델을 v2 shape로
    normalize하는 것이다.
- production에서도 최소 normalization은 수행한다.
  - Zod 전체 parse는 DEV에서만 유지해 runtime validation 비용을 피한다.
  - production에서는 object spread와 `Array.isArray(value.series)` 정도의 낮은 비용만 적용한다.

구현 shape:

```ts
export type AdminAnalyticsWireOverview =
  Omit<AdminAnalyticsOverview, "schema" | "series"> & {
    schema: "admin.analytics_overview.v1" | "admin.analytics_overview.v2";
    series?: AdminAnalyticsKpiSeries[];
  };

export function normalizeAdminAnalyticsOverview(value: AdminAnalyticsWireOverview): AdminAnalyticsOverview {
  return {
    ...value,
    schema: "admin.analytics_overview.v2",
    series: Array.isArray(value.series) ? value.series : [],
  };
}
```

DEV Zod schema는 wire schema를 검증한다. v1 payload에서 `series`가 누락된 경우도 허용하지만,
기존 nested KPI 필수 필드 누락은 계속 실패해야 한다.

### 5.2 UI empty state 유지

`AdminAnalyticsSeriesTable`은 이미 `series.length === 0`이면 빈 상태를 렌더링한다.
따라서 normalization만으로 구 서버 응답을 안전하게 처리할 수 있다. 추가 UI copy 변경은 필요 없다.

CSV export는 `buildAnalyticsCsv()`가 `overview.series` 빈 배열을 순회하면 benchmark row만 남는다.
이 동작은 안전하며, 별도 placeholder row를 만들지 않는다. 데이터가 없는데 trend 값을 만들어내지
않는 것이 현재 analytics honesty 원칙과 맞다.

### 5.3 Deployment Notes와 runbook 정렬

`v1.13.0` release note에는 아래 내용을 명시한다.

- Release classification: minor release.
- DB migration 없음.
- Public API contract는 additive이며, `/admin/analytics/overview`는 v2 trend `series`를 포함한다.
- 서버/API/frontend contract가 함께 바뀌므로 운영 배포는 다음 순서로 확인한다.
  1. release tag push.
  2. `Deploy Server Image` success 및 GHCR `readmates-server:v1.13.0` promote 확인.
  3. OCI Compose backend를 `READMATES_SERVER_IMAGE=ghcr.io/<owner>/<repo>/readmates-server:v1.13.0`로 promotion.
  4. `/internal/health`, BFF auth, OAuth redirect smoke.
  5. Cloudflare Pages `Deploy Front` success 확인.
  6. `/admin/analytics` OWNER/OPERATOR smoke. trend table 또는 빈 trend 상태가 렌더링되는지 확인.

`docs/deploy/release-publish-runbook.md`는 모든 릴리스에 무조건 frontend smoke를 먼저 하라고
읽히지 않도록 바꾼다.

결정:

- "Frontend Smoke" 앞에 "서버/API/frontend contract가 함께 바뀐 release는 Backend OCI
  Promotion을 먼저 완료한다"는 분기 규칙을 추가한다.
- "배포 후 확인"에는 `/admin/analytics` smoke를 contract-changing admin release의 예로 추가한다.
- 실제 domain과 운영 host는 placeholder 유지.

### 5.4 Deploy Server Image workflow gate 정합화

`.github/workflows/deploy-server.yml`의 단계:

현재:

```yaml
- name: Test and build server jar
  run: ./server/gradlew -p server clean test bootJar
```

변경:

```yaml
- name: Server quality gate and build jar
  run: ./server/gradlew -p server clean check bootJar
```

근거:

- `check`는 현재 CI backend job의 source of truth다.
- `check`는 unitTest, ktlint, detekt, JaCoCo, architectureTest를 포함한다.
- Testcontainers 기반 `integrationTest`는 CI의 별도 `Backend Integration` job이 담당한다.
  deploy-server workflow에서 Docker image build 전 integrationTest까지 중복 실행할지는 별도 비용
  논의가 필요하므로 이번 scope에서는 `check` 정합화로 제한한다.

## 6. 테스트 전략

### 6.1 프론트 단위 테스트

`front/features/platform-admin/api/platform-admin-analytics-contracts.test.ts`

- v2 payload가 그대로 parse된다.
- v1 payload 또는 `series` 누락 payload가 `series: []`, `schema: "admin.analytics_overview.v2"`로
  normalize된다.
- nested KPI 필수 필드(`deltaDirection`) 누락은 계속 throw한다.

`front/features/platform-admin/ui/admin-analytics-overview.test.tsx`

- `series: []` overview에서 "KPI 추세를 만들 충분한 데이터가 없습니다."를 렌더링한다.
- CSV link가 여전히 만들어진다.

`front/features/platform-admin/model/platform-admin-analytics-model.test.ts`

- `buildAnalyticsCsv()`가 `series: []`에서 header와 benchmark row만 생성한다.

### 6.2 문서 검증

- `git diff --check -- CHANGELOG.md docs/deploy/release-publish-runbook.md docs/development/release-readiness-review.md docs/superpowers/specs/... docs/superpowers/plans/...`
- public release candidate build/check.

### 6.3 workflow 검증

- `.github/workflows/deploy-server.yml` syntax는 repo에 별도 workflow parser가 없으므로, 최소
  `git diff --check`와 public release candidate scanner로 검증한다.
- 실제 `Deploy Server Image`는 tag push 이후 GitHub Actions에서 확인해야 하며, 로컬 문서/코드
  단계에서 성공했다고 기록하지 않는다.

### 6.4 전체 release baseline

구현 후 로컬에서 실행:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean check architectureTest integrationTest --tests RedisAiGenerationJobStoreTest
pnpm --dir front test:e2e
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

## 7. 리스크와 완화

| 리스크 | 완화 |
| --- | --- |
| v1 payload를 normalize하며 실제 서버 schema를 숨긴다 | 반환 모델을 "wire response"가 아니라 "UI model"로 명명하고, `schema` 고정 이유를 코드 주석 없이 테스트명과 타입명으로 설명한다 |
| production parser 비용 증가 | Zod parse는 DEV 전용 유지, production은 `series` 배열 확인만 수행 |
| `check bootJar`가 deploy-server workflow 시간을 늘린다 | tag deploy는 release artifact 생성 경로라 정확성이 우선. CI backend와 같은 gate를 사용해 오해를 줄인다 |
| integrationTest를 deploy-server workflow에서 실행하지 않는다 | CI `Backend Integration` job이 별도 source of truth. release-readiness 문서에 local integration evidence를 남긴다 |
| tag 후 frontend가 이미 먼저 배포될 수 있다 | 프론트 normalization으로 구 서버 응답을 견디고, runbook은 backend promotion 후 final smoke를 요구한다 |
| production smoke는 로컬에서 증명할 수 없다 | release note에 skipped/local evidence와 post-tag required smoke를 분리한다 |

## 8. 성공 기준

- 구 `admin.analytics_overview.v1` 또는 `series` 누락 payload를 넣어도 parser가 `series: []`를
  반환한다.
- `/admin/analytics` view test가 빈 trend 상태를 검증한다.
- `Deploy Server Image` workflow가 `clean check bootJar`를 실행하도록 문서와 workflow가 일치한다.
- `CHANGELOG.md`의 `v1.13.0` Deployment Notes가 server/API/frontend contract 배포 순서를 명확히 말한다.
- release runbook이 서버/API/frontend contract 변경 릴리스의 backend-first final smoke 원칙을 포함한다.
- public release candidate scanner가 통과한다.
