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
        "spring.ai.model.chat=none",
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
}
