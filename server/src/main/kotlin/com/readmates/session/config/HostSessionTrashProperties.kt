package com.readmates.session.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import java.time.Duration

private const val DEFAULT_PURGE_BATCH_SIZE = 50
private const val MIN_PURGE_BATCH_SIZE = 1
private const val MAX_PURGE_BATCH_SIZE = 500

@ConfigurationProperties(prefix = "readmates.session.trash")
data class HostSessionTrashProperties(
    val purgeFixedDelay: Duration = Duration.ofHours(1),
    val purgeBatchSize: Int = DEFAULT_PURGE_BATCH_SIZE,
) {
    fun boundedPurgeBatchSize(): Int = purgeBatchSize.coerceIn(MIN_PURGE_BATCH_SIZE, MAX_PURGE_BATCH_SIZE)
}

@Configuration
@EnableConfigurationProperties(HostSessionTrashProperties::class)
class HostSessionTrashConfiguration
