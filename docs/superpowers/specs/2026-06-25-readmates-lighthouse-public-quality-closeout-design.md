# ReadMates Lighthouse Public Quality Closeout Design

작성일: 2026-06-25
상태: APPROVED DESIGN SPEC
대상 표면: frontend, public routes, Lighthouse diagnostics, docs

## 1. 배경

ReadMates에는 이제 local Lighthouse diagnostic harness가 있다.

- `pnpm --dir front lighthouse:diagnose`는 public, member, host, admin dev-seed route inventory를 실행할 수 있다.
- 결과는 `.tmp/lighthouse/<run>/summary.md`, `findings.json`, route별 raw report로 저장된다.
- `CHANGELOG.md`는 이 도구가 non-gating frontend quality diagnostic이고, dev-server-only noise와 release-actionable repeated cause를 분리한다고 기록한다.

남은 빈칸은 도구 자체가 아니라 운영 방식이다. Lighthouse 결과가 단순 report로 남으면 다음 구현자가 어떤 route failure와 어떤 page-quality finding을 먼저 닫아야 하는지 다시 판단해야 한다. 이번 고도화는 첫 public route baseline을 실행하고, 반복 원인 중 하나를 실제 public 품질 개선으로 닫는 closeout loop를 설계한다.

## 2. 목표

이번 작업의 목표는 **Lighthouse 진단을 실제 품질 개선 루프로 연결하는 첫 closeout**이다.

성공 기준:

- `pnpm --dir front lighthouse:diagnose -- --group public`로 public route baseline을 생성한다.
- public route 결과를 `route_data_failure`, `dev-server-only noise`, `release-actionable page quality`로 분류한다.
- release-actionable 반복 원인 1개를 선택해 frontend public surface에서 실제로 수정한다.
- 같은 public diagnostic을 다시 실행해 선택한 원인이 사라졌거나 명확히 감소했음을 evidence로 남긴다.
- 서버 API, DB migration, auth/BFF, OAuth, deploy workflow는 변경하지 않는다.
- Lighthouse 전체 점수 gate나 CI blocking threshold는 도입하지 않는다.

## 3. Non-goals

- Lighthouse를 CI hard gate로 승격하지 않는다.
- Member, host, admin route 품질 개선을 이번 범위에 포함하지 않는다.
- 서버 endpoint, persistence, Flyway migration, BFF proxy, OAuth flow를 변경하지 않는다.
- Route failure를 숨기거나 mock으로 덮어 score를 올리지 않는다.
- `.tmp/lighthouse/` raw report, local absolute path, private domain, real member data, deployment state, secret, token-shaped value를 커밋하지 않는다.
- Production deploy, release tag push, provider-console smoke는 포함하지 않는다.

## 4. 선택한 접근

선택한 접근은 **public route baseline triage + one actionable closeout**이다.

검토한 대안:

1. **Lighthouse diagnostic만 계속 확장**
   - 장점: 더 많은 route와 audit 정보를 모을 수 있다.
   - 단점: 도구가 report generator로 남고 제품 품질 개선까지 연결되지 않는다.

2. **Public route baseline을 실행하고 반복 원인 하나를 닫기** - 추천
   - 장점: 가장 최근에 추가된 diagnostic을 실제 개선 루프로 검증한다.
   - 단점: 첫 iteration에서는 모든 Lighthouse finding을 닫지 않는다.

3. **전체 route group을 한 번에 gate화**
   - 장점: 품질 기준이 명확해 보인다.
   - 단점: authenticated route, dev-server noise, seed data failure가 섞여 false failure가 많아진다.

이번 작업은 2번을 따른다. 첫 pass에서 public group만 다루고, raw score보다 반복 원인의 분류와 실제 closeout을 우선한다.

## 5. Architecture

기존 Lighthouse harness를 그대로 사용한다. 새 대형 framework나 별도 CI path를 추가하지 않는다.

```text
front/tests/lighthouse/route-inventory.ts
  -> public route subset 선택

front/scripts/lighthouse-diagnostic.ts
  -> local dev server route 진입
  -> Lighthouse raw report + normalized findings 생성

.tmp/lighthouse/<run>/
  -> summary.md
  -> findings.json
  -> route reports

triage
  -> route_data_failure / dev-server-only noise / release-actionable 분류
  -> release-actionable 반복 원인 1개 선택

frontend public route/model/ui 수정
  -> targeted tests
  -> public Lighthouse 재진단
```

역할:

- `front/tests/lighthouse/route-inventory.ts`: public route 목록과 dev-seed route id를 제공한다.
- `front/scripts/lighthouse-diagnostic.ts`: route 실행과 report 생성을 담당한다.
- `.tmp/lighthouse/<run>/findings.json`: raw audit id, category score, cause bucket을 확인하는 증거다.
- Public route/model/ui 파일: 실제 page-quality finding을 닫는 유일한 제품 코드 표면이다.
- `docs/superpowers/specs`와 후속 implementation plan: raw report를 커밋하지 않고 분류 판단과 선택 이유만 남긴다.

## 6. Triage Rules

Lighthouse 결과는 곧바로 제품 버그가 아니다. 각 finding은 먼저 아래 셋 중 하나로 분류한다.

### 6.1 Route Data Failure

다음은 page-quality 개선이 아니라 route/debugging 문제다.

- Route entry failure.
- 예상 text 또는 heading 부재.
- unexpected 401, 403, 404, 5xx.
- redirect loop.
- blank page.
- uncaught console error 또는 failed network request가 route를 깨뜨리는 경우.

이 경우 Lighthouse score 개선보다 route 진입 실패를 먼저 고친다. Public route baseline에서 route failure가 있으면 그 route를 첫 closeout 후보로 삼을 수 있다.

### 6.2 Dev-server-only Noise

다음은 첫 pass에서 제품 수정 대상으로 보지 않는다.

- Vite dev server의 bundle/minify warning.
- local robots/header 차이처럼 production build에서 직접 재검증해야 하는 항목.
- Lighthouse local 환경의 third-party 또는 generated-report noise.
- raw audit id가 실제 public route code와 연결되지 않는 항목.

이 항목은 evidence에 제외 이유를 남기되, 점수 상승을 위해 코드 변경하지 않는다.

### 6.3 Release-actionable Page Quality

다음은 이번 작업의 실제 수정 후보가 될 수 있다.

- Public route title, description, canonical, crawlable link 문제.
- 이름 없는 링크나 button, 부정확한 accessible name.
- heading/landmark 구조 문제.
- layout shift 또는 missing image dimension.
- public route error page 품질 문제.
- public-only route import나 layout import에서 발생하는 명확한 initial JavaScript cost.

첫 implementation은 이 목록에서 반복 원인 1개만 고른다. 여러 finding을 동시에 고치고 싶어도 원인이 분리되면 후속 작업으로 남긴다.

## 7. Data Flow

Public route 품질 개선은 화면 데이터와 metadata가 같은 source에서 파생되도록 유지한다.

```text
public loader/query data
  -> public route model or UI props
  -> visible page content
  -> page metadata / link names / layout dimensions
  -> Lighthouse public diagnostic
```

예상 수정 표면:

- `front/features/public/model/*`
- `front/features/public/ui/*`
- `front/features/public/route/*`
- `front/src/app/layouts/public-route-layout.tsx`
- `front/src/pages/public-*`
- 관련 unit test 또는 public route test

UI 컴포넌트가 API를 직접 호출하거나 route loader 책임을 가져오면 안 된다. Public route-first 경계와 기존 Query loader seeding 패턴을 유지한다.

## 8. Error Handling And Safety

- Route entry failure는 diagnostic report에서 실패로 유지한다. Score를 위해 숨기지 않는다.
- Public route error boundary는 페이지를 잘못 대표하는 optimistic metadata를 만들지 않는다.
- Head side effect는 route 변경과 test cleanup에서 안정적으로 정리되어야 한다.
- Canonical URL은 기존 public URL policy를 따른다. 필요한 입력이 없으면 임의로 만들지 않는다.
- Lighthouse raw artifact는 `.tmp/lighthouse/`에만 둔다.
- Test fixture와 docs는 public-safe 값만 사용한다.
- Real member data, private email, private domain, local absolute path, deployment state, OCID, secret, token-shaped value를 추가하지 않는다.

## 9. Testing

Baseline and diagnostic:

```bash
pnpm --dir front exec vitest run tests/lighthouse
pnpm --dir front lighthouse:diagnose -- --group public
```

Frontend verification:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Targeted tests depend on the selected finding:

- Metadata/head finding: public metadata model and head component tests.
- Accessible name or heading finding: public UI unit tests.
- Route entry failure: relevant route test and targeted Playwright E2E if BrowserRouter behavior is involved.
- Layout shift or image dimension finding: public UI test plus before/after Lighthouse route report.

`pnpm --dir front test:e2e` is required only if route behavior, auth boundary, BFF behavior, or BrowserRouter ordering changes. Metadata-only or copy-only changes should explain why full E2E was skipped.

## 10. Evidence And Documentation

Implementation closeout should report:

- Baseline run command and `.tmp/lighthouse/<run>` path, without committing the raw artifacts.
- Selected repeated cause bucket.
- Affected public route ids.
- Raw Lighthouse audit ids used for the decision.
- Why excluded findings were treated as route failure or dev-server-only noise.
- Code files changed.
- Re-run command and observed delta.

Commit candidates:

- Product code and tests for the selected public quality fix.
- `CHANGELOG.md` if visible public route behavior changes.
- `docs/development/test-guide.md` only if the diagnostic workflow itself changes.

Do not commit:

- `.tmp/lighthouse/**`
- raw HTML/JSON Lighthouse reports
- screenshots containing private or local-only state

## 11. Acceptance Criteria

- Fresh public baseline exists locally under `.tmp/lighthouse/`.
- One release-actionable repeated finding is selected from the baseline.
- Product change is scoped to frontend public route quality.
- Targeted tests cover the selected finding.
- Standard frontend checks pass.
- Public Lighthouse diagnostic is rerun after the change.
- Final implementation report states no server API, DB migration, auth/BFF, OAuth, or deploy workflow impact.

## 12. Spec Self-review

- Placeholder scan: no unfinished marker text or incomplete file paths remain.
- Internal consistency: the design keeps Lighthouse non-gating while requiring a before/after public diagnostic.
- Scope check: this is one implementation plan, limited to public route baseline triage and one actionable closeout.
- Ambiguity check: route failures, dev-server noise, and release-actionable page-quality findings are explicitly separated.
