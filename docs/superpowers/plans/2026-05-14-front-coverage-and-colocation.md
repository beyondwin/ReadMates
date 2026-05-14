# Front Test Coverage Gate & Co-location Convention Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (a) Vitest coverage 게이트를 CI에 추가해 회귀를 가시화하고, (b) 신규 단위 테스트의 co-location 컨벤션을 도입하면서 기존 `front/tests/unit/` 테스트는 그대로 유지한다.

**Architecture:** Vitest v8 (built-in) coverage 사용. 임계값은 현재 측정치를 baseline으로 설정해 회귀만 차단. co-location 컨벤션은 새 테스트만 적용 — 기존 테스트는 fixture 공유 이유로 이동하지 않음.

**Tech Stack:** Vitest 3, `@vitest/coverage-v8`, GitHub Actions.

---

## 현재 상태

- `front/tests/unit/` 에 30+ 테스트. `front/tests/unit/__fixtures__/` 는 서버 testcontainer에서도 사용 (server build.gradle.kts:88-94 — `readmates.frontend.fixtures.dir` system property).
- `vitest.config.ts` 에 node/jsdom 두 project 분리 (vitest.config.ts:16-55).
- coverage 임계값 없음.

## 비변경 보증

- 기존 테스트 파일 이동 금지 (서버가 fixture 경로를 의존). co-location 은 신규 테스트만.
- node/jsdom split 유지.

---

### Task 1: coverage dev 의존성 추가

**Files:**
- Modify: `front/package.json`

- [ ] **Step 1: 설치**

```bash
pnpm --dir front add -D @vitest/coverage-v8@^3.2.4
```

Expected: `front/package.json` `devDependencies` 에 `@vitest/coverage-v8` 추가.

- [ ] **Step 2: Commit**

```bash
git add front/package.json front/pnpm-lock.yaml
git commit -m "build(front): add @vitest/coverage-v8"
```

---

### Task 2: vitest.config.ts 에 coverage 설정

**Files:**
- Modify: `front/vitest.config.ts`

- [ ] **Step 1: coverage 블록 추가**

`vitest.config.ts` 의 `test` 객체 안에 다음 추가:

```ts
test: {
  globals: true,
  coverage: {
    provider: "v8",
    reporter: ["text", "json-summary", "lcov"],
    reportsDirectory: "./coverage",
    include: [
      "src/**/*.{ts,tsx}",
      "features/**/*.{ts,tsx}",
      "shared/**/*.{ts,tsx}",
      "functions/**/*.{ts,tsx}",
    ],
    exclude: [
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "tests/**",
      "node_modules/**",
      "dist/**",
    ],
    // baseline. 측정 후 Task 4에서 실측치로 조정.
    thresholds: {
      lines: 0,
      statements: 0,
      functions: 0,
      branches: 0,
    },
  },
  projects: [ /* 기존 그대로 */ ],
},
```

- [ ] **Step 2: 첫 coverage 측정**

```bash
pnpm --dir front exec vitest run --coverage
```

Expected: `front/coverage/` 생성. 콘솔에 lines/statements/functions/branches % 표시. 임계값 0이므로 실패하지 않음.

- [ ] **Step 3: 측정치 기록**

```bash
cat front/coverage/coverage-summary.json | head -40
```

Expected: total 객체에 4개 지표 % 표시. 메모해 두기.

- [ ] **Step 4: Commit**

```bash
git add front/vitest.config.ts
git commit -m "test(front): enable v8 coverage with reporting (zero gates)"
```

---

### Task 3: baseline 임계값 설정 (현재 -2%p)

**Files:**
- Modify: `front/vitest.config.ts`

- [ ] **Step 1: 임계값 계산**

Task 2 Step 3 의 % 에서 각 지표 -2%p 한 정수값 사용 (소수점은 버림). 예: lines 73.4% → `72`.

- [ ] **Step 2: vitest.config.ts thresholds 업데이트**

```ts
thresholds: {
  lines: <measured-2>,
  statements: <measured-2>,
  functions: <measured-2>,
  branches: <measured-2>,
},
```

> `<measured-2>` 는 Task 3 Step 1 에서 산출한 실제 정수로 치환.

- [ ] **Step 3: 검증**

```bash
pnpm --dir front exec vitest run --coverage
```

Expected: PASS (현재 측정치가 임계값 + 2%p 이상이므로 통과).

- [ ] **Step 4: 게이트 활성 확인 (임계값 일시 상향)**

> 작은 미사용 함수 한 개로는 -2pp 버퍼를 절대 못 깨므로, 게이트가 실제로 동작하는지는 임계값을 일시적으로 현재 측정치보다 높게 올려 확인한다. 검증 후 즉시 원복.

임시로 임계값을 측정치보다 위로 변경 (예: 모두 100으로 세팅):

```bash
# vitest.config.ts thresholds 를 100/100/100/100 으로 일시 변경
pnpm --dir front exec vitest run --coverage
```

Expected: FAIL (모든 지표가 100% 미만이므로 임계 미달).

원복:

```bash
git checkout front/vitest.config.ts
```

그 후 Step 1~3에서 결정한 baseline 값 (`87/87/83/84`) 으로 다시 반영하고 다시 한 번 PASS 확인.

- [ ] **Step 5: Commit**

```bash
git add front/vitest.config.ts
git commit -m "test(front): pin coverage thresholds to current baseline -2pp"
```

---

### Task 4: package.json 스크립트 + CI 워크플로

**Files:**
- Modify: `front/package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: script 추가**

`front/package.json` `scripts` 에 추가:

```json
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 2: 현재 CI front 잡 위치 확인**

```bash
grep -n "front\|pnpm" .github/workflows/ci.yml | head -30
```

Expected: 기존 front lint/test/build 잡 위치 파악.

- [ ] **Step 3: CI 잡에 coverage step 추가**

기존 front 잡의 `pnpm --dir front test` 라인을 다음으로 교체 또는 추가:

```yaml
      - name: Front unit tests with coverage
        run: pnpm --dir front test:coverage

      - name: Upload coverage artifact
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: front-coverage
          path: front/coverage/
          retention-days: 14
```

> 단계 이름은 기존 컨벤션을 따름. `actions/upload-artifact` 의 commit SHA pin 은 기존 워크플로의 패턴을 따라 적용 (ci.yml 상단 actions/checkout 처럼).

- [ ] **Step 4: workflow 문법 검증 (가능하면 act/yamllint)**

```bash
yamllint .github/workflows/ci.yml 2>/dev/null || python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: 파싱 에러 없음.

- [ ] **Step 5: Commit**

```bash
git add front/package.json .github/workflows/ci.yml
git commit -m "ci(front): gate PRs on coverage thresholds"
```

---

### Task 5: co-location 컨벤션 문서화

**Files:**
- Modify: `front/AGENTS.md`

- [ ] **Step 1: 현재 AGENTS.md 확인**

```bash
cat front/AGENTS.md
```

Expected: 기존 문서 출력. 마지막 줄 위치 파악.

- [ ] **Step 2: 컨벤션 섹션 추가**

`front/AGENTS.md` 끝에 다음 추가:

```markdown

## Test Co-location Convention

신규 단위 테스트는 source 파일과 동일 디렉토리에 co-locate 합니다.

- 새 파일: `features/host/ui/host-foo.tsx` → `features/host/ui/host-foo.test.tsx`
- 모듈 import: 동일 디렉토리이므로 `./host-foo` 로 import.
- vitest.config.ts 가 두 위치 모두 매치하도록 `include` 패턴이 `tests/unit/**` + `**/*.test.{ts,tsx}` 를 모두 커버.

기존 `front/tests/unit/` 테스트는 fixture 공유를 위해 이동하지 않습니다. 서버 testcontainer가 `readmates.frontend.fixtures.dir` system property로 해당 경로를 참조합니다.

신규 fixture가 서버에서 사용되는 경우에 한해 `tests/unit/__fixtures__/` 에 둡니다.
```

- [ ] **Step 3: vitest.config.ts include 패턴 보강**

기존 두 project 의 `include` 에 co-location 패턴 추가:

```ts
// node project
include: [
  "tests/unit/**/*.test.ts",
  "src/**/*.test.ts",
  "features/**/*.test.ts",
  "shared/**/*.test.ts",
],
// jsdom project
include: [
  "tests/unit/**/*.test.tsx",
  "src/**/*.test.tsx",
  "features/**/*.test.tsx",
  "shared/**/*.test.tsx",
  // 기존 ts 파일 명시적 포함은 그대로
],
```

> jsdom project의 `tests/unit/cloudflare-*.test.ts` 등 명시 항목은 보존.

- [ ] **Step 4: 검증 (테스트 중복 실행 없음)**

```bash
pnpm --dir front exec vitest run --reporter=verbose | grep -c "test "
```

Expected: 전체 테스트 수가 기존과 동일 (co-location 신규 테스트 0개 상태이므로).

- [ ] **Step 5: Commit**

```bash
git add front/AGENTS.md front/vitest.config.ts
git commit -m "docs(front): adopt test co-location for new tests"
```

---

## Self-Review 체크리스트

- [x] Spec coverage: deps(1), config(2), baseline gate(3), CI(4), 컨벤션(5)
- [x] Placeholder: Task 3 Step 1/2 의 `<measured-2>` 는 실제 측정치로 치환해야 함을 명시
- [x] Type consistency: 임계값 4개 지표 일관, include 패턴 두 project 동일 형태

## Rollback

회귀 시 Task 3~4 revert로 게이트만 제거. coverage 측정 자체는 유지 가능.

## Out of Scope

- 기존 `tests/unit/` → co-located 이전 (fixture 의존 때문에 본 PR에서 금지)
- Mutation testing (Stryker 등) — 후속 후보
- Playwright e2e coverage — 별도 도구 필요
