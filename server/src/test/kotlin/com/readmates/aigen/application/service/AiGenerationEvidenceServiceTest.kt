package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.GroundedEvidenceExcerpt
import com.readmates.aigen.application.model.GroundedEvidenceTarget
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.util.UUID

class AiGenerationEvidenceServiceTest {
    @Test
    fun `expands one current referenced turn with control characters sanitized`() {
        val context = Context()

        val expanded = context.service.expand(context.record.sessionId, context.record.jobId, REFERENCED_TURN, 1)

        assertThat(expanded.turnId).isEqualTo(REFERENCED_TURN)
        assertThat(expanded.text).isEqualTo("A complete public-safe source turn.")
    }

    @Test
    fun `rejects an unreferenced turn even when it exists in current transcript`() {
        val context = Context()

        assertThatThrownBy {
            context.service.expand(context.record.sessionId, context.record.jobId, UNREFERENCED_TURN, 1)
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { failure ->
            assertThat(failure.code).isEqualTo(ErrorCode.JOB_EXPIRED)
        }
    }

    @Test
    fun `rejects a previous revision before resolving any turn`() {
        val context = Context()

        assertThatThrownBy {
            context.service.expand(context.record.sessionId, context.record.jobId, REFERENCED_TURN, 0)
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { failure ->
            assertThat(failure.code).isEqualTo(ErrorCode.STALE_GENERATION_REVISION)
        }
    }

    private class Context {
        val store = FakeJobStore()
        val record =
            AiGenerationTestFixtures
                .jobRecord(status = JobStatus.SUCCEEDED)
                .copy(
                    revision = 1,
                    groundingStatus = GroundingStatus.VALID,
                    validatedTurns =
                        listOf(
                            turn(REFERENCED_TURN, "A complete\u0000 public-safe source turn."),
                            turn(UNREFERENCED_TURN, "A different public-safe turn."),
                        ),
                    evidence =
                        GroundedEvidenceBundle(
                            1,
                            listOf(
                                GroundedEvidenceTarget(
                                    "r1:SUMMARY:0",
                                    GenerationItem.SUMMARY,
                                    0,
                                    listOf(REFERENCED_TURN),
                                ),
                            ),
                            listOf(GroundedEvidenceExcerpt(REFERENCED_TURN, "Alice", 0, "preview", true)),
                        ),
                ).also(store::save)
        val service = AiGenerationEvidenceService(store)

        private fun turn(
            id: String,
            text: String,
        ) = ValidatedTranscriptTurn(id, "Alice", UUID.randomUUID(), 0, text)
    }

    private companion object {
        const val REFERENCED_TURN = "t000001"
        const val UNREFERENCED_TURN = "t000002"
    }
}
