package com.readmates.auth.adapter.out.redis

import com.readmates.auth.application.port.out.RateLimitCheck
import com.readmates.auth.application.port.out.RateLimitDecision
import com.readmates.auth.application.port.out.RateLimitPort
import org.springframework.context.annotation.Condition
import org.springframework.context.annotation.ConditionContext
import org.springframework.context.annotation.Conditional
import org.springframework.core.type.AnnotatedTypeMetadata
import org.springframework.stereotype.Component

@Component
@Conditional(NoopRateLimitCondition::class)
class NoopRateLimitAdapter : RateLimitPort {
    override fun check(check: RateLimitCheck): RateLimitDecision =
        RateLimitDecision.allowed()
}

private class NoopRateLimitCondition : Condition {
    override fun matches(context: ConditionContext, metadata: AnnotatedTypeMetadata): Boolean {
        val redisEnabled = context.environment.getProperty("readmates.redis.enabled", Boolean::class.java, false)
        val rateLimitEnabled = context.environment.getProperty("readmates.rate-limit.enabled", Boolean::class.java, false)

        return !redisEnabled || !rateLimitEnabled
    }
}
