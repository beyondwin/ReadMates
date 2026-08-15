package com.readmates.notification.adapter.out.mail

import com.readmates.notification.application.config.NotificationRuntimeProperties
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.mail.javamail.JavaMailSender
import org.springframework.mail.javamail.JavaMailSenderImpl

private const val SMTP_CONNECTION_TIMEOUT_PROPERTY = "mail.smtp.connectiontimeout"
private const val SMTP_READ_TIMEOUT_PROPERTY = "mail.smtp.timeout"
private const val SMTP_WRITE_TIMEOUT_PROPERTY = "mail.smtp.writetimeout"

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@EnableConfigurationProperties(NotificationRuntimeProperties::class)
class NotificationMailTransportConfiguration {
    @Bean
    fun notificationMailSenderTimeoutInitializer(
        properties: NotificationRuntimeProperties,
        mailSenderProvider: ObjectProvider<JavaMailSender>,
    ): SmartInitializingSingleton =
        SmartInitializingSingleton {
            val mailSender = mailSenderProvider.ifAvailable
            if (mailSender is JavaMailSenderImpl) {
                val smtp = properties.smtp
                mailSender.javaMailProperties.setProperty(
                    SMTP_CONNECTION_TIMEOUT_PROPERTY,
                    smtp.connectionTimeout.toMillis().toString(),
                )
                mailSender.javaMailProperties.setProperty(
                    SMTP_READ_TIMEOUT_PROPERTY,
                    smtp.readTimeout.toMillis().toString(),
                )
                mailSender.javaMailProperties.setProperty(
                    SMTP_WRITE_TIMEOUT_PROPERTY,
                    smtp.writeTimeout.toMillis().toString(),
                )
            }
        }
}
