package com.readmates.aigen.config

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.SessionContentGenerator
import com.readmates.aigen.application.port.out.SessionContentRegenerator
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.application.service.ProviderFallbackChain
import com.readmates.aigen.application.service.Sleeper
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/**
 * Wires the AI generation domain-service dependencies that need composite
 * bean construction:
 *
 *  - `Map<Provider, SessionContentGenerator>` — grouped by provider so the
 *    worker can route by [Provider]. Built from the full
 *    `List<SessionContentGenerator>` discovered by Spring.
 *  - `Map<Provider, SessionContentRegenerator>` — analogous, for the
 *    synchronous regeneration service.
 *  - [Sleeper] — production indirection over `Thread.sleep` so retry loops
 *    don't actually block on the JVM scheduler in unit tests. The
 *    `Sleeper.Default` instance just calls `Thread.sleep`.
 *
 * `java.time.Clock` is already provided by
 * `com.readmates.shared.InfrastructureConfig`, so no Clock bean is declared here.
 *
 * Only active when `readmates.aigen.enabled=true`.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationBeansConfig {
    @Bean
    fun sessionContentGeneratorsByProvider(generators: List<SessionContentGenerator>): Map<Provider, SessionContentGenerator> =
        generators.associateBy { it.provider }

    @Bean
    fun sessionContentRegeneratorsByProvider(regenerators: List<SessionContentRegenerator>): Map<Provider, SessionContentRegenerator> =
        regenerators.associateBy { it.provider }

    @Bean
    fun providerFallbackChain(
        sessionContentGeneratorsByProvider: Map<Provider, SessionContentGenerator>,
        modelCatalog: ModelCatalog,
        properties: AiGenerationProperties,
    ): ProviderFallbackChain =
        ProviderFallbackChain(
            generators = sessionContentGeneratorsByProvider,
            modelCatalog = modelCatalog,
            properties = properties,
        )

    @Bean
    fun wholeTranscriptGroundedGeneratorsByProvider(
        generators: List<WholeTranscriptGroundedGenerator>,
        properties: AiGenerationProperties,
    ): Map<Provider, WholeTranscriptGroundedGenerator> {
        val byProvider = generators.associateBy { it.provider }
        if (properties.pipelineMode == AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT) {
            val enabledProviders = properties.enabledProviders.map(Provider::valueOf).toSet()
            require(byProvider.keys.containsAll(enabledProviders)) {
                "Grounded generator missing for an enabled provider"
            }
        }
        return byProvider
    }

    @Bean
    fun aiGenerationSleeper(): Sleeper = Sleeper.Default
}
