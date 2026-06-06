package com.readmates.shared.adapter.out.resilience

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration

class OutboundResiliencePropertiesTest {
    @Test
    fun `defaults favor availability with a conservative open window`() {
        val props = OutboundResilienceProperties()

        assertThat(props.enabled).isTrue()
        assertThat(props.failureRateThreshold).isEqualTo(50f)
        assertThat(props.slidingWindowSize).isEqualTo(20)
        assertThat(props.minimumNumberOfCalls).isEqualTo(10)
        assertThat(props.permittedCallsInHalfOpenState).isEqualTo(3)
        assertThat(props.waitDurationInOpenState).isEqualTo(Duration.ofSeconds(30))
    }

    @Test
    fun `custom values are retained`() {
        val props =
            OutboundResilienceProperties(
                enabled = false,
                failureRateThreshold = 80f,
                slidingWindowSize = 4,
                minimumNumberOfCalls = 2,
                permittedCallsInHalfOpenState = 1,
                waitDurationInOpenState = Duration.ofMillis(50),
            )

        assertThat(props.enabled).isFalse()
        assertThat(props.minimumNumberOfCalls).isEqualTo(2)
        assertThat(props.waitDurationInOpenState).isEqualTo(Duration.ofMillis(50))
    }
}
