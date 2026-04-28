package com.readmates.shared.cache

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import java.time.Duration

@Configuration
@EnableConfigurationProperties(
    RedisFeatureProperties::class,
    RateLimitProperties::class,
    AuthSessionCacheProperties::class,
    PublicCacheProperties::class,
    NotesCacheProperties::class,
)
class RedisCachePropertiesConfiguration

@ConfigurationProperties(prefix = "readmates.redis")
data class RedisFeatureProperties(
    val enabled: Boolean = false,
)

@ConfigurationProperties(prefix = "readmates.rate-limit")
data class RateLimitProperties(
    val enabled: Boolean = false,
    val failClosedSensitive: Boolean = false,
)

@ConfigurationProperties(prefix = "readmates.auth-session-cache")
data class AuthSessionCacheProperties(
    val enabled: Boolean = false,
    val sessionTtl: Duration = Duration.ofMinutes(10),
    val touchThrottleTtl: Duration = Duration.ofMinutes(5),
)

@ConfigurationProperties(prefix = "readmates.public-cache")
data class PublicCacheProperties(
    val enabled: Boolean = false,
    val clubTtl: Duration = Duration.ofMinutes(15),
    val sessionTtl: Duration = Duration.ofMinutes(15),
)

@ConfigurationProperties(prefix = "readmates.notes-cache")
data class NotesCacheProperties(
    val enabled: Boolean = false,
    val feedTtl: Duration = Duration.ofMinutes(3),
)
