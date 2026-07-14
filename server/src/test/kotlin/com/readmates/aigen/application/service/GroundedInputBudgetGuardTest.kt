package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.GroundedRenderRequest
import com.readmates.aigen.application.port.out.GroundedRequestRenderer
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.config.AiGenerationProperties
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class GroundedInputBudgetGuardTest {
    private val selected = ModelId(Provider.OPENAI, "primary-model")
    private val fits = ModelId(Provider.CLAUDE, "fits-model")
    private val tooSmall = ModelId(Provider.GEMINI, "small-model")
    private val request =
        GroundedRenderRequest(
            provider = Provider.OPENAI,
            sessionMeta =
                SessionMeta(
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    1,
                    "Public Test Book",
                    null,
                    LocalDate.parse("2026-07-14"),
                    listOf("Alice"),
                    AuthorNameMode.REAL,
                ),
            turns = listOf(ValidatedTranscriptTurn("t000001", "Alice", UUID.randomUUID(), 0, "A public-safe thought")),
        )
    private val rendered = RenderedGroundedRequest("system", "user", "schema", 16_384)
    private val renderer = GroundedRequestRenderer { rendered }

    @Test
    fun `budget uses the exact provider request rendered for generation`() {
        val guard = guard(mapOf(selected to capability(40_000)))

        val decision = guard.evaluate(request, selected, emptyList())

        assertSame(rendered, decision.renderedRequest)
        assertEquals(selected, decision.selectedModel)
        assertEquals(16, decision.estimatedInputTokens)
    }

    @Test
    fun `unknown capability fails closed`() {
        val error =
            assertThrows(AiGenerationException.Coded::class.java) {
                guard(emptyMap()).evaluate(request, selected, emptyList())
            }

        assertEquals(ErrorCode.MODEL_CAPABILITY_UNAVAILABLE, error.code)
    }

    @Test
    fun `oversized selected request fails even when no fallback fits`() {
        val guard = guard(mapOf(selected to capability(24_590), tooSmall to capability(24_590)))
        val error =
            assertThrows(AiGenerationException.Coded::class.java) {
                guard.evaluate(request, selected, listOf(tooSmall))
            }

        assertEquals(ErrorCode.TRANSCRIPT_TOO_LONG_FOR_MODEL, error.code)
    }

    @Test
    fun `fallback list preserves order and contains only models fitting entire request`() {
        val secondFit = ModelId(Provider.OPENAI, "second-fit")
        val guard =
            guard(
                mapOf(
                    selected to capability(40_000),
                    tooSmall to capability(24_590),
                    fits to capability(40_000),
                    secondFit to capability(40_000),
                ),
            )

        val decision = guard.evaluate(request, selected, listOf(tooSmall, fits, secondFit, fits))

        assertEquals(listOf(fits), decision.eligibleFallbackModels)
    }

    @Test
    fun `structured output and output reserve are required for selected model`() {
        val unsupported = ModelCapability(40_000, 16_384, false)
        val error =
            assertThrows(AiGenerationException.Coded::class.java) {
                guard(mapOf(selected to unsupported)).evaluate(request, selected, emptyList())
            }

        assertEquals(ErrorCode.MODEL_CAPABILITY_UNAVAILABLE, error.code)
    }

    private fun guard(capabilities: Map<ModelId, ModelCapability>) =
        GroundedInputBudgetGuard(
            renderer = renderer,
            capabilityCatalog = ModelCapabilityCatalog { capabilities[it] },
            properties =
                AiGenerationProperties(
                    grounded =
                        AiGenerationProperties.Grounded(
                            reservedOutputTokens = 16_384,
                            safetyMarginTokens = 8_192,
                        ),
                ),
        )

    private fun capability(context: Long) = ModelCapability(context, 16_384, true)
}
