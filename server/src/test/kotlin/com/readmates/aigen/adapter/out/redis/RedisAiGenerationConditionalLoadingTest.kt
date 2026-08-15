package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.port.out.ActiveAiGenerationJobProbe
import com.readmates.aigen.application.port.out.AiGenerationFailureRecoveryPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
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
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

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
                val bean = context.getBean(RedisAiGenerationJobStore::class.java)
                assertThat(context.getBean(AiGenerationJobStore::class.java)).isSameAs(bean)
                assertThat(context.getBean(AiGenerationFailureRecoveryPort::class.java)).isSameAs(bean)
                assertThat(context.getBean(ActiveAiGenerationJobProbe::class.java)).isSameAs(bean)
            }
    }

    @Test
    fun `job store bean implements the composite and all five focused ports`() {
        val interfaceNames = allInterfaces(RedisAiGenerationJobStore::class.java).mapTo(linkedSetOf()) { it.simpleName }

        assertThat(interfaceNames).contains(
            "AiGenerationJobStore",
            "AiGenerationJobReadWritePort",
            "AiGenerationJobTransitionPort",
            "AiGenerationCommitStatePort",
            "AiGenerationFailureRecoveryPort",
            "ActiveAiGenerationJobProbe",
        )
    }

    @Test
    fun `keyspace owns the exact AI job admission index and repair keys`() {
        val keyspace = AiGenerationRedisKeyspace()
        val jobId = UUID.fromString("00000000-0000-0000-0000-000000000101")
        val hostId = UUID.fromString("00000000-0000-0000-0000-000000000202")
        val clubId = UUID.fromString("00000000-0000-0000-0000-000000000303")
        val sessionId = UUID.fromString("00000000-0000-0000-0000-000000000404")

        assertThat(
            linkedMapOf(
                "hash" to keyspace.hash(jobId),
                "transcript" to keyspace.transcript(jobId),
                "turns" to keyspace.turns(jobId),
                "result" to keyspace.result(jobId),
                "evidence" to keyspace.evidence(jobId),
                "providerAttempts" to keyspace.providerAttempts(jobId),
                "admissionReceipt" to keyspace.admissionReceipt(jobId),
                "activeJobs" to keyspace.activeJobs,
                "activeIndexEpoch" to keyspace.activeIndexEpoch,
                "processingRecovery" to keyspace.processingRecovery,
                "processingQuarantine" to keyspace.processingQuarantine,
                "processingRepairState" to keyspace.processingRepairState,
                "commitRecoveryJobs" to keyspace.commitRecoveryJobs,
                "activeClubJobs" to keyspace.activeClubJobs(clubId),
                "sessionRecent" to keyspace.sessionRecent(sessionId),
                "hostDaily" to keyspace.hostDaily(hostId),
                "hostDailyWindowToken" to keyspace.hostDailyWindowToken(hostId),
                "hostMinute" to keyspace.hostMinute(hostId),
                "hostMinuteWindowToken" to keyspace.hostMinuteWindowToken(hostId),
                "providerAdmission" to keyspace.providerAdmission(clubId),
                "repairWorklist" to keyspace.repairWorklist("pass-17"),
                "invalidRepairMember" to keyspace.invalidRepairMember,
            ),
        ).containsExactlyEntriesOf(
            linkedMapOf(
                "hash" to "aigen:job:$jobId",
                "transcript" to "aigen:job:$jobId:transcript",
                "turns" to "aigen:job:$jobId:turns",
                "result" to "aigen:job:$jobId:result",
                "evidence" to "aigen:job:$jobId:evidence",
                "providerAttempts" to "aigen:job:$jobId:provider-attempts",
                "admissionReceipt" to "aigen:job:$jobId:admission-receipt",
                "activeJobs" to "aigen:jobs:active",
                "activeIndexEpoch" to "aigen:jobs:active:epoch",
                "processingRecovery" to "aigen:jobs:processing-recovery",
                "processingQuarantine" to "aigen:jobs:processing-recovery:quarantine",
                "processingRepairState" to "aigen:jobs:processing-recovery:repair-state",
                "commitRecoveryJobs" to "aigen:jobs:commit-recovery",
                "activeClubJobs" to "aigen:club:$clubId:jobs:active",
                "sessionRecent" to "aigen:session:$sessionId:jobs",
                "hostDaily" to "aigen:host:$hostId:daily",
                "hostDailyWindowToken" to "aigen:host:$hostId:daily:window-token",
                "hostMinute" to "aigen:host:$hostId:minute",
                "hostMinuteWindowToken" to "aigen:host:$hostId:minute:window-token",
                "providerAdmission" to "aigen:club:$clubId:provider_admission",
                "repairWorklist" to "aigen:jobs:processing-recovery:repair-worklist:pass-17",
                "invalidRepairMember" to "aigen:job:invalid-repair-member",
            ),
        )
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

        @Bean
        fun clock(): Clock = Clock.fixed(Instant.parse("2026-08-10T00:00:00Z"), ZoneOffset.UTC)
    }
}

private fun allInterfaces(type: Class<*>): Set<Class<*>> =
    type.interfaces.flatMapTo(linkedSetOf()) { parent ->
        setOf(parent) + allInterfaces(parent)
    }
