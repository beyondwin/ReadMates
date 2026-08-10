package com.readmates.aigen.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

private const val DEFAULT_SEND_TIMEOUT_SECONDS = 10L
private const val DEFAULT_MAX_POLL_INTERVAL_MINUTES = 16L
private const val DEFAULT_CONSUMER_RETRY_DELAY_SECONDS = 5L
private const val DEFAULT_CONSUMER_MAX_ATTEMPTS = 10
private const val MAX_SEND_TIMEOUT_SECONDS = 30L
private const val MIN_CONSUMER_MAX_ATTEMPTS = 1
private const val MAX_CONSUMER_MAX_ATTEMPTS = 100
private const val NANOSECONDS_PER_MILLISECOND = 1_000_000
private val MIN_MILLISECOND_DURATION: Duration = Duration.ofMillis(1)
private val MAX_SEND_TIMEOUT: Duration = Duration.ofSeconds(MAX_SEND_TIMEOUT_SECONDS)
private val MAX_CONSUMER_RETRY_DELAY: Duration = Duration.ofMinutes(1)
private val MAX_KAFKA_MILLISECOND_DURATION: Duration = Duration.ofMillis(Int.MAX_VALUE.toLong())

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
    val consumerRetryDelay: Duration = Duration.ofSeconds(DEFAULT_CONSUMER_RETRY_DELAY_SECONDS),
    val consumerMaxAttempts: Int = DEFAULT_CONSUMER_MAX_ATTEMPTS,
) {
    init {
        requireExactMilliseconds("send-timeout", sendTimeout, MAX_SEND_TIMEOUT)
        requireExactMilliseconds("max-poll-interval", maxPollInterval, MAX_KAFKA_MILLISECOND_DURATION)
        requireExactMilliseconds("consumer-retry-delay", consumerRetryDelay, MAX_CONSUMER_RETRY_DELAY)
        require(consumerMaxAttempts in MIN_CONSUMER_MAX_ATTEMPTS..MAX_CONSUMER_MAX_ATTEMPTS) {
            "readmates.aigen.kafka.consumer-max-attempts must be between 1 and 100"
        }
    }

    private companion object {
        fun requireExactMilliseconds(
            property: String,
            value: Duration,
            maximum: Duration,
        ) {
            require(
                value in MIN_MILLISECOND_DURATION..maximum &&
                    value.nano % NANOSECONDS_PER_MILLISECOND == 0,
            ) {
                "readmates.aigen.kafka.$property must be between ${MIN_MILLISECOND_DURATION.contractText()} " +
                    "and ${maximum.contractText()} and use whole-millisecond increments"
            }
        }
    }
}

private fun Duration.contractText(): String = toString().removePrefix("PT").lowercase()
