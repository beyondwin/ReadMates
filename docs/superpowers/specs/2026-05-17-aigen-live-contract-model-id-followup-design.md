# AI Generation Live Contract Test — Model ID Follow-up

**Status**: Approved
**Date**: 2026-05-17
**Scope**: Single follow-up commit to close gap discovered while retroactively applying the brainstorming/writing-plans skill protocol to commit `68fc7f91 feat(aigen): refresh model catalog to gpt-5.4-mini + gemini-3-flash`.

## Problem

The PR that swapped OpenAI/Gemini provider defaults to `gpt-5.4-mini` / `gemini-3-flash` updated 18 files and passed full local verification (`./gradlew check`, integration tests, frontend, public-release bundle, PII invariants). However, two live-contract test files retained the previous model IDs:

| File | Stale value | Should be |
|---|---|---|
| `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/openai/OpenAiApiClientLiveContractTest.kt:52` | `"gpt-4o-mini"` | OpenAI default |
| `server/src/test/kotlin/com/readmates/aigen/adapter/out/llm/gemini/GeminiApiClientLiveContractTest.kt:52` | `"gemini-2.5-flash"` | Gemini default |

These tests are gated by `@EnabledIfEnvironmentVariable(named = API_KEY_ENV, matches = ".+")` and therefore skip silently in CI and on any developer machine without provider API keys. The miss was not detectable by `./gradlew check`, integration tests, or the public-release smoke. The bug only manifests when an operator runs the live-API smoke after provisioning a real API key — at which point the test will call a model not present in `application.yml`'s pricing catalog.

## Root Cause

The original change relied on a directed file-by-file Edit workflow and did not perform a global grep enumeration of stale model IDs. The two live-contract files were not on the touched-file list because they neither imported `AiGenerationTestModels` nor were referenced by the verification commands.

## Fix

Replace the two hardcoded strings with the shared constants from `AiGenerationTestModels`, which `gpt-5.4-mini` / `gemini-3-flash` already populate. This both fixes the regression and inherits the structural improvement: future model swaps remain a single-file edit.

```kotlin
// OpenAiApiClientLiveContractTest.kt
import com.readmates.aigen.support.AiGenerationTestModels
//...
model = AiGenerationTestModels.OPENAI_DEFAULT,
```

```kotlin
// GeminiApiClientLiveContractTest.kt
import com.readmates.aigen.support.AiGenerationTestModels
//...
model = AiGenerationTestModels.GEMINI_DEFAULT,
```

## Out of Scope

- `ClaudeApiClientLiveContractTest.kt:50` uses a dated snapshot ID (`claude-sonnet-4-5-20250929`) rather than the alias `claude-sonnet-4-6`. This is a deliberate pattern difference that predates this PR and should be discussed separately.
- `ClubAiDefaultsServiceTest.kt:96` and `ClubAiDefaultsControllerTest.kt:134` keep `"gpt-4o"` as a *deliberately non-allowlisted* model name to exercise the AI_DISABLED rejection path. These are not stale — replacing them would weaken the test's negative-case clarity.

## Verification

`./gradlew check` cannot prove anything here (the tests are env-gated). Verification therefore consists of:

1. `./gradlew :server:compileTestKotlin` — compile passes
2. `./gradlew :server:unitTest` — both live-contract classes report `0 executed / 1 skipped`
3. Final grep — `grep -rn "gpt-4o-mini\|gemini-2\.5-flash" server/src/test` returns 0 results

## Process Note

This follow-up was produced by retroactively applying the `superpowers:brainstorming` skill protocol to the previous session. The discovery method — global grep of legacy model IDs — is precisely the kind of step a `writing-plans` checklist would have enumerated before editing. Adding "global grep of all stale model ID strings" to the project's mental template for "swap a provider model" task class would prevent this regression class in future swaps.
