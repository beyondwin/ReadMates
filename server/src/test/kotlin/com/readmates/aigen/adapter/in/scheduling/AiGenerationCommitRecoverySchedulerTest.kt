@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.scheduling

import com.readmates.aigen.application.port.`in`.AiGenerationCommitRecoveryResult
import com.readmates.aigen.application.port.`in`.RecoverAiGenerationCommitsUseCase
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AiGenerationCommitRecoverySchedulerTest {
    @Test
    fun `scheduled recovery delegates the fixed batch size to the input port once`() {
        val recovery = RecordingCommitRecovery()

        AiGenerationCommitRecoveryScheduler(recovery).recover()

        assertThat(recovery.limits).containsExactly(50)
    }

    private class RecordingCommitRecovery : RecoverAiGenerationCommitsUseCase {
        val limits = mutableListOf<Int>()

        override fun recoverBatch(limit: Int): List<AiGenerationCommitRecoveryResult> {
            limits += limit
            return emptyList()
        }
    }
}
