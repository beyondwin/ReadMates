package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.support.ReadmatesRedisIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
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
}
