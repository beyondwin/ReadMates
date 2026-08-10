package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.time.Duration
import java.util.UUID
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.redis.enabled=true",
        "readmates.aigen.enabled=true",
        "readmates.aigen.enabled-providers=OPENAI",
        "readmates.aigen.fallback-default-model=gpt-5.4-mini",
        "readmates.aigen.grounded.capabilities[gpt-5.4-mini].context-window-tokens=400000",
        "readmates.aigen.grounded.capabilities[gpt-5.4-mini].max-output-tokens=128000",
        "readmates.aigen.grounded.capabilities[gpt-5.4-mini].structured-output-supported=true",
        "readmates.aigen.pricing[gpt-5.4-mini].input-per-m-token-usd=0.75",
        "readmates.aigen.pricing[gpt-5.4-mini].cache-write-input-per-m-token-usd=0.75",
        "readmates.aigen.pricing[gpt-5.4-mini].cached-input-per-m-token-usd=0.075",
        "readmates.aigen.pricing[gpt-5.4-mini].output-per-m-token-usd=4.50",
        "spring.ai.model.chat=none",
        "READMATES_AIGEN_OPENAI_API_KEY=test-key",
        "spring.ai.google.genai.api-key=test-key",
        "spring.ai.openai.api-key=test-key",
        "spring.ai.anthropic.api-key=test-key",
    ],
)
@Tag("integration")
@Tag("container")
class RedisGenerationCostCountersTest(
    @param:Autowired private val guard: GenerationCostGuard,
    @param:Autowired private val redisTemplate: StringRedisTemplate,
    @param:Autowired private val properties: AiGenerationProperties,
) : ReadmatesRedisIntegrationTestSupport() {
    @Suppress("UnusedPrivateProperty")
    @MockitoBean
    private lateinit var jobQueue: AiGenerationJobQueue

    @Test
    fun `admission increments bounded host counters and sets lease`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val admissionId = UUID.randomUUID()

        assertThat(guard.checkBeforeCall(hostId, clubId, admissionId)).isEqualTo(GuardDecision.Allow)
        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:daily")).isEqualTo("1")
        assertThat(redisTemplate.opsForValue().get("aigen:club:$clubId:provider_admission"))
            .isEqualTo(admissionId.toString())
        assertThat(redisTemplate.getExpire("aigen:host:$hostId:daily", TimeUnit.SECONDS)).isPositive()
        val receipt = redisTemplate.opsForHash<String, String>().entries("aigen:job:$admissionId:admission-receipt")
        assertThat(receipt["dailyToken"]).isNotBlank()
        assertThat(receipt["minuteToken"]).isNotBlank()
        assertThat(receipt).containsEntry("dailyCharged", "1").containsEntry("minuteCharged", "1")
        assertThat(redisTemplate.getExpire("aigen:job:$admissionId:admission-receipt", TimeUnit.SECONDS))
            .isBetween(properties.job.redisTtl.seconds - 1, properties.job.redisTtl.seconds)
    }

    @Test
    fun `concurrent club admission fails closed`() {
        val clubId = UUID.randomUUID()

        assertThat(guard.checkBeforeCall(UUID.randomUUID(), clubId, UUID.randomUUID()))
            .isEqualTo(GuardDecision.Allow)
        assertThat(guard.checkBeforeCall(UUID.randomUUID(), clubId, UUID.randomUUID()))
            .isEqualTo(GuardDecision.Deny(ErrorCode.RATE_LIMITED))
    }

    @Test
    fun `release rolls back admission counters before transport`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val admissionId = UUID.randomUUID()
        assertThat(guard.checkBeforeCall(hostId, clubId, admissionId)).isEqualTo(GuardDecision.Allow)

        guard.releaseAdmission(hostId, clubId, admissionId)

        assertThat(redisTemplate.opsForValue().get("aigen:club:$clubId:provider_admission")).isNull()
        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:daily")).isEqualTo("0")
    }

    @Test
    fun `completion removes only matching provider lease and retains host counters`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val admissionId = UUID.randomUUID()
        assertThat(guard.checkBeforeCall(hostId, clubId, admissionId)).isEqualTo(GuardDecision.Allow)

        guard.completeAdmission(hostId, clubId, admissionId)

        assertThat(redisTemplate.opsForValue().get("aigen:club:$clubId:provider_admission")).isNull()
        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:daily")).isEqualTo("1")
        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:minute")).isEqualTo("1")
    }

    @Test
    fun `legacy daily and minute windows rotate missing or malformed tokens without extending counter ttl`() {
        val hostId = UUID.randomUUID()
        val daily = "aigen:host:$hostId:daily"
        val minute = "aigen:host:$hostId:minute"
        val dailyToken = "$daily:window-token"
        val minuteToken = "$minute:window-token"
        redisTemplate.opsForValue().set(daily, "2", Duration.ofSeconds(90))
        redisTemplate.opsForValue().set(minute, "3", Duration.ofSeconds(45))
        redisTemplate.opsForValue().set(minuteToken, "malformed", Duration.ofSeconds(45))
        val dailyBefore = redisTemplate.getExpire(daily, TimeUnit.MILLISECONDS)
        val minuteBefore = redisTemplate.getExpire(minute, TimeUnit.MILLISECONDS)

        val admissionId = UUID.randomUUID()
        assertThat(guard.checkBeforeCall(hostId, UUID.randomUUID(), admissionId)).isEqualTo(GuardDecision.Allow)

        val dailyAfter = redisTemplate.getExpire(daily, TimeUnit.MILLISECONDS)
        val minuteAfter = redisTemplate.getExpire(minute, TimeUnit.MILLISECONDS)
        assertThat(dailyAfter).isBetween(dailyBefore - 1_000, dailyBefore)
        assertThat(minuteAfter).isBetween(minuteBefore - 1_000, minuteBefore)
        assertThat(redisTemplate.getExpire(dailyToken, TimeUnit.MILLISECONDS))
            .isBetween(dailyAfter - 50, dailyAfter + 50)
        assertThat(redisTemplate.getExpire(minuteToken, TimeUnit.MILLISECONDS))
            .isBetween(minuteAfter - 50, minuteAfter + 50)
        assertThat(redisTemplate.opsForValue().get(dailyToken)).isNotBlank().isNotEqualTo("malformed")
        assertThat(redisTemplate.opsForValue().get(minuteToken)).isNotBlank().isNotEqualTo("malformed")
    }

    @Test
    fun `ordinary release cannot refund recreated daily or minute windows and deletes only matching lease`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val admissionId = UUID.randomUUID()
        assertThat(guard.checkBeforeCall(hostId, clubId, admissionId)).isEqualTo(GuardDecision.Allow)
        redisTemplate.opsForValue().set("aigen:host:$hostId:daily", "8", Duration.ofHours(1))
        redisTemplate
            .opsForValue()
            .set("aigen:host:$hostId:daily:window-token", UUID.randomUUID().toString(), Duration.ofHours(1))
        redisTemplate.opsForValue().set("aigen:host:$hostId:minute", "6", Duration.ofSeconds(30))
        redisTemplate
            .opsForValue()
            .set("aigen:host:$hostId:minute:window-token", UUID.randomUUID().toString(), Duration.ofSeconds(30))
        redisTemplate.opsForValue().set("aigen:club:$clubId:provider_admission", UUID.randomUUID().toString())

        guard.releaseAdmission(hostId, clubId, admissionId)

        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:daily")).isEqualTo("8")
        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:minute")).isEqualTo("6")
        assertThat(redisTemplate.opsForValue().get("aigen:club:$clubId:provider_admission")).isNotNull()
        assertThat(redisTemplate.hasKey("aigen:job:$admissionId:admission-receipt")).isFalse()
    }

    @Test
    fun `legacy counter without finite positive ttl fails closed`() {
        val hostId = UUID.randomUUID()
        redisTemplate.opsForValue().set("aigen:host:$hostId:daily", "1")

        assertThat(guard.checkBeforeCall(hostId, UUID.randomUUID(), UUID.randomUUID()))
            .isEqualTo(GuardDecision.Deny(ErrorCode.RATE_LIMITED))
    }

    @Test
    fun `malformed receipt token cannot fabricate refund ownership`() {
        val hostId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val admissionId = UUID.randomUUID()
        assertThat(guard.checkBeforeCall(hostId, clubId, admissionId)).isEqualTo(GuardDecision.Allow)
        redisTemplate.opsForHash<String, String>().delete(
            "aigen:job:$admissionId:admission-receipt",
            "dailyToken",
        )

        guard.releaseAdmission(hostId, clubId, admissionId)

        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:daily")).isEqualTo("1")
        assertThat(redisTemplate.opsForValue().get("aigen:host:$hostId:minute")).isEqualTo("0")
    }
}
