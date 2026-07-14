package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.AiGenerationClubDefaultPort
import com.readmates.aigen.application.port.out.ClubDefault
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.config.AiGenerationProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class ListGenerationModelsServiceTest {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000101")
    private val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000102")
    private val openAi = ModelId(Provider.OPENAI, "gpt-5.4-mini")
    private val claude = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")
    private val gemini = ModelId(Provider.GEMINI, "gemini-3-flash-preview")
    private val unverified = ModelId(Provider.CLAUDE, "claude-opus-4-7")
    private val unitPricing = ModelPricing(BigDecimal.ONE, BigDecimal.ZERO, BigDecimal.ONE)

    @Test
    fun `lists enabled priced structured capable models in stable provider order`() {
        val service = service(defaultModel = "claude-opus-4-7")

        val models = service.list(sessionId, clubId)

        assertThat(models.map { it.id }).containsExactly(openAi.name, claude.name, gemini.name)
        assertThat(models.single { it.isDefault }.id).isEqualTo(openAi.name)
    }

    @Test
    fun `excludes model when structured output capability is false`() {
        val models = service(defaultModel = null, structuredUnsupported = setOf(gemini)).list(sessionId, clubId)

        assertThat(models.map { it.id }).containsExactly(openAi.name, claude.name)
    }

    @Test
    fun `marks canonical model default when stored default uses rolling compatibility alias`() {
        val models = service(defaultModel = "gemini-3-flash").list(sessionId, clubId)

        assertThat(models.map { it.id }).doesNotContain("gemini-3-flash")
        assertThat(models.single { it.isDefault }.id).isEqualTo(gemini.name)
    }

    private fun service(
        defaultModel: String?,
        structuredUnsupported: Set<ModelId> = emptySet(),
    ) = ListGenerationModelsService(
        clubDefaultPort =
            object : AiGenerationClubDefaultPort {
                override fun load(clubId: UUID): ClubDefault? =
                    defaultModel?.let {
                        ClubDefault(clubId, it, Instant.EPOCH, UUID.randomUUID())
                    }

                override fun upsert(
                    clubId: UUID,
                    defaultModel: String,
                    updatedBy: UUID,
                ) = Unit
            },
        modelCatalog =
            object : ModelCatalog {
                override fun allowlisted(): List<ModelId> = listOf(claude, unverified, gemini, openAi)

                override fun pricing(id: ModelId): ModelPricing = unitPricing

                override fun resolveAlias(alias: String): ModelId? =
                    allowlisted().find { it.name == alias }
                        ?: gemini.takeIf { alias == "gemini-3-flash" }

                override fun isEnabled(id: ModelId): Boolean = id in allowlisted()
            },
        capabilityCatalog =
            ModelCapabilityCatalog { model ->
                if (model == unverified) {
                    null
                } else {
                    ModelCapability(1_000_000, 64_000, model !in structuredUnsupported)
                }
            },
        properties =
            AiGenerationProperties(
                fallbackDefaultModel = openAi.name,
                grounded = AiGenerationProperties.Grounded(reservedOutputTokens = 16_384),
            ),
    )
}
