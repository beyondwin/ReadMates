package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.data.redis.RedisConnectionFailureException
import org.springframework.data.redis.core.HashOperations
import org.springframework.data.redis.core.StringRedisTemplate
import java.util.UUID

class RedisAiGenerationJobStoreFailureTest {
    @Test
    fun `transient Redis read failure propagates instead of deleting the job`() {
        val redisTemplate = Mockito.mock(StringRedisTemplate::class.java)

        @Suppress("UNCHECKED_CAST")
        val hashOperations = Mockito.mock(HashOperations::class.java) as HashOperations<String, String, String>
        Mockito.`when`(redisTemplate.opsForHash<String, String>()).thenReturn(hashOperations)
        val failure = RedisConnectionFailureException("test-unavailable")
        Mockito.`when`(hashOperations.entries(Mockito.anyString())).thenThrow(failure)
        val store =
            RedisAiGenerationJobStore(
                redisTemplate,
                AiGenerationProperties(),
                Mockito.mock(RedisCacheMetrics::class.java),
            )

        assertThatThrownBy { store.load(UUID.randomUUID()) }.isSameAs(failure)
    }
}
