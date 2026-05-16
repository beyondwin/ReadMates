package com.readmates.aigen.config

import org.springframework.boot.context.properties.ConfigurationProperties
import java.time.Duration

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
    val sendTimeout: Duration = Duration.ofSeconds(10),
)
