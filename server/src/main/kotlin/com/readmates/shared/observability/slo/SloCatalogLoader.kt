package com.readmates.shared.observability.slo

import com.fasterxml.jackson.core.JacksonException
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.PropertyNamingStrategies
import com.fasterxml.jackson.databind.SerializationFeature
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.fasterxml.jackson.module.kotlin.KotlinModule
import com.fasterxml.jackson.module.kotlin.readValue
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

class SloCatalogLoader {
    private val mapper: ObjectMapper =
        ObjectMapper(YAMLFactory())
            .registerModule(KotlinModule.Builder().build())
            .setPropertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE)
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)

    fun loadFromClasspath(path: String): SloCatalog {
        val stream =
            SloCatalogLoader::class.java.getResourceAsStream(path)
                ?: error("SLO catalog not found on classpath: $path")
        val catalog: SloCatalog =
            try {
                mapper.readValue(stream)
            } catch (e: JacksonException) {
                throw IllegalStateException("Failed to parse SLO catalog at $path: ${e.message}", e)
            }
        validate(catalog)
        return catalog
    }

    fun loadFromString(yaml: String): SloCatalog {
        val catalog: SloCatalog =
            try {
                mapper.readValue(yaml)
            } catch (e: JacksonException) {
                throw IllegalStateException("Failed to parse SLO catalog: ${e.message}", e)
            }
        validate(catalog)
        return catalog
    }

    private fun validate(catalog: SloCatalog) {
        check(catalog.version == 1) { "Unsupported SLO catalog version: ${catalog.version}" }
        check(catalog.slos.isNotEmpty()) { "SLO catalog must define at least one SLO" }
        val ids = mutableSetOf<String>()
        for (slo in catalog.slos) {
            check(slo.id.matches(Regex("^[a-z][a-z0-9_]+$"))) { "Invalid SLO id: ${slo.id}" }
            check(ids.add(slo.id)) { "Duplicate SLO id: ${slo.id}" }
            check(slo.window.matches(Regex("^[0-9]+[dhm]$"))) { "Invalid window for ${slo.id}: ${slo.window}" }
            check(slo.objective != null || slo.objectiveMs != null) {
                "${slo.id} must declare objective or objective_ms"
            }
            slo.objective?.let { check(it in 0.0..1.0) { "${slo.id} objective must be 0..1" } }
            check(slo.sli.type == "prometheus") { "${slo.id} unsupported sli.type: ${slo.sli.type}" }
            val ratioOk = slo.sli.queryGood != null && slo.sli.queryTotal != null
            val latencyOk = slo.sli.queryLatencyP95 != null
            check(ratioOk || latencyOk) { "${slo.id} sli must declare ratio or latency_p95 queries" }
        }
    }
}

@Configuration
class SloCatalogConfiguration {
    @Bean
    fun sloCatalog(): SloCatalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
}
