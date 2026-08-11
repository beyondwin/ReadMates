package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AiGenerationJobListOperation
import com.readmates.aigen.application.model.AiGenerationJobListResult
import com.readmates.aigen.application.model.AiGenerationJobListUnavailableReason
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.data.redis.RedisConnectionFailureException
import org.springframework.data.redis.core.HashOperations
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ZSetOperations
import java.time.Clock
import java.util.UUID

class RedisAiGenerationJobStoreFailureTest {
    @Test
    fun `recent index read failure returns unavailable without exception detail`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        val zSetOperations = zSetOperations(redisTemplate)
        val failure = RedisConnectionFailureException("test-unavailable")
        Mockito.`when`(zSetOperations.reverseRange(Mockito.anyString(), Mockito.anyLong(), Mockito.anyLong()))
            .thenThrow(failure)

        val result = store(redisTemplate).loadRecentForSession(UUID.randomUUID())

        assertThat(result).isEqualTo(
            AiGenerationJobListResult.Unavailable(
                AiGenerationJobListOperation.RECENT_FOR_SESSION,
                AiGenerationJobListUnavailableReason.STORE_READ_FAILED,
            ),
        )
        assertThat(result.toString()).doesNotContain("test-unavailable")
    }

    @Test
    fun `active index read failure returns unavailable without exception detail`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        val zSetOperations = zSetOperations(redisTemplate)
        val failure = RedisConnectionFailureException("test-unavailable")
        Mockito.`when`(zSetOperations.reverseRange(Mockito.anyString(), Mockito.anyLong(), Mockito.anyLong()))
            .thenThrow(failure)

        val result = store(redisTemplate).loadActiveJobs()

        assertThat(result).isEqualTo(
            AiGenerationJobListResult.Unavailable(
                AiGenerationJobListOperation.ACTIVE,
                AiGenerationJobListUnavailableReason.STORE_READ_FAILED,
            ),
        )
        assertThat(result.toString()).doesNotContain("test-unavailable")
    }

    @Test
    fun `commit recovery index read failure returns unavailable without exception detail`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        val zSetOperations = zSetOperations(redisTemplate)
        val failure = RedisConnectionFailureException("test-unavailable")
        Mockito.`when`(zSetOperations.range(Mockito.anyString(), Mockito.anyLong(), Mockito.anyLong()))
            .thenThrow(failure)

        val result = store(redisTemplate).loadCommitRecoveryJobs()

        assertThat(result).isEqualTo(
            AiGenerationJobListResult.Unavailable(
                AiGenerationJobListOperation.COMMIT_RECOVERY,
                AiGenerationJobListUnavailableReason.STORE_READ_FAILED,
            ),
        )
        assertThat(result.toString()).doesNotContain("test-unavailable")
    }

    @Test
    fun `empty authoritative indexes return available empty lists`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)
        val zSetOperations = zSetOperations(redisTemplate)
        Mockito.`when`(zSetOperations.reverseRange(Mockito.anyString(), Mockito.anyLong(), Mockito.anyLong()))
            .thenReturn(emptySet())
        Mockito.`when`(zSetOperations.range(Mockito.anyString(), Mockito.anyLong(), Mockito.anyLong()))
            .thenReturn(emptySet())
        val store = store(redisTemplate)

        assertThat(store.loadRecentForSession(UUID.randomUUID()))
            .isEqualTo(AiGenerationJobListResult.Available(emptyList()))
        assertThat(store.loadActiveJobs()).isEqualTo(AiGenerationJobListResult.Available(emptyList()))
        assertThat(store.loadCommitRecoveryJobs()).isEqualTo(AiGenerationJobListResult.Available(emptyList()))
    }

    private fun store(redisTemplate: StringRedisTemplate): RedisAiGenerationJobStore =
        RedisAiGenerationJobStore(
            redisTemplate,
            AiGenerationProperties(),
            Mockito.mock(RedisCacheMetrics::class.java),
            Clock.systemUTC(),
        )

    @Suppress("UNCHECKED_CAST")
    private fun zSetOperations(redisTemplate: StringRedisTemplate): ZSetOperations<String, String> {
        val zSetOperations = Mockito.mock(ZSetOperations::class.java) as ZSetOperations<String, String>
        Mockito.`when`(redisTemplate.opsForZSet()).thenReturn(zSetOperations)
        return zSetOperations
    }
}
