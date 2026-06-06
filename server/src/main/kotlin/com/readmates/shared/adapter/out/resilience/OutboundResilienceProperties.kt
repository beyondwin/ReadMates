package com.readmates.shared.adapter.out.resilience

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Configuration
import java.time.Duration

@Configuration
@EnableConfigurationProperties(OutboundResilienceProperties::class)
class OutboundResilienceConfiguration

@ConfigurationProperties(prefix = "readmates.resilience")
data class OutboundResilienceProperties(
    val enabled: Boolean = true,
    val failureRateThreshold: Float = 50f,
    val slidingWindowSize: Int = 20,
    val minimumNumberOfCalls: Int = 10,
    val permittedCallsInHalfOpenState: Int = 3,
    val waitDurationInOpenState: Duration = DEFAULT_WAIT_DURATION_IN_OPEN_STATE,
) {
    companion object {
        private val DEFAULT_WAIT_DURATION_IN_OPEN_STATE: Duration = Duration.ofSeconds(30)
    }
}
