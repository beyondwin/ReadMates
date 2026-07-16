package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.config.AiGenerationProperties
import org.slf4j.LoggerFactory

/**
 * Resolves the next provider's model to try when an availability failure occurs.
 * Pure over [AiGenerationProperties.fallbackChain] + [modelCatalog] + available [generators].
 * Empty chain = feature off (caller keeps same-provider retry).
 */
class ProviderFallbackChain(
    private val modelCatalog: ModelCatalog,
    private val properties: AiGenerationProperties,
) {
    private val logger = LoggerFactory.getLogger(ProviderFallbackChain::class.java)

    init {
        // Best-effort startup warning: unresolved chain entries are skipped at
        // runtime, but a typo or env-specific allowlist gap is worth surfacing.
        properties.fallbackChain
            .filter { alias -> modelCatalog.resolveAlias(alias) == null }
            .forEach { alias ->
                logger.warn(
                    "readmates.aigen.fallbackChain entry '{}' does not resolve to an " +
                        "allowlisted model; it will be skipped.",
                    alias,
                )
            }
    }

    fun nextEligibleGrounded(
        failed: ModelId,
        persistedCandidates: List<ModelId>,
        groundedGenerators: Map<Provider, WholeTranscriptGroundedGenerator>,
    ): ModelId? =
        persistedCandidates.firstOrNull { candidate ->
            candidate.provider != failed.provider &&
                modelCatalog.isEnabled(candidate) &&
                modelCatalog.allowlisted().contains(candidate) &&
                groundedGenerators.containsKey(candidate.provider)
        }
}
