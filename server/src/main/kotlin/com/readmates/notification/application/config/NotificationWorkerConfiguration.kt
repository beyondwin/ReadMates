package com.readmates.notification.application.config

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration

@Configuration
@ConditionalOnProperty(name = ["readmates.notifications.worker.enabled"], havingValue = "true", matchIfMissing = true)
class NotificationWorkerConfiguration
