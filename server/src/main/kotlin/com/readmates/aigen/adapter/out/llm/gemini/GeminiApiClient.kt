package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Live [GeminiApiPort] adapter backed by `com.google.genai:google-genai:1.53.0`.
 *
 * Resolves the API key from `READMATES_AIGEN_GEMINI_API_KEY` at the
 * first call site so the bean still loads in test contexts where the
 * env var is unset. The actual `client.models().generateContent(...)`
 * wiring — `generationConfig.responseMimeType = "application/json"`,
 * `generationConfig.responseSchema = <Gemini OpenAPI 3.0 subset>`,
 * `disablePromptLogging = true` for no data retention (spec §5.7),
 * and `UsageMetadata` parsing — is deferred to a follow-up task that
 * introduces an integration test with a real API key. Phase 5 unit
 * tests exercise the contract via [FakeGeminiApi] against
 * [GeminiApiPort] directly. Mirrors the Claude/OpenAI adapter pattern
 * established in tasks 1.6 and 4.2.
 *
 * Retention contract (spec §5.7):
 *  - Live SDK call MUST be issued with the SDK's "no retention" /
 *    "disable prompt logging" flag set so Google does not retain
 *    prompts/responses for product improvement.
 *  - On google-genai 1.53.0 this is exposed as the request-level
 *    `disablePromptLogging` toggle on `GenerateContentConfig` (or, if
 *    that field is renamed in a later patch release, its functional
 *    equivalent — the data-policy header / per-call no-retention
 *    option). The wiring task MUST verify the chosen flag is honoured
 *    by the SDK before declaring done.
 *
 * Gated behind `readmates.aigen.enabled=true` AND
 * `readmates.aigen.mock != true` so the `aigen-mock` profile can swap
 * in a stub.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@ConditionalOnProperty(
    prefix = "readmates.aigen",
    name = ["mock"],
    havingValue = "false",
    matchIfMissing = true,
)
open class GeminiApiClient : GeminiApiPort {
    @Suppress("LongParameterList")
    override fun callResponseSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        responseSchema: ObjectNode,
    ): GeminiToolResult {
        val apiKey = System.getenv(API_KEY_ENV)
        check(!apiKey.isNullOrBlank()) {
            "$API_KEY_ENV not set; required when readmates.aigen.enabled=true and mock=false"
        }
        // Live SDK call wiring (generationConfig.responseSchema + disablePromptLogging
        // for no data retention per spec §5.7, plus UsageMetadata parsing) is
        // intentionally TODO until a follow-up integration test lands.
        // Unit tests in task 5.3 cover the generator/regenerator contract via a
        // fake GeminiApiPort.
        throw NotImplementedError(
            "Gemini live SDK wiring deferred to operations milestone — " +
                "task_5_4 manual smoke will validate live integration. " +
                "Covered by FakeGeminiApi in unit tests until then.",
        )
    }

    companion object {
        const val API_KEY_ENV: String = "READMATES_AIGEN_GEMINI_API_KEY"
    }
}
