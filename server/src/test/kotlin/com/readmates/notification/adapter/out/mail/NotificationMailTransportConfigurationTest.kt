package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.config.NotificationWorkerConfiguration
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.autoconfigure.AutoConfigurations
import org.springframework.boot.mail.autoconfigure.MailSenderAutoConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl

class NotificationMailTransportConfigurationTest {
    @Test
    fun `mail-only properties registration rejects enabled notifications without sender`() {
        ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration::class.java))
            .withUserConfiguration(NotificationMailTransportConfiguration::class.java)
            .withPropertyValues(
                "spring.mail.host=smtp.example.test",
                "readmates.notifications.enabled=true",
            ).run { context ->
                assertThat(context).hasFailed()
                assertThat(context.startupFailure)
                    .hasRootCauseMessage("readmates.notifications.sender-email must not be blank")
            }
    }

    @Test
    fun `validated timeouts customize the actual Boot mail sender without replacing mail settings`() {
        ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration::class.java))
            .withUserConfiguration(
                NotificationWorkerConfiguration::class.java,
                NotificationMailTransportConfiguration::class.java,
            ).withPropertyValues(
                "spring.mail.host=smtp.example.test",
                "spring.mail.port=2525",
                "spring.mail.username=notification-user",
                "spring.mail.password=notification-password",
                "spring.mail.properties.mail.smtp.auth=true",
                "spring.mail.properties.mail.smtp.starttls.enable=true",
                "readmates.notifications.enabled=true",
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
                "readmates.notifications.worker.claim-lease=1s",
                "readmates.notifications.kafka.send-timeout=100ms",
                "readmates.notifications.smtp.connection-timeout=111ms",
                "readmates.notifications.smtp.read-timeout=222ms",
                "readmates.notifications.smtp.write-timeout=333ms",
            ).run { context ->
                assertThat(context).hasNotFailed()
                assertThat(context).hasSingleBean(JavaMailSender::class.java)
                assertThat(context).hasSingleBean(JavaMailSenderImpl::class.java)

                val sender = context.getBean(JavaMailSenderImpl::class.java)
                assertThat(sender).isSameAs(context.getBean(JavaMailSender::class.java))
                assertThat(sender.host).isEqualTo("smtp.example.test")
                assertThat(sender.port).isEqualTo(2525)
                assertThat(sender.username).isEqualTo("notification-user")
                assertThat(sender.password).isEqualTo("notification-password")
                assertThat(sender.javaMailProperties)
                    .containsEntry("mail.smtp.auth", "true")
                    .containsEntry("mail.smtp.starttls.enable", "true")
                    .containsEntry("mail.smtp.connectiontimeout", "111")
                    .containsEntry("mail.smtp.timeout", "222")
                    .containsEntry("mail.smtp.writetimeout", "333")
            }
    }

    @Test
    fun `one millisecond timeouts reach the actual Boot mail sender exactly`() {
        ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(MailSenderAutoConfiguration::class.java))
            .withUserConfiguration(
                NotificationWorkerConfiguration::class.java,
                NotificationMailTransportConfiguration::class.java,
            ).withPropertyValues(
                "spring.mail.host=smtp.example.test",
                "readmates.notifications.enabled=true",
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
                "readmates.notifications.smtp.connection-timeout=1ms",
                "readmates.notifications.smtp.read-timeout=1ms",
                "readmates.notifications.smtp.write-timeout=1ms",
            ).run { context ->
                assertThat(context).hasNotFailed()

                assertThat(context.getBean(JavaMailSenderImpl::class.java).javaMailProperties)
                    .containsEntry("mail.smtp.connectiontimeout", "1")
                    .containsEntry("mail.smtp.timeout", "1")
                    .containsEntry("mail.smtp.writetimeout", "1")
            }
    }
}
