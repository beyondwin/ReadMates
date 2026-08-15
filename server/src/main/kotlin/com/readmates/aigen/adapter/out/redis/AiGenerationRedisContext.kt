package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.data.redis.core.StringRedisTemplate
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import java.time.Clock

internal class AiGenerationRedisContext(
    val redisTemplate: StringRedisTemplate,
    val properties: AiGenerationProperties,
    val metrics: RedisCacheMetrics,
    val clock: Clock,
) {
    val objectMapper: ObjectMapper = JsonMapper.builder().findAndAddModules().build()
    val recordCodec = AiGenerationRedisRecordCodec(objectMapper)
    val keyspace = AiGenerationRedisKeyspace()
    val indexes = AiGenerationRedisIndexes(redisTemplate, keyspace)

    fun recordFailure(operation: String) {
        metrics.increment("readmates.redis.fallbacks", "feature", "aigen.job-store")
        metrics.increment(
            "readmates.redis.operation.errors",
            "feature",
            "aigen.job-store",
            "operation",
            operation,
        )
    }
}
