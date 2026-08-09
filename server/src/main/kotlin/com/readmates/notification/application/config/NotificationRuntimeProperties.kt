package com.readmates.notification.application.config

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.convert.DurationUnit
import java.time.Duration
import java.time.temporal.ChronoUnit

private const val MIN_RUNTIME_COUNT = 1
private const val MAX_RUNTIME_COUNT = 1_000
private const val FIXED_DELAY_SECONDS = 30L
private const val CLAIM_LEASE_MINUTES = 15L
private const val MAX_AGE_HOURS = 24L
private const val FIRST_RETRY_MINUTES = 5L
private const val SECOND_RETRY_MINUTES = 15L
private const val THIRD_RETRY_HOURS = 1L
private const val FOURTH_RETRY_HOURS = 4L
private const val BACKLOG_REFRESH_SECONDS = 60L
private const val BACKLOG_INITIAL_DELAY_SECONDS = 5L
private const val KAFKA_SEND_TIMEOUT_SECONDS = 10L
private const val SMTP_TIMEOUT_SECONDS = 5L
private val DEFAULT_FIXED_DELAY: Duration = Duration.ofSeconds(FIXED_DELAY_SECONDS)
private val DEFAULT_CLAIM_LEASE: Duration = Duration.ofMinutes(CLAIM_LEASE_MINUTES)
private val DEFAULT_MAX_AGE: Duration = Duration.ofHours(MAX_AGE_HOURS)
private val DEFAULT_RETRY_DELAYS: List<Duration> =
    listOf(
        Duration.ofMinutes(FIRST_RETRY_MINUTES),
        Duration.ofMinutes(SECOND_RETRY_MINUTES),
        Duration.ofHours(THIRD_RETRY_HOURS),
        Duration.ofHours(FOURTH_RETRY_HOURS),
    )
private val DEFAULT_BACKLOG_REFRESH_INTERVAL: Duration = Duration.ofSeconds(BACKLOG_REFRESH_SECONDS)
private val DEFAULT_BACKLOG_INITIAL_DELAY: Duration = Duration.ofSeconds(BACKLOG_INITIAL_DELAY_SECONDS)
private val DEFAULT_KAFKA_SEND_TIMEOUT: Duration = Duration.ofSeconds(KAFKA_SEND_TIMEOUT_SECONDS)
private val DEFAULT_DELIVERY_RETRY_BACKOFF: Duration = Duration.ofMinutes(FIRST_RETRY_MINUTES)
private val DEFAULT_SMTP_TIMEOUT: Duration = Duration.ofSeconds(SMTP_TIMEOUT_SECONDS)

@ConfigurationProperties(prefix = "readmates.notifications")
data class NotificationRuntimeProperties(
    val enabled: Boolean = false,
    val senderEmail: String = "",
    val senderName: String = "",
    val worker: Worker = Worker(),
    val kafka: Kafka = Kafka(),
    val smtp: Smtp = Smtp(),
) {
    init {
        if (enabled) {
            requireNotBlank("sender-email", senderEmail)
            requireNotBlank("sender-name", senderName)
        }
        if (enabled && kafka.enabled) {
            require(kafka.bootstrapServers.any(String::isNotBlank)) {
                "readmates.notifications.kafka.bootstrap-servers must be set when notification Kafka is enabled"
            }
            requireNotBlank("kafka.events-topic", kafka.eventsTopic)
            requireNotBlank("kafka.dlq-topic", kafka.dlqTopic)
            requireNotBlank("kafka.consumer-group", kafka.consumerGroup)
        }
        require(worker.eventMaxAge >= worker.retryDelays.last()) {
            "readmates.notifications.worker.event-max-age must not be less than the last retry delay"
        }
        require(worker.deliveryMaxAge >= worker.retryDelays.last()) {
            "readmates.notifications.worker.delivery-max-age must not be less than the last retry delay"
        }
        require(kafka.sendTimeout < worker.claimLease) {
            "readmates.notifications.kafka.send-timeout must be less than worker.claim-lease"
        }
        require(smtp.totalTimeout() < worker.claimLease) {
            "readmates.notifications.smtp timeout total must be less than worker.claim-lease"
        }
        require(worker.backlogInitialDelay <= worker.backlogRefreshInterval) {
            "readmates.notifications.worker.backlog-initial-delay must not exceed backlog-refresh-interval"
        }
    }

    data class Worker(
        val enabled: Boolean = true,
        val fixedDelay: Duration = DEFAULT_FIXED_DELAY,
        val relayBatchSize: Int = 50,
        val claimLease: Duration = DEFAULT_CLAIM_LEASE,
        val eventMaxAge: Duration = DEFAULT_MAX_AGE,
        val deliveryMaxAge: Duration = DEFAULT_MAX_AGE,
        @param:DurationUnit(ChronoUnit.MINUTES)
        val retryDelays: List<Duration> = DEFAULT_RETRY_DELAYS,
        val backlogRefreshInterval: Duration = DEFAULT_BACKLOG_REFRESH_INTERVAL,
        val backlogInitialDelay: Duration = DEFAULT_BACKLOG_INITIAL_DELAY,
    ) {
        init {
            requirePositive("worker.fixed-delay", fixedDelay)
            requireCount("worker.relay-batch-size", relayBatchSize)
            requirePositive("worker.claim-lease", claimLease)
            requirePositive("worker.event-max-age", eventMaxAge)
            requirePositive("worker.delivery-max-age", deliveryMaxAge)
            require(retryDelays.isNotEmpty()) {
                "readmates.notifications.worker.retry-delays must not be empty"
            }
            retryDelays.forEach { retryDelay -> requirePositive("worker.retry-delays", retryDelay) }
            require(retryDelays.zipWithNext().all { (previous, next) -> previous <= next }) {
                "readmates.notifications.worker.retry-delays must be nondecreasing"
            }
            requirePositive("worker.backlog-refresh-interval", backlogRefreshInterval)
            requirePositive("worker.backlog-initial-delay", backlogInitialDelay)
        }
    }

    data class Kafka(
        val enabled: Boolean = false,
        val bootstrapServers: List<String> = emptyList(),
        val eventsTopic: String = "readmates.notification.events.v1",
        val dlqTopic: String = "readmates.notification.events.dlq.v1",
        val consumerGroup: String = "readmates-notification-dispatcher",
        val sendTimeout: Duration = DEFAULT_KAFKA_SEND_TIMEOUT,
        val maxPublishAttempts: Int = 5,
        val maxDeliveryAttempts: Int = 5,
        val deliveryRetryBackoff: Duration = DEFAULT_DELIVERY_RETRY_BACKOFF,
        val deliveryRetryMaxAttempts: Long = 72,
    ) {
        init {
            requirePositive("kafka.send-timeout", sendTimeout)
            requireCount("kafka.max-publish-attempts", maxPublishAttempts)
            requireCount("kafka.max-delivery-attempts", maxDeliveryAttempts)
            requirePositive("kafka.delivery-retry-backoff", deliveryRetryBackoff)
            requireCount("kafka.delivery-retry-max-attempts", deliveryRetryMaxAttempts)
        }
    }

    data class Smtp(
        val connectionTimeout: Duration = DEFAULT_SMTP_TIMEOUT,
        val readTimeout: Duration = DEFAULT_SMTP_TIMEOUT,
        val writeTimeout: Duration = DEFAULT_SMTP_TIMEOUT,
    ) {
        init {
            requirePositive("smtp.connection-timeout", connectionTimeout)
            requirePositive("smtp.read-timeout", readTimeout)
            requirePositive("smtp.write-timeout", writeTimeout)
        }

        fun totalTimeout(): Duration = connectionTimeout.plus(readTimeout).plus(writeTimeout)
    }

    private companion object {
        fun requireNotBlank(
            property: String,
            value: String,
        ) {
            require(value.isNotBlank()) { "readmates.notifications.$property must not be blank" }
        }

        fun requirePositive(
            property: String,
            value: Duration,
        ) {
            require(!value.isZero && !value.isNegative) {
                "readmates.notifications.$property must be positive"
            }
        }

        fun requireCount(
            property: String,
            value: Int,
        ) {
            require(value in MIN_RUNTIME_COUNT..MAX_RUNTIME_COUNT) {
                "readmates.notifications.$property must be between $MIN_RUNTIME_COUNT and $MAX_RUNTIME_COUNT"
            }
        }

        fun requireCount(
            property: String,
            value: Long,
        ) {
            require(value in MIN_RUNTIME_COUNT.toLong()..MAX_RUNTIME_COUNT.toLong()) {
                "readmates.notifications.$property must be between $MIN_RUNTIME_COUNT and $MAX_RUNTIME_COUNT"
            }
        }
    }
}
