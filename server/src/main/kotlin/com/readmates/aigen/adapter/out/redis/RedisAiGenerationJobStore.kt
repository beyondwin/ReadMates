package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.port.out.ActiveAiGenerationJobProbe
import com.readmates.aigen.application.port.out.AiGenerationCommitStatePort
import com.readmates.aigen.application.port.out.AiGenerationFailureRecoveryPort
import com.readmates.aigen.application.port.out.AiGenerationJobReadWritePort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationJobTransitionPort
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.time.Clock

/**
 * Conditional Redis AI job bean. Focused collaborators own commands, scripts, payloads, and recovery behavior.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
class RedisAiGenerationJobStore private constructor(
    delegates: RedisAiGenerationJobStoreDelegates,
) : AiGenerationJobStore by delegates.composite,
    AiGenerationFailureRecoveryPort by delegates.recoveryStore,
    ActiveAiGenerationJobProbe by delegates.recoveryIndex {
    @Autowired
    constructor(
        redisTemplate: StringRedisTemplate,
        properties: AiGenerationProperties,
        metrics: RedisCacheMetrics,
        clock: Clock,
    ) : this(RedisAiGenerationJobStoreDelegates(redisTemplate, properties, metrics, clock))
}

private class RedisAiGenerationJobStoreDelegates(
    redisTemplate: StringRedisTemplate,
    properties: AiGenerationProperties,
    metrics: RedisCacheMetrics,
    clock: Clock,
) {
    private val context = AiGenerationRedisContext(redisTemplate, properties, metrics, clock)
    val recoveryIndex = RedisAiGenerationRecoveryIndex(context)
    val recoveryStore = RedisAiGenerationRecoveryStore(context, recoveryIndex)
    private val payloadStore = RedisAiGenerationPayloadStore(context)
    private val transitionStore = RedisAiGenerationTransitionStore(context)
    private val commitStore = RedisAiGenerationCommitStore(context)
    val composite = RedisAiGenerationCompositeStore(payloadStore, transitionStore, commitStore)
}

private class RedisAiGenerationCompositeStore(
    readWrite: AiGenerationJobReadWritePort,
    transition: AiGenerationJobTransitionPort,
    commit: AiGenerationCommitStatePort,
) : AiGenerationJobStore,
    AiGenerationJobReadWritePort by readWrite,
    AiGenerationJobTransitionPort by transition,
    AiGenerationCommitStatePort by commit
