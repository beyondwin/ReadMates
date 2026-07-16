package com.readmates.aigen.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

private const val DEFAULT_SEND_TIMEOUT_SECONDS = 10L
private const val DEFAULT_MAX_POLL_INTERVAL_MINUTES = 16L

/**
 * Configuration for the AI-generation Kafka producer and consumer (spec §8.1).
 *
 * Mirrors the notification module's `NotificationKafkaProperties` shape to keep
 * configuration patterns consistent across messaging adapters.
 */
@ConfigurationProperties(prefix = "readmates.aigen.kafka")
data class AiGenerationKafkaProperties(
    val bootstrapServers: List<String> = emptyList(),
    val topicJobs: String = "readmates.aigen.jobs.v1",
    val consumerGroup: String = "readmates-aigen-worker",
    val sendTimeout: Duration = Duration.ofSeconds(DEFAULT_SEND_TIMEOUT_SECONDS),
    val maxPollInterval: Duration = Duration.ofMinutes(DEFAULT_MAX_POLL_INTERVAL_MINUTES),
) {
    init {
        require(!maxPollInterval.isZero && !maxPollInterval.isNegative) {
            "readmates.aigen.kafka.max-poll-interval must be positive"
        }
        require(maxPollInterval.toMillis() <= Int.MAX_VALUE.toLong()) {
            "readmates.aigen.kafka.max-poll-interval exceeds Kafka's supported millisecond range"
        }
    }
}
