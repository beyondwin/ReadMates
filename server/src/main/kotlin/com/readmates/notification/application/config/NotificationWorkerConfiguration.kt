package com.readmates.notification.application.config

import org.springframework.beans.factory.SmartInitializingSingleton
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(NotificationRuntimeProperties::class)
class NotificationWorkerConfiguration {
    @Bean
    fun notificationRuntimeStartupValidator(properties: NotificationRuntimeProperties): SmartInitializingSingleton =
        SmartInitializingSingleton(properties::validateEnabledSender)

    @Bean("notificationWorkerRuntime")
    @ConditionalOnProperty(
        prefix = "readmates.notifications.worker",
        name = ["enabled"],
        havingValue = "true",
        matchIfMissing = true,
    )
    fun notificationWorkerRuntime(properties: NotificationRuntimeProperties) = properties.worker
}
