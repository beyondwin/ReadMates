package com.readmates.aigen.config

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.context.properties.bind.Binder
import org.springframework.boot.context.properties.source.ConfigurationPropertySources
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.MutablePropertySources
import org.springframework.mock.env.MockEnvironment
import java.math.BigDecimal
import java.time.Duration
import java.util.stream.Stream

/**
 * Verifies that application.yml binds correctly into AiGenerationProperties,
 * specifically that the canonical per-provider pricing entries are present
 * and structurally identical to existing Claude entries.
 */
class AiGenerationPropertiesTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(AiGenerationRuntimePropertiesConfiguration::class.java)

    private fun loadProperties(): AiGenerationProperties {
        val resource =
            org.springframework.core.io.FileSystemResource(
                java.io.File("src/main/resources/application.yml"),
            )
        check(resource.exists()) { "application.yml not found" }
        val sources = YamlPropertySourceLoader().load("application.yml", resource)
        val environment = MockEnvironment()
        sources.reversed().forEach { environment.propertySources.addFirst(it) }
        return Binder
            .get(environment)
            .bind("readmates.aigen", AiGenerationProperties::class.java)
            .get()
    }

    private fun loadPricing(): Map<String, AiGenerationProperties.Pricing> {
        // Load the production application.yml directly from the source tree (not the test
        // classpath, which has its own shadowing application.yml without aigen config).
        val resource =
            org.springframework.core.io.FileSystemResource(
                java.io.File("src/main/resources/application.yml"),
            )
        check(resource.exists()) { "application.yml not found at ${resource.file.absolutePath}" }
        val sources = YamlPropertySourceLoader().load("application.yml", resource)
        val mutable = MutablePropertySources()
        sources.forEach { mutable.addLast(it) }
        val binder = Binder(ConfigurationPropertySources.from(mutable))
        val pricingTarget =
            org.springframework.boot.context.properties.bind.Bindable
                .mapOf(String::class.java, AiGenerationProperties.Pricing::class.java)
        return binder.bind("readmates.aigen.pricing", pricingTarget).get()
    }

    private fun loadKafkaProperties(): AiGenerationKafkaProperties {
        val resource =
            org.springframework.core.io.FileSystemResource(
                java.io.File("src/main/resources/application.yml"),
            )
        check(resource.exists()) { "application.yml not found" }
        val sources = YamlPropertySourceLoader().load("application.yml", resource)
        val environment = MockEnvironment()
        sources.reversed().forEach { environment.propertySources.addFirst(it) }
        return Binder
            .get(environment)
            .bind("readmates.aigen.kafka", AiGenerationKafkaProperties::class.java)
            .get()
    }

    @Test
    fun `application yml keeps legacy default and binds grounded reservation`() {
        val properties = loadProperties()

        assertEquals(16_384L, properties.grounded.reservedOutputTokens)
        assertEquals(8_192L, properties.grounded.safetyMarginTokens)
    }

    @Test
    fun `application yml pins Kafka max poll interval to sixteen minutes`() {
        val properties = loadKafkaProperties()

        assertEquals(Duration.ofMinutes(16), properties.maxPollInterval)
        assertEquals(Duration.ofSeconds(5), properties.consumerRetryDelay)
        assertEquals(10, properties.consumerMaxAttempts)
    }

    @Test
    fun `application yml binds approved AI recovery defaults`() {
        val job = loadProperties().job

        assertEquals(Duration.ofHours(6), job.redisTtl)
        assertEquals(Duration.ofMinutes(20), job.processingDeadline)
        assertEquals(Duration.ofMinutes(1), job.recoveryFixedDelay)
        assertEquals(50, job.recoveryBatchSize)
        assertEquals(500, job.recoveryIndexRepairBatchSize)
        assertEquals(5_000, job.recoveryIndexRepairMaxMembers)
        assertEquals(Duration.ofSeconds(30), job.queueProbeFixedDelay)
    }

    @Test
    fun `application yml binds verified grounded capabilities`() {
        val capabilities = loadProperties().grounded.capabilities

        assertEquals(128_000L, capabilities["gpt-5.4-mini"]?.maxOutputTokens)
        assertEquals(128_000L, capabilities["claude-sonnet-4-6"]?.maxOutputTokens)
        assertEquals(65_536L, capabilities["gemini-3-flash-preview"]?.maxOutputTokens)
        assertTrue(capabilities.values.all { it.structuredOutputSupported })
    }

    @Test
    fun `application_yml binds OpenAI pricing entries with input cached and output rates`() {
        val pricing = loadPricing()

        val openaiMini = pricing["gpt-5.4-mini"]
        assertNotNull(openaiMini, "gpt-5.4-mini pricing must be present in application.yml")
        assertEquals(0, BigDecimal("0.75").compareTo(openaiMini!!.inputPerMTokenUsd))
        assertEquals(0, BigDecimal("0.75").compareTo(openaiMini.cacheWriteInputPerMTokenUsd!!))
        assertEquals(0, BigDecimal("0.075").compareTo(openaiMini.cachedInputPerMTokenUsd))
        assertEquals(0, BigDecimal("4.50").compareTo(openaiMini.outputPerMTokenUsd))
    }

    @Test
    fun `existing Claude pricing entries remain bound`() {
        val pricing = loadPricing()

        assertTrue(pricing.containsKey("claude-sonnet-4-6"))
        assertTrue(pricing.containsKey("claude-opus-4-7"))
        assertEquals(
            0,
            BigDecimal("3.75").compareTo(pricing.getValue("claude-sonnet-4-6").cacheWriteInputPerMTokenUsd!!),
        )
        assertEquals(
            0,
            BigDecimal("18.75").compareTo(pricing.getValue("claude-opus-4-7").cacheWriteInputPerMTokenUsd!!),
        )
    }

    @Test
    fun `application_yml binds Gemini pricing entries with input cached and output rates`() {
        val pricing = loadPricing()

        val geminiFlash = pricing["gemini-3-flash-preview"]
        assertNotNull(geminiFlash, "gemini-3-flash-preview pricing must be present in application.yml")
        assertEquals(0, BigDecimal("0.50").compareTo(geminiFlash!!.inputPerMTokenUsd))
        assertEquals(0, BigDecimal("0.50").compareTo(geminiFlash.cacheWriteInputPerMTokenUsd!!))
        assertEquals(0, BigDecimal("0.05").compareTo(geminiFlash.cachedInputPerMTokenUsd))
        assertEquals(0, BigDecimal("3.00").compareTo(geminiFlash.outputPerMTokenUsd))
    }

    @ParameterizedTest(name = "rejects {0}")
    @MethodSource("invalidRuntimeProperties")
    fun `invalid AI runtime properties fail startup with their property path`(
        expectedPath: String,
        propertyValues: Array<String>,
    ) {
        contextRunner.withPropertyValues(*propertyValues).run { context ->
            org.assertj.core.api.Assertions
                .assertThat(context)
                .hasFailed()
            org.assertj.core.api.Assertions
                .assertThat(context.startupFailure.allMessages())
                .contains(expectedPath)
        }
    }

    @Test
    fun `exact lower AI runtime boundaries bind without precision loss`() {
        contextRunner
            .withPropertyValues(
                "readmates.aigen.kafka.send-timeout=1ms",
                "readmates.aigen.kafka.max-poll-interval=1ms",
                "readmates.aigen.kafka.consumer-retry-delay=1ms",
                "readmates.aigen.kafka.consumer-max-attempts=1",
                "readmates.aigen.job.redis-ttl=1h",
                "readmates.aigen.job.processing-deadline=1m",
                "readmates.aigen.job.recovery-fixed-delay=1s",
                "readmates.aigen.job.recovery-batch-size=1",
                "readmates.aigen.job.recovery-index-repair-batch-size=1",
                "readmates.aigen.job.recovery-index-repair-max-members=1",
                "readmates.aigen.job.queue-probe-fixed-delay=1s",
                "readmates.aigen.job.max-llm-calls-per-job=1",
            ).run { context ->
                org.assertj.core.api.Assertions
                    .assertThat(context)
                    .hasNotFailed()
                val kafka = context.getBean(AiGenerationKafkaProperties::class.java)
                val job = context.getBean(AiGenerationProperties::class.java).job
                org.assertj.core.api.Assertions
                    .assertThat(kafka.sendTimeout)
                    .isEqualTo(Duration.ofMillis(1))
                org.assertj.core.api.Assertions
                    .assertThat(kafka.maxPollInterval)
                    .isEqualTo(Duration.ofMillis(1))
                org.assertj.core.api.Assertions
                    .assertThat(kafka.consumerRetryDelay)
                    .isEqualTo(Duration.ofMillis(1))
                org.assertj.core.api.Assertions
                    .assertThat(kafka.consumerMaxAttempts)
                    .isEqualTo(1)
                org.assertj.core.api.Assertions
                    .assertThat(job.redisTtl)
                    .isEqualTo(Duration.ofHours(1))
                org.assertj.core.api.Assertions
                    .assertThat(job.processingDeadline)
                    .isEqualTo(Duration.ofMinutes(1))
                org.assertj.core.api.Assertions
                    .assertThat(job.recoveryFixedDelay)
                    .isEqualTo(Duration.ofSeconds(1))
                org.assertj.core.api.Assertions
                    .assertThat(job.recoveryBatchSize)
                    .isEqualTo(1)
                org.assertj.core.api.Assertions
                    .assertThat(job.recoveryIndexRepairBatchSize)
                    .isEqualTo(1)
                org.assertj.core.api.Assertions
                    .assertThat(job.recoveryIndexRepairMaxMembers)
                    .isEqualTo(1)
                org.assertj.core.api.Assertions
                    .assertThat(job.queueProbeFixedDelay)
                    .isEqualTo(Duration.ofSeconds(1))
                org.assertj.core.api.Assertions
                    .assertThat(job.maxLlmCallsPerJob)
                    .isEqualTo(1)
            }
    }

    @Test
    fun `exact upper AI runtime boundaries bind without precision loss`() {
        contextRunner
            .withPropertyValues(
                "readmates.aigen.kafka.send-timeout=30s",
                "readmates.aigen.kafka.max-poll-interval=2147483647ms",
                "readmates.aigen.kafka.consumer-retry-delay=1m",
                "readmates.aigen.kafka.consumer-max-attempts=100",
                "readmates.aigen.job.redis-ttl=24h",
                "readmates.aigen.job.processing-deadline=2h",
                "readmates.aigen.job.recovery-fixed-delay=10m",
                "readmates.aigen.job.recovery-batch-size=500",
                "readmates.aigen.job.recovery-index-repair-batch-size=5000",
                "readmates.aigen.job.recovery-index-repair-max-members=50000",
                "readmates.aigen.job.queue-probe-fixed-delay=10m",
                "readmates.aigen.job.max-llm-calls-per-job=3",
            ).run { context ->
                org.assertj.core.api.Assertions
                    .assertThat(context)
                    .hasNotFailed()
                val kafka = context.getBean(AiGenerationKafkaProperties::class.java)
                val job = context.getBean(AiGenerationProperties::class.java).job
                org.assertj.core.api.Assertions
                    .assertThat(kafka.sendTimeout)
                    .isEqualTo(Duration.ofSeconds(30))
                org.assertj.core.api.Assertions
                    .assertThat(kafka.maxPollInterval)
                    .isEqualTo(Duration.ofMillis(Int.MAX_VALUE.toLong()))
                org.assertj.core.api.Assertions
                    .assertThat(kafka.consumerRetryDelay)
                    .isEqualTo(Duration.ofMinutes(1))
                org.assertj.core.api.Assertions
                    .assertThat(kafka.consumerMaxAttempts)
                    .isEqualTo(100)
                org.assertj.core.api.Assertions
                    .assertThat(job.redisTtl)
                    .isEqualTo(Duration.ofHours(24))
                org.assertj.core.api.Assertions
                    .assertThat(job.processingDeadline)
                    .isEqualTo(Duration.ofHours(2))
                org.assertj.core.api.Assertions
                    .assertThat(job.recoveryFixedDelay)
                    .isEqualTo(Duration.ofMinutes(10))
                org.assertj.core.api.Assertions
                    .assertThat(job.recoveryBatchSize)
                    .isEqualTo(500)
                org.assertj.core.api.Assertions
                    .assertThat(job.recoveryIndexRepairBatchSize)
                    .isEqualTo(5_000)
                org.assertj.core.api.Assertions
                    .assertThat(job.recoveryIndexRepairMaxMembers)
                    .isEqualTo(50_000)
                org.assertj.core.api.Assertions
                    .assertThat(job.queueProbeFixedDelay)
                    .isEqualTo(Duration.ofMinutes(10))
                org.assertj.core.api.Assertions
                    .assertThat(job.maxLlmCallsPerJob)
                    .isEqualTo(3)
            }
    }

    companion object {
        @JvmStatic
        fun invalidRuntimeProperties(): Stream<Arguments> =
            Stream.of(
                invalidKafka("send-timeout", "0ms"),
                invalidKafka("send-timeout", "-1ms"),
                invalidKafka("send-timeout", "500us"),
                invalidKafka("send-timeout", "PT0.0005S"),
                invalidKafka("send-timeout", "30001ms"),
                invalidKafka("max-poll-interval", "0ms"),
                invalidKafka("max-poll-interval", "-1ms"),
                invalidKafka("max-poll-interval", "PT0.0005S"),
                invalidKafka("max-poll-interval", "2147483648ms"),
                invalidKafka("consumer-retry-delay", "0ms"),
                invalidKafka("consumer-retry-delay", "-1ms"),
                invalidKafka("consumer-retry-delay", "500us"),
                invalidKafka("consumer-retry-delay", "60001ms"),
                invalidKafka("consumer-max-attempts", "0"),
                invalidKafka("consumer-max-attempts", "101"),
                invalidJob("redis-ttl", "0s"),
                invalidJob("redis-ttl", "-1s"),
                invalidJob("redis-ttl", "3599s"),
                invalidJob("redis-ttl", "86401s"),
                invalidJob("redis-ttl", "1500ms"),
                invalidJob("processing-deadline", "59s"),
                invalidJob("processing-deadline", "121m"),
                invalidJob("recovery-fixed-delay", "0ms"),
                invalidJob("recovery-fixed-delay", "-1ms"),
                invalidJob("recovery-fixed-delay", "999ms"),
                invalidJob("recovery-fixed-delay", "PT1.0005S"),
                invalidJob("recovery-fixed-delay", "600001ms"),
                invalidJob("recovery-batch-size", "0"),
                invalidJob("recovery-batch-size", "501"),
                invalidJob("recovery-index-repair-batch-size", "0"),
                invalidJob("recovery-index-repair-batch-size", "5001"),
                invalidJob(
                    "recovery-index-repair-max-members",
                    "1",
                    "readmates.aigen.job.recovery-index-repair-batch-size=2",
                ),
                invalidJob("recovery-index-repair-max-members", "50001"),
                invalidJob("queue-probe-fixed-delay", "0ms"),
                invalidJob("queue-probe-fixed-delay", "-1ms"),
                invalidJob("queue-probe-fixed-delay", "999ms"),
                invalidJob("queue-probe-fixed-delay", "PT1.0005S"),
                invalidJob("queue-probe-fixed-delay", "600001ms"),
                invalidJob("max-llm-calls-per-job", "0"),
                invalidJob("max-llm-calls-per-job", "4"),
            )

        private fun invalidKafka(
            property: String,
            value: String,
        ): Arguments {
            val path = "readmates.aigen.kafka.$property"
            return Arguments.of(path, arrayOf("$path=$value"))
        }

        private fun invalidJob(
            property: String,
            value: String,
            vararg companionValues: String,
        ): Arguments {
            val path = "readmates.aigen.job.$property"
            return Arguments.of(path, arrayOf("$path=$value", *companionValues))
        }
    }
}

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AiGenerationProperties::class, AiGenerationKafkaProperties::class)
private class AiGenerationRuntimePropertiesConfiguration

private fun Throwable?.allMessages(): String =
    generateSequence(this) { it.cause }
        .mapNotNull(Throwable::message)
        .joinToString("\n")
