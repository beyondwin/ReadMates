package com.readmates.shared

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

@Configuration(proxyBeanMethods = false)
class InfrastructureConfig {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}
