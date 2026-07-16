package com.readmates.aigen.config

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.application.service.ProviderFallbackChain
import com.readmates.aigen.application.service.Sleeper
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.Primary

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationBeansConfig {
    @Bean
    fun providerFallbackChain(
        modelCatalog: ModelCatalog,
        properties: AiGenerationProperties,
    ): ProviderFallbackChain = ProviderFallbackChain(modelCatalog, properties)

    @Bean
    @Primary
    fun wholeTranscriptGroundedGeneratorsByProvider(
        generators: List<WholeTranscriptGroundedGenerator>,
        properties: AiGenerationProperties,
        @Qualifier("springAiGroundedGeneratorsByProvider")
        springAiGenerators: ObjectProvider<Map<Provider, WholeTranscriptGroundedGenerator>>,
    ): Map<Provider, WholeTranscriptGroundedGenerator> {
        val byProvider =
            (generators + springAiGenerators.getIfAvailable(::emptyMap).values)
                .associateBy(WholeTranscriptGroundedGenerator::provider)
        return validateGroundedGenerators(byProvider, properties)
    }

    internal fun validateGroundedGenerators(
        byProvider: Map<Provider, WholeTranscriptGroundedGenerator>,
        properties: AiGenerationProperties,
    ): Map<Provider, WholeTranscriptGroundedGenerator> {
        val enabledProviders = properties.enabledProviders.map(Provider::valueOf).toSet()
        require(byProvider.keys.containsAll(enabledProviders)) {
            "Grounded generator missing for an enabled provider"
        }
        return byProvider
    }

    @Bean
    fun aiGenerationSleeper(): Sleeper = Sleeper.Default
}
