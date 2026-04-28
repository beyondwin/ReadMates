package com.readmates.publication.adapter.out.redis

import com.readmates.publication.application.model.PublicClubResult
import com.readmates.publication.application.model.PublicSessionDetailResult
import com.readmates.publication.application.port.out.PublicReadCachePort
import org.springframework.context.annotation.Condition
import org.springframework.context.annotation.ConditionContext
import org.springframework.context.annotation.Conditional
import org.springframework.core.type.AnnotatedTypeMetadata
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@Conditional(NoopPublicReadCacheCondition::class)
class NoopPublicReadCacheAdapter : PublicReadCachePort {
    override fun getClub(): PublicClubResult? = null

    override fun putClub(result: PublicClubResult) = Unit

    override fun getSession(sessionId: UUID): PublicSessionDetailResult? = null

    override fun putSession(sessionId: UUID, result: PublicSessionDetailResult) = Unit
}

private class NoopPublicReadCacheCondition : Condition {
    override fun matches(context: ConditionContext, metadata: AnnotatedTypeMetadata): Boolean {
        val redisEnabled = context.environment.getProperty("readmates.redis.enabled", Boolean::class.java, false)
        val publicCacheEnabled = context.environment.getProperty("readmates.public-cache.enabled", Boolean::class.java, false)

        return !redisEnabled || !publicCacheEnabled
    }
}
