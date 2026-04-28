package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.AuthSessionCacheSnapshot
import com.readmates.auth.application.port.out.AuthSessionCachePort
import org.springframework.context.annotation.Condition
import org.springframework.context.annotation.ConditionContext
import org.springframework.context.annotation.Conditional
import org.springframework.core.type.AnnotatedTypeMetadata
import org.springframework.stereotype.Component
import java.time.Duration

@Component
@Conditional(NoopAuthSessionCacheCondition::class)
class NoopAuthSessionCacheAdapter : AuthSessionCachePort {
    override fun find(tokenHash: String): AuthSessionCacheSnapshot? = null
    override fun store(tokenHash: String, snapshot: AuthSessionCacheSnapshot, ttl: Duration) = Unit
    override fun rememberUserSession(userId: String, tokenHash: String, ttl: Duration) = Unit
    override fun shouldTouch(tokenHash: String, ttl: Duration): Boolean = true
    override fun evict(tokenHash: String) = Unit
    override fun evictAllForUser(userId: String) = Unit
}

private class NoopAuthSessionCacheCondition : Condition {
    override fun matches(context: ConditionContext, metadata: AnnotatedTypeMetadata): Boolean {
        val redisEnabled = context.environment.getProperty("readmates.redis.enabled", Boolean::class.java, false)
        val authSessionCacheEnabled =
            context.environment.getProperty("readmates.auth-session-cache.enabled", Boolean::class.java, false)

        return !redisEnabled || !authSessionCacheEnabled
    }
}
