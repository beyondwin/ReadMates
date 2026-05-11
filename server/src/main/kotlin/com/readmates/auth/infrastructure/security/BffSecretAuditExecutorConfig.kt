package com.readmates.auth.infrastructure.security

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor

@Configuration
class BffSecretAuditExecutorConfig {
    @Bean("bffSecretAuditExecutor")
    fun bffSecretAuditExecutor(): ThreadPoolTaskExecutor =
        ThreadPoolTaskExecutor().apply {
            corePoolSize = 1
            maxPoolSize = 2
            queueCapacity = 1_000
            setThreadNamePrefix("bff-secret-audit-")
            setWaitForTasksToCompleteOnShutdown(false)
            initialize()
        }
}
