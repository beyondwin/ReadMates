# Release Readiness Review

남은 리스크, release readiness, merge 후 안전성, ship 가능 여부를 확인할 때 사용하는 체크리스트입니다. 구현 계획의 완료 여부와 테스트 통과 여부만으로 release risk가 닫혔다고 판단하지 않습니다.

## v1.11.0 post-release smoke

- Task 1 (Redis aigen residual): 2026-05-18T12:12Z UTC, automated. Keys: 0. Action: no-op. Ledger event: AIGEN_RESIDUAL_VERIFIED.
- Task 2 Step 1 (Local Playwright E2E): 2026-05-18T12:18Z UTC, automated. Specs: 17 pass / 0 fail (grep fallback `@aigen|host`; initial `@aigen|host session editor|platform-admin` matched 0 specs). Log: .tmp/v1.11.0-followups/playwright-e2e-output.log.
- Task 2 Step 2-3 (Production host smoke): 2026-05-18T12:18Z UTC, MANUAL REQUIRED. Google OAuth automation blocked at https://accounts.google.com/v3/signin/identifier (no redirect back to readmates.pages.dev under automated browser, per spec S1.4.3).
- [ ] [MANUAL REQUIRED] Task 2 production host smoke — Google OAuth automation blocked. Owner: kws. Target: within 7 days.
- Task 5 (OAuth happy path): 2026-05-18T12:24Z UTC, MANUAL REQUIRED. Playwright MCP redirect from https://readmates.pages.dev/login reached https://accounts.google.com/v3/signin/identifier; Google blocked credential entry under automated browser (spec §S1.4.3 escape hatch). Artifact: .tmp/v1.11.0-followups/oauth-flow-results.json.
- [ ] [MANUAL REQUIRED] Task 5 OAuth happy-path — automation blocked at accounts.google.com/v3/signin/identifier. Owner: kws. Target: within 7 days.

## 기본 범위

기본 범위는 현재 branch와 base branch의 차이입니다. 보통 `origin/main..HEAD`를 사용합니다.

```bash
git status --short --branch
git log --oneline origin/main..HEAD
git diff --stat origin/main..HEAD
git diff --name-only origin/main..HEAD
```

feature branch에서 base가 `origin/main`이 아니면 실제 base branch 또는 merge-base를 먼저 확인합니다. 사용자가 명시적으로 특정 implementation plan 범위만 보라고 하지 않았다면, 최신 계획 문서나 마지막 커밋 묶음으로 범위를 좁히지 않습니다.

## 필수 확인 항목

- `CHANGELOG.md`의 `## Unreleased`가 사용자에게 보이는 변경, 운영자에게 보이는 변경, security posture 변경, CI/deploy 변경, behavior change를 반영하는지 확인합니다.
- 운영자가 놀랄 수 있는 변경이 historical planning docs에만 남지 않고 CHANGELOG, deploy/runbook, operator-facing docs 중 적절한 곳에 기록되어 있는지 확인합니다.
- CI/deploy script가 scan한 artifact와 publish/deploy한 artifact를 다르게 만들지 않는지, root cause를 오도하는 진단 메시지를 만들지 않는지, broad false positive로 운영 실패를 유발하지 않는지 확인합니다.
- Security code에 피할 수 있는 dead code, inconsistent constant-time behavior, unsafe fallback mode, secret/token exposure, audit/metric silent-loss mode가 없는지 확인합니다.
- Architecture test의 baseline이나 exception list가 새 부채를 영속화하지 않는지 확인합니다. 남겨야 한다면 후속 plan, issue, TODO가 아니라 실행 가능한 추적 문서에 명시되어야 합니다.
- Public release candidate 생성과 scanner가 새 generated artifact, private state, local path, token-shaped data를 허용하지 않는지 확인합니다.
- 테스트 통과는 중요한 증거지만, release note 누락, 운영 surprise, 보안 코드 위생, 배포 진단 리스크를 자동으로 닫지는 않습니다.

## 권장 명령

변경 파일에 맞춰 필요한 명령만 실행하되, 아래 확인을 우선 고려합니다.

```bash
git diff --check origin/main..HEAD
rg -n "^## Unreleased|\\(없음\\)" CHANGELOG.md
rg -n "TODO|baseline|exception|allowlist|fallback|audit|secret|token|scan|deploy|watch" \
  CHANGELOG.md \
  .github \
  deploy \
  scripts \
  server/src/main/kotlin \
  server/src/test/kotlin
```

Public release나 deploy 관련 변경이 있으면 repo guide의 public release checks도 실행합니다.

```bash
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Server behavior, auth, BFF, persistence, architecture boundary 변경이 있으면 관련 targeted test와 server guide의 server check를 선택합니다.

```bash
./server/gradlew -p server clean test
```

Frontend route, BFF proxy, user-flow 변경이 있으면 frontend guide의 checks와 E2E 필요성을 검토합니다.

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e
```

## 출력 형식

findings를 우선순위별로 보고합니다.

- Blocker
- High
- Medium
- Low
- Not an issue

각 finding에는 파일/라인, 문제가 되는 이유, 추천 액션, 실행한 검증 또는 실행하지 못한 검증을 포함합니다. 문제가 없다고 판단한 항목도 중요한 오해 가능성이 있었다면 `Not an issue`에 짧게 남깁니다.

## 완료 기준

- 검토 범위가 `origin/main..HEAD` 또는 명시된 base 범위로 기록되어 있습니다.
- CHANGELOG/release note, 운영 문서, CI/deploy, security-code hygiene, architecture baseline, public-release safety가 모두 고려되었습니다.
- 실행한 검증과 skipped validation이 구분되어 있습니다.
- “테스트 통과”만을 근거로 운영/릴리즈 리스크가 없다고 결론내리지 않았습니다.
