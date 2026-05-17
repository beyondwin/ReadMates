# AI Generation Live Contract Test — Model ID Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded stale model IDs in two live-contract test files with shared `AiGenerationTestModels` constants so future model swaps remain single-file edits and the test bodies match the catalog they validate against.

**Architecture:** Two surgical Edits, each importing the existing `AiGenerationTestModels` test-support object and substituting one string literal. No production code change.

**Tech Stack:** Kotlin (test), JUnit 5, gradle `:server:unitTest`.

**Spec:** `docs/superpowers/specs/2026-05-17-aigen-live-contract-model-id-followup-design.md`

---

## File Structure

**Modify only:**
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiApiClientLiveContractTest.kt` — line 52 string + new import
- `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiClientLiveContractTest.kt` — line 52 string + new import

**Untouched:**
- `server/src/test/kotlin/com/readmates/aigen/support/AiGenerationTestModels.kt` (already exposes `OPENAI_DEFAULT = "gpt-5.4-mini"` and `GEMINI_DEFAULT = "gemini-3-flash"`)

---

## Task 1: Update OpenAI live contract test

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiApiClientLiveContractTest.kt`

- [ ] **Step 1: Confirm pre-state**

Run: `grep -n 'gpt-4o-mini' server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiApiClientLiveContractTest.kt`
Expected: `52:                model = "gpt-4o-mini",`

- [ ] **Step 2: Add import**

Insert after the existing JUnit imports (around line 8), preserving alphabetical order within the `com.readmates` group:

```kotlin
import com.readmates.aigen.support.AiGenerationTestModels
```

- [ ] **Step 3: Replace model literal**

Replace:

```kotlin
                model = "gpt-4o-mini",
```

with:

```kotlin
                model = AiGenerationTestModels.OPENAI_DEFAULT,
```

- [ ] **Step 4: Confirm post-state**

Run: `grep -n 'gpt-4o-mini\|OPENAI_DEFAULT' server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiApiClientLiveContractTest.kt`
Expected: one `OPENAI_DEFAULT` hit, zero `gpt-4o-mini` hits.

---

## Task 2: Update Gemini live contract test

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiClientLiveContractTest.kt`

- [ ] **Step 1: Confirm pre-state**

Run: `grep -n 'gemini-2.5-flash' server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiClientLiveContractTest.kt`
Expected: `52:                model = "gemini-2.5-flash",`

- [ ] **Step 2: Add import**

Insert in the `com.readmates` import group:

```kotlin
import com.readmates.aigen.support.AiGenerationTestModels
```

- [ ] **Step 3: Replace model literal**

Replace:

```kotlin
                model = "gemini-2.5-flash",
```

with:

```kotlin
                model = AiGenerationTestModels.GEMINI_DEFAULT,
```

- [ ] **Step 4: Confirm post-state**

Run: `grep -n 'gemini-2.5-flash\|GEMINI_DEFAULT' server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiClientLiveContractTest.kt`
Expected: one `GEMINI_DEFAULT` hit, zero `gemini-2.5-flash` hits.

---

## Task 3: Verify compile, ktlint, skip behavior

- [ ] **Step 1: Compile test sources**

Run: `./gradlew :server:compileTestKotlin`
Expected: `BUILD SUCCESSFUL`

- [ ] **Step 2: ktlint format check on modified files**

Run: `./gradlew :server:ktlintTestSourceSetCheck` (or `:server:ktlintCheck` if subtask absent)
Expected: `BUILD SUCCESSFUL`. If it fails on the new import lines, fix per the baseline convention (alphabetical inside `com.readmates` group, no blank line inside group).

- [ ] **Step 3: Run unit tests for live contract classes**

Run:
```bash
./gradlew :server:unitTest --tests "com.readmates.aigen.adapter.out.llm.openai.OpenAiApiClientLiveContractTest" --tests "com.readmates.aigen.adapter.out.llm.gemini.GeminiApiClientLiveContractTest"
```
Expected: both classes report `0 executed / 1 skipped` (because `READMATES_AIGEN_*_API_KEY` env vars are unset on this machine). `BUILD SUCCESSFUL`.

- [ ] **Step 4: Final tree-wide grep**

Run: `grep -rn 'gpt-4o-mini\|gemini-2\.5-flash' server/src/test 2>/dev/null`
Expected: zero results.

---

## Task 4: CHANGELOG + commit

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Append a one-line entry under the existing Unreleased "Model catalog refresh (2026-05-17)" subsection**

Insert a new bullet at the end of that subsection:

```markdown
- fix(aigen): live-contract smoke tests (`OpenAiApiClientLiveContractTest`, `GeminiApiClientLiveContractTest`)가 카탈로그 외 모델(`gpt-4o-mini`, `gemini-2.5-flash`)을 호출하던 잔존 참조를 `AiGenerationTestModels.OPENAI_DEFAULT` / `GEMINI_DEFAULT` 상수로 교체해, env-gated live smoke 경로에서도 활성 카탈로그와 일치하도록 정렬했습니다.
```

- [ ] **Step 2: Stage and commit**

```bash
git add CHANGELOG.md \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiApiClientLiveContractTest.kt \
  server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiClientLiveContractTest.kt \
  docs/superpowers/specs/2026-05-17-aigen-live-contract-model-id-followup-design.md \
  docs/superpowers/plans/2026-05-17-aigen-live-contract-model-id-followup-implementation-plan.md

git commit -m "$(cat <<'EOF'
fix(aigen): align live-contract smoke tests with active model catalog

OpenAiApiClientLiveContractTest and GeminiApiClientLiveContractTest still
called gpt-4o-mini / gemini-2.5-flash after the gpt-5.4-mini + gemini-3-flash
catalog refresh (68fc7f91). The tests are gated by @EnabledIfEnvironmentVariable
so they skip silently in CI; the drift only surfaces when an operator runs the
live-API smoke. Replace the hardcoded literals with AiGenerationTestModels
constants, inheriting the single-file-edit property for future swaps.

Gap surfaced by retroactively applying superpowers:brainstorming +
writing-plans to the previous commit. Spec and plan added under
docs/superpowers/.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Verify commit**

Run: `git log -1 --stat`
Expected: 5 files changed (CHANGELOG.md + 2 .kt + spec + plan).

---

## Self-Review

**Spec coverage:**
- Spec "Fix" section → Task 1 + Task 2 ✓
- Spec "Verification" → Task 3 ✓
- Spec "Out of Scope" (Claude live test, ClubAiDefaults negative cases) → not touched, as required ✓
- Spec "Process Note" → reflected in commit message ✓

**Placeholder scan:** none of "TBD/TODO/Similar to Task N/Add appropriate error handling" present.

**Type consistency:** `AiGenerationTestModels.OPENAI_DEFAULT` / `GEMINI_DEFAULT` are the exact public symbols already declared in `server/src/test/kotlin/com/readmates/aigen/support/AiGenerationTestModels.kt:14-15`. Verified against the file read during brainstorming.
