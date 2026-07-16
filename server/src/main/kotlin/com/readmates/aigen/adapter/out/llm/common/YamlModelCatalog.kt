package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.config.AiGenerationProperties
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * YAML-backed [ModelCatalog] implementation.
 *
 * Builds the catalog eagerly from [AiGenerationProperties.pricing] entries by deriving the
 * [Provider] from the model name prefix:
 *
 *   - `claude-*` -> [Provider.CLAUDE]
 *   - `gpt-*`, `o1`, `o3`, `o4`, ... -> [Provider.OPENAI]
 *   - `gemini-*` -> [Provider.GEMINI]
 *
 * Models whose name does not match a known prefix are logged at WARN and skipped.
 *
 * A model is "allowlisted" iff its derived provider is also listed in
 * [AiGenerationProperties.enabledProviders] (compared case-insensitively to [Provider.name]).
 * An empty `enabledProviders` set acts as a kill switch — [allowlisted] returns empty.
 *
 * [resolveAlias] accepts canonical allowlisted names plus the narrow compatibility aliases in
 * [COMPATIBILITY_ALIASES]. Compatibility aliases never become catalog or pricing entries, and
 * resolve only while their canonical target is allowlisted. This lets a newly deployed server
 * accept defaults cached or stored by the previous version without ever calling a provider with
 * the obsolete identifier.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class YamlModelCatalog(
    private val properties: AiGenerationProperties,
) : ModelCatalog {
    private val log = LoggerFactory.getLogger(YamlModelCatalog::class.java)

    private val enabledProviderSet: Set<Provider> =
        properties.enabledProviders
            .mapNotNull { raw ->
                runCatching { Provider.valueOf(raw.uppercase()) }
                    .onFailure { log.warn("Unknown provider in enabled-providers: {}", raw) }
                    .getOrNull()
            }.toSet()

    /** All pricing entries with a resolvable provider, regardless of enabledProviders. */
    private val catalog: Map<ModelId, ModelPricing> =
        properties.pricing
            .mapNotNull { (name, p) ->
                val provider = providerFromName(name)
                if (provider == null) {
                    log.warn("Unknown model name prefix '{}' in readmates.aigen.pricing — skipping", name)
                    null
                } else {
                    ModelId(provider, name) to
                        ModelPricing(
                            inputPerMTokenUsd = p.inputPerMTokenUsd,
                            cacheWriteInputPerMTokenUsd = p.cacheWriteInputPerMTokenUsd ?: p.inputPerMTokenUsd,
                            cachedInputPerMTokenUsd = p.cachedInputPerMTokenUsd,
                            outputPerMTokenUsd = p.outputPerMTokenUsd,
                        )
                }
            }.toMap()

    private val allowlistedSet: Set<ModelId> =
        catalog.keys
            .filter { it.provider in enabledProviderSet }
            .toSet()

    private val allowlistedByName: Map<String, ModelId> = allowlistedSet.associateBy { it.name }

    override fun allowlisted(): List<ModelId> = allowlistedSet.toList()

    override fun pricing(id: ModelId): ModelPricing =
        catalog[id]
            ?: error("No pricing entry for model $id; not in readmates.aigen.pricing catalog")

    override fun resolveAlias(alias: String): ModelId? =
        allowlistedByName[alias]
            ?: COMPATIBILITY_ALIASES[alias]?.takeIf { it in allowlistedSet }

    override fun isEnabled(id: ModelId): Boolean = id in allowlistedSet && id.provider in enabledProviderSet

    private fun providerFromName(name: String): Provider? =
        when {
            name.startsWith("claude-") -> Provider.CLAUDE
            name.startsWith("gemini-") -> Provider.GEMINI
            name.startsWith("gpt-") -> Provider.OPENAI
            // OpenAI "o-series": o1, o1-mini, o3, o3-mini, o4, ...
            OPENAI_O_SERIES_REGEX.matches(name) -> Provider.OPENAI
            else -> null
        }

    private companion object {
        private val OPENAI_O_SERIES_REGEX = Regex("^o\\d.*")

        private val COMPATIBILITY_ALIASES =
            mapOf(
                "gemini-3-flash" to ModelId(Provider.GEMINI, "gemini-3-flash-preview"),
            )
    }
}
