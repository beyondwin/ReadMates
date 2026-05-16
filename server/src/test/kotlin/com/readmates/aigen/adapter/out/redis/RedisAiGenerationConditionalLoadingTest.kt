package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.service.AiGenerationMetrics
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.data.redis.core.StringRedisTemplate

/**
 * Verifies that the Redis-backed aigen adapters are only loaded when both
 * `readmates.redis.enabled` and `readmates.aigen.enabled` are true. When either
 * flag is off the beans are absent, and the orchestrator's API surface is
 * expected to return 503 in those configurations.
 */
class RedisAiGenerationConditionalLoadingTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(AdapterBeanTestConfiguration::class.java)

    @Test
    fun `loads adapters when both redis and aigen are enabled`() {
        contextRunner
            .withPropertyValues(
                "readmates.redis.enabled=true",
                "readmates.aigen.enabled=true",
            ).run { context ->
                assertThat(context).hasSingleBean(RedisAiGenerationJobStore::class.java)
                assertThat(context).hasSingleBean(RedisGenerationCostCounters::class.java)
            }
    }

    @Test
    fun `does not load adapters when redis is disabled`() {
        contextRunner
            .withPropertyValues(
                "readmates.redis.enabled=false",
                "readmates.aigen.enabled=true",
            ).run { context ->
                assertThat(context).doesNotHaveBean(RedisAiGenerationJobStore::class.java)
                assertThat(context).doesNotHaveBean(RedisGenerationCostCounters::class.java)
            }
    }

    @Test
    fun `does not load adapters when aigen is disabled`() {
        contextRunner
            .withPropertyValues(
                "readmates.redis.enabled=true",
                "readmates.aigen.enabled=false",
            ).run { context ->
                assertThat(context).doesNotHaveBean(RedisAiGenerationJobStore::class.java)
                assertThat(context).doesNotHaveBean(RedisGenerationCostCounters::class.java)
            }
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AiGenerationProperties::class)
    @Import(
        RedisAiGenerationJobStore::class,
        RedisGenerationCostCounters::class,
        RedisCacheMetrics::class,
        AiGenerationMetrics::class,
    )
    class AdapterBeanTestConfiguration {
        @Bean
        fun redisTemplate(): StringRedisTemplate = Mockito.mock(StringRedisTemplate::class.java)

        @Bean
        fun meterRegistry(): MeterRegistry = SimpleMeterRegistry()
    }
}
