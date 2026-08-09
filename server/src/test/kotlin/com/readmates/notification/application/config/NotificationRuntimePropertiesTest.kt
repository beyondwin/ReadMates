package com.readmates.notification.application.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import java.time.Duration
import java.util.stream.Stream

class NotificationRuntimePropertiesTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(NotificationWorkerConfiguration::class.java)

    private val productionConfigRunner =
        ApplicationContextRunner()
            .withInitializer(ConfigDataApplicationContextInitializer())
            .withUserConfiguration(NotificationWorkerConfiguration::class.java)

    @ParameterizedTest(name = "rejects {0}")
    @MethodSource("invalidProperties")
    fun `invalid notification runtime properties fail application startup`(
        expectedPath: String,
        propertyValues: Array<String>,
    ) {
        contextRunner.withPropertyValues(*propertyValues).run { context ->
            assertThat(context).hasFailed()
            assertThat(context.startupFailure.allMessages()).contains(expectedPath)
        }
    }

    @ParameterizedTest(name = "omitted {0}")
    @MethodSource("omittedEnabledSenderProperties")
    fun `enabled notifications require sender values absent from production configuration`(
        expectedPath: String,
        propertyValues: Array<String>,
    ) {
        productionConfigRunner.withPropertyValues(*propertyValues).run { context ->
            assertThat(context).hasFailed()
            assertThat(context.startupFailure.allMessages()).contains(expectedPath)
        }
    }

    @Test
    fun `removed delivery batch setting does not bind a second runtime owner`() {
        contextRunner
            .withPropertyValues("readmates.notifications.worker.delivery-batch-size=0")
            .run { context -> assertThat(context).hasNotFailed() }
    }

    @Test
    fun `approved defaults bind to one immutable runtime contract`() {
        contextRunner.run { context ->
            assertThat(context).hasNotFailed()

            val properties = context.getBean(NotificationRuntimeProperties::class.java)
            assertThat(properties.enabled).isFalse()
            assertThat(properties.senderEmail).isEmpty()
            assertThat(properties.senderName).isEmpty()
            assertThat(properties.worker.enabled).isTrue()
            assertThat(properties.worker.fixedDelay).isEqualTo(Duration.ofSeconds(30))
            assertThat(properties.worker.relayBatchSize).isEqualTo(50)
            assertThat(properties.worker.claimLease).isEqualTo(Duration.ofMinutes(15))
            assertThat(properties.worker.claimLeaseMicroseconds).isEqualTo(900_000_000L)
            assertThat(properties.worker.eventMaxAge).isEqualTo(Duration.ofHours(24))
            assertThat(properties.worker.deliveryMaxAge).isEqualTo(Duration.ofHours(24))
            assertThat(properties.worker.retryDelays)
                .containsExactly(
                    Duration.ofMinutes(5),
                    Duration.ofMinutes(15),
                    Duration.ofHours(1),
                    Duration.ofHours(4),
                )
            assertThat(properties.worker.backlogRefreshInterval).isEqualTo(Duration.ofSeconds(60))
            assertThat(properties.worker.backlogInitialDelay).isEqualTo(Duration.ofSeconds(5))
            assertThat(properties.kafka.sendTimeout).isEqualTo(Duration.ofSeconds(10))
            assertThat(properties.kafka.maxPublishAttempts).isEqualTo(5)
            assertThat(properties.kafka.maxDeliveryAttempts).isEqualTo(5)
            assertThat(properties.kafka.deliveryRetryBackoff).isEqualTo(Duration.ofMinutes(5))
            assertThat(properties.kafka.deliveryRetryMaxAttempts).isEqualTo(72L)
            assertThat(properties.smtp.connectionTimeout).isEqualTo(Duration.ofSeconds(5))
            assertThat(properties.smtp.readTimeout).isEqualTo(Duration.ofSeconds(5))
            assertThat(properties.smtp.writeTimeout).isEqualTo(Duration.ofSeconds(5))
        }
    }

    @Test
    fun `claim lease preserves exact database microsecond precision`() {
        val worker =
            NotificationRuntimeProperties.Worker(
                claimLease =
                    Duration
                        .ofMinutes(7)
                        .plusSeconds(30)
                        .plusMillis(500)
                        .plusNanos(123_000),
            )

        assertThat(worker.claimLeaseMicroseconds).isEqualTo(450_500_123L)
    }

    @Test
    fun `legacy numeric duration values retain their documented units`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.worker.fixed-delay=30000",
                "readmates.notifications.worker.retry-delays=5,15,60,240",
            ).run { context ->
                assertThat(context).hasNotFailed()
                val worker = context.getBean(NotificationRuntimeProperties::class.java).worker
                assertThat(worker.fixedDelay).isEqualTo(Duration.ofSeconds(30))
                assertThat(worker.retryDelays)
                    .containsExactly(
                        Duration.ofMinutes(5),
                        Duration.ofMinutes(15),
                        Duration.ofMinutes(60),
                        Duration.ofMinutes(240),
                    )
            }
    }

    companion object {
        @JvmStatic
        fun invalidProperties(): Stream<Arguments> =
            listOf(
                senderAndKafkaIdentityInvalidProperties(),
                workerInvalidProperties(),
                transportInvalidProperties(),
            ).flatten().stream()

        @JvmStatic
        fun omittedEnabledSenderProperties(): Stream<Arguments> =
            Stream.of(
                invalid(
                    "readmates.notifications.sender-email",
                    "readmates.notifications.enabled=true",
                ),
                invalid(
                    "readmates.notifications.sender-name",
                    "readmates.notifications.enabled=true",
                    "readmates.notifications.sender-email=no-reply@example.test",
                ),
            )

        private fun senderAndKafkaIdentityInvalidProperties(): List<Arguments> =
            listOf(
                invalid(
                    "readmates.notifications.sender-email",
                    "readmates.notifications.enabled=true",
                    "readmates.notifications.sender-email= ",
                ),
                invalid(
                    "readmates.notifications.sender-name",
                    "readmates.notifications.enabled=true",
                    "readmates.notifications.sender-email=no-reply@example.test",
                    "readmates.notifications.sender-name= ",
                ),
                invalidKafka(
                    "readmates.notifications.kafka.bootstrap-servers",
                    "readmates.notifications.kafka.bootstrap-servers= ",
                ),
                invalidKafka(
                    "readmates.notifications.kafka.events-topic",
                    "readmates.notifications.kafka.events-topic= ",
                ),
                invalidKafka(
                    "readmates.notifications.kafka.dlq-topic",
                    "readmates.notifications.kafka.dlq-topic= ",
                ),
                invalidKafka(
                    "readmates.notifications.kafka.consumer-group",
                    "readmates.notifications.kafka.consumer-group= ",
                ),
            )

        private fun workerInvalidProperties(): List<Arguments> =
            listOf(
                invalidValue("readmates.notifications.worker.fixed-delay", "0s"),
                invalidValue("readmates.notifications.worker.fixed-delay", "-1s"),
                invalidValue("readmates.notifications.worker.relay-batch-size", "0"),
                invalidValue("readmates.notifications.worker.relay-batch-size", "1001"),
                invalidValue("readmates.notifications.worker.claim-lease", "0s"),
                invalidValue("readmates.notifications.worker.claim-lease", "-1s"),
                invalidValue("readmates.notifications.worker.claim-lease", "450.500000001s"),
                invalidValue("readmates.notifications.worker.event-max-age", "0s"),
                invalidValue("readmates.notifications.worker.event-max-age", "-1s"),
                invalidValue("readmates.notifications.worker.delivery-max-age", "0s"),
                invalidValue("readmates.notifications.worker.delivery-max-age", "-1s"),
                invalidValue("readmates.notifications.worker.retry-delays", ""),
                invalidValue("readmates.notifications.worker.retry-delays", "5m,0s"),
                invalidValue("readmates.notifications.worker.retry-delays", "30s,5m,15m,60m"),
                invalidValue("readmates.notifications.worker.retry-delays", "90s,5m,15m,60m"),
                invalidValue("readmates.notifications.worker.retry-delays", "15m,5m"),
                invalid(
                    "readmates.notifications.worker.retry-delays",
                    "readmates.notifications.worker.retry-delays=5m,15m,60m",
                    "readmates.notifications.kafka.max-publish-attempts=5",
                ),
                invalid(
                    "readmates.notifications.worker.event-max-age",
                    "readmates.notifications.worker.retry-delays=5m,4h",
                    "readmates.notifications.worker.event-max-age=239m",
                ),
                invalid(
                    "readmates.notifications.worker.delivery-max-age",
                    "readmates.notifications.worker.retry-delays=5m,4h",
                    "readmates.notifications.worker.delivery-max-age=239m",
                ),
                invalidValue("readmates.notifications.worker.backlog-refresh-interval", "0s"),
                invalidValue("readmates.notifications.worker.backlog-refresh-interval", "-1s"),
                invalidValue("readmates.notifications.worker.backlog-initial-delay", "0s"),
                invalidValue("readmates.notifications.worker.backlog-initial-delay", "-1s"),
                invalid(
                    "readmates.notifications.worker.backlog-initial-delay",
                    "readmates.notifications.worker.backlog-refresh-interval=10s",
                    "readmates.notifications.worker.backlog-initial-delay=11s",
                ),
            )

        private fun transportInvalidProperties(): List<Arguments> =
            listOf(
                invalidValue("readmates.notifications.kafka.send-timeout", "0s"),
                invalidValue("readmates.notifications.kafka.send-timeout", "-1s"),
                invalid(
                    "readmates.notifications.kafka.send-timeout",
                    "readmates.notifications.worker.claim-lease=10s",
                    "readmates.notifications.kafka.send-timeout=10s",
                ),
                invalidValue("readmates.notifications.kafka.max-publish-attempts", "0"),
                invalidValue("readmates.notifications.kafka.max-publish-attempts", "1001"),
                invalidValue("readmates.notifications.kafka.max-delivery-attempts", "0"),
                invalidValue("readmates.notifications.kafka.max-delivery-attempts", "1001"),
                invalidValue("readmates.notifications.kafka.delivery-retry-backoff", "-1s"),
                invalidValue("readmates.notifications.kafka.delivery-retry-backoff", "0s"),
                invalidValue("readmates.notifications.kafka.delivery-retry-max-attempts", "0"),
                invalidValue("readmates.notifications.kafka.delivery-retry-max-attempts", "1001"),
                invalidValue("readmates.notifications.smtp.connection-timeout", "0s"),
                invalidValue("readmates.notifications.smtp.connection-timeout", "-1s"),
                invalidValue("readmates.notifications.smtp.read-timeout", "0s"),
                invalidValue("readmates.notifications.smtp.read-timeout", "-1s"),
                invalidValue("readmates.notifications.smtp.write-timeout", "0s"),
                invalidValue("readmates.notifications.smtp.write-timeout", "-1s"),
                invalid(
                    "readmates.notifications.smtp",
                    "readmates.notifications.worker.claim-lease=15s",
                    "readmates.notifications.smtp.connection-timeout=5s",
                    "readmates.notifications.smtp.read-timeout=5s",
                    "readmates.notifications.smtp.write-timeout=5s",
                ),
            )

        private fun invalid(
            expectedPath: String,
            vararg values: String,
        ): Arguments = Arguments.of(expectedPath, values)

        private fun invalidValue(
            property: String,
            value: String,
        ): Arguments = invalid(property, "$property=$value")

        private fun invalidKafka(
            expectedPath: String,
            vararg values: String,
        ): Arguments =
            invalid(
                expectedPath,
                "readmates.notifications.enabled=true",
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
                *values,
            )
    }
}

private fun Throwable?.allMessages(): String =
    generateSequence(this) { it.cause }
        .mapNotNull(Throwable::message)
        .joinToString("\n")
