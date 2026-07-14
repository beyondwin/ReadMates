package com.readmates.aigen.config

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class AiGenerationBeansConfigTest {
    private val config = AiGenerationBeansConfig()

    @Test
    fun `grounded mode fails startup when an enabled provider has no grounded adapter`() {
        val properties =
            AiGenerationProperties(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                enabledProviders = setOf("CLAUDE"),
            )

        assertThatThrownBy {
            config.wholeTranscriptGroundedGeneratorsByProvider(emptyList(), properties)
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Grounded generator missing for an enabled provider")
    }

    @Test
    fun `legacy mode does not require grounded adapters`() {
        val result =
            config.wholeTranscriptGroundedGeneratorsByProvider(
                emptyList(),
                AiGenerationProperties(pipelineMode = AiGenerationPipelineMode.LEGACY),
            )

        assertThat(result).isEmpty()
    }
}
