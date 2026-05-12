package com.readmates.auth.infrastructure.security

import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor

@Configuration
class BffSecretAuditExecutorConfig(
    private val meterRegistry: MeterRegistry,
) {
    @Bean("bffSecretAuditExecutor")
    fun bffSecretAuditExecutor(): ThreadPoolTaskExecutor {
        val droppedCounter: Counter = Counter.builder("bff.audit.shutdown.dropped")
            .description("BFF audit tasks rejected because the executor was shutting down or its queue was full")
            .register(meterRegistry)

        return ThreadPoolTaskExecutor().apply {
            corePoolSize = 1
            maxPoolSize = 2
            queueCapacity = 1_000
            setThreadNamePrefix("bff-secret-audit-")
            setWaitForTasksToCompleteOnShutdown(true)
            setAwaitTerminationSeconds(5)
            setRejectedExecutionHandler { _, _ -> droppedCounter.increment() }
            initialize()
        }
    }
}
