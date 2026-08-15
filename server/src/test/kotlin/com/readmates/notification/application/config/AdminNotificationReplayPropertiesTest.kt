package com.readmates.notification.application.config

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import java.time.Duration
import java.util.stream.Stream

class AdminNotificationReplayPropertiesTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(NotificationWorkerConfiguration::class.java)

    @ParameterizedTest(name = "rejects {0}")
    @MethodSource("invalidProperties")
    fun `invalid admin replay properties fail startup with their property path`(
        expectedPath: String,
        propertyValue: String,
    ) {
        contextRunner.withPropertyValues(propertyValue).run { context ->
            assertThat(context).hasFailed()
            assertThat(context.startupFailure.allMessages()).contains(expectedPath)
        }
    }

    @Test
    fun `admin replay defaults bind to the approved bounded contract`() {
        contextRunner.run { context ->
            assertThat(context).hasNotFailed()
            assertThat(context).hasSingleBean(AdminNotificationReplayProperties::class.java)

            val properties = context.getBean(AdminNotificationReplayProperties::class.java)
            assertThat(properties.previewTtl).isEqualTo(Duration.ofMinutes(10))
            assertThat(properties.maxTargets).isEqualTo(1_000)
        }
    }

    companion object {
        @JvmStatic
        fun invalidProperties(): Stream<Arguments> =
            Stream.of(
                invalid("readmates.notifications.admin-replay.preview-ttl", "0ms"),
                invalid("readmates.notifications.admin-replay.preview-ttl", "-1ms"),
                invalid("readmates.notifications.admin-replay.preview-ttl", "59999ms"),
                invalid("readmates.notifications.admin-replay.preview-ttl", "3600001ms"),
                invalid("readmates.notifications.admin-replay.preview-ttl", "PT1M0.000001S"),
                invalid("readmates.notifications.admin-replay.max-targets", "0"),
                invalid("readmates.notifications.admin-replay.max-targets", "5001"),
            )

        private fun invalid(
            path: String,
            value: String,
        ): Arguments = Arguments.of(path, "$path=$value")
    }
}

private fun Throwable?.allMessages(): String =
    generateSequence(this) { it.cause }
        .mapNotNull(Throwable::message)
        .joinToString("\n")
