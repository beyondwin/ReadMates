package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.`in`.AvailableGenerationModel
import com.readmates.aigen.application.port.`in`.ListGenerationModelsUseCase
import com.readmates.aigen.application.port.out.AiGenerationClubDefaultPort
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.util.UUID

@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class ListGenerationModelsService(
    private val clubDefaultPort: AiGenerationClubDefaultPort,
    private val modelCatalog: ModelCatalog,
    private val capabilityCatalog: ModelCapabilityCatalog,
    private val properties: AiGenerationProperties,
) : ListGenerationModelsUseCase {
    override fun list(
        sessionId: UUID,
        clubId: UUID,
    ): List<AvailableGenerationModel> {
        val eligible =
            modelCatalog
                .allowlisted()
                .filter { model ->
                    capabilityCatalog.find(model)?.let { capability ->
                        capability.structuredOutputSupported &&
                            properties.grounded.reservedOutputTokens <= capability.maxOutputTokens
                    } == true
                }.sortedWith(compareBy({ PROVIDER_ORDER.getValue(it.provider) }, { it.name }))
        val storedDefault = clubDefaultPort.load(clubId)?.defaultModel
        val defaultName =
            storedDefault?.takeIf { candidate -> eligible.any { it.name == candidate } }
                ?: properties.fallbackDefaultModel.takeIf { candidate -> eligible.any { it.name == candidate } }
                ?: eligible.firstOrNull()?.name

        return eligible.map { model ->
            AvailableGenerationModel(
                id = model.name,
                provider = model.provider,
                isDefault = model.name == defaultName,
            )
        }
    }

    private companion object {
        private val PROVIDER_ORDER = mapOf(Provider.OPENAI to 0, Provider.CLAUDE to 1, Provider.GEMINI to 2)
    }
}
