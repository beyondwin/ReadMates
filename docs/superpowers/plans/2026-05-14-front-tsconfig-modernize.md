# Front tsconfig Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `front/tsconfig.json`의 `target`을 `ES2017` → `ES2022`로 올려 React 19 / Vite 8 / Node 24 환경에 맞추고, 불필요한 downlevel을 제거한다.

**Architecture:** TypeScript compiler 옵션만 조정. 런타임 코드는 변경하지 않는다. 빌드/테스트 통과로 회귀 없음을 보증한다.

**Tech Stack:** TypeScript 5.8, Vite 8 (rolldown), Vitest 3, React 19, Cloudflare Pages.

---

## 배경

`front/tsconfig.json:3` 의 `target: "ES2017"`은 Cloudflare Pages가 modern evergreen browser만 타게팅하는 본 SPA에서 과도하게 보수적. 다음 코어 기능들이 downlevel/polyfill 됨:

- `Object.hasOwn` (ES2022)
- top-level `await` (ES2022)
- `Error.cause` (ES2022)
- private class fields (`#field`) (ES2022)
- `at()`, `findLast()`, regex `d` flag (ES2022)

`module: "esnext"` + `moduleResolution: "bundler"` 와의 부정합도 해소된다.

## 비변경 보증

- `lib: ["dom", "dom.iterable", "esnext"]` 는 그대로. 타입 표면 변화 없음.
- Vite는 esbuild로 트랜스파일하므로 `target`은 주로 emit/타입 의미용. 실제 번들 타겟은 Vite 기본 (`modules`).
- Vitest는 동일 tsconfig 사용 — 테스트 영향 없음.

---

### Task 1: tsconfig 변경 + 빌드 회귀 확인

**Files:**
- Modify: `front/tsconfig.json:3`

- [ ] **Step 1: target 변경**

`front/tsconfig.json`을 다음으로 교체:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 2: 타입체크 실행**

```bash
pnpm --dir front exec tsc -p tsconfig.json --noEmit
```

Expected: 0 errors. (변경은 target만이며 lib는 동일하므로 타입 표면은 그대로)

- [ ] **Step 3: lint 실행**

```bash
pnpm --dir front lint
```

Expected: 0 errors. 

- [ ] **Step 4: unit test 실행**

```bash
pnpm --dir front test
```

Expected: 모든 기존 테스트 통과.

- [ ] **Step 5: production build**

```bash
pnpm --dir front build
```

Expected: 빌드 성공. `chunkSizeWarningLimit: 350` (vite.config.ts:17) 이내. 번들 크기 감소(불필요한 downlevel 제거).

- [ ] **Step 6: 빌드 산출물 sanity check**

```bash
ls -la front/dist/assets/*.js | head -5
```

Expected: `front/dist/assets/*.js` 파일이 생성됨. 크기는 변경 전 대비 동일하거나 감소.

- [ ] **Step 7: Commit**

```bash
git add front/tsconfig.json
git commit -m "build(front): bump tsconfig target to ES2022

ES2017 was producing unnecessary downlevel for evergreen targets.
Vite 8 + Cloudflare Pages serve only modern browsers; ES2022
unlocks Object.hasOwn, Error.cause, top-level await, and private
class fields without polyfills."
```

---

## Self-Review 체크리스트

- [x] Spec coverage: target 변경 — Task 1
- [x] Placeholder: 없음
- [x] Type consistency: 단일 파일 변경

## Rollback

회귀 시 `git revert <hash>` 1커밋. 다른 의존성/코드 변경 없음.
