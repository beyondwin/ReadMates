package com.readmates.aigen.application.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AiOpsCostWindowTest {
    @Test
    fun `fromWire maps known wire values`() {
        assertThat(AiOpsCostWindow.fromWire("7d")).isEqualTo(AiOpsCostWindow.LAST_7D)
        assertThat(AiOpsCostWindow.fromWire("30d")).isEqualTo(AiOpsCostWindow.LAST_30D)
        assertThat(AiOpsCostWindow.fromWire("90d")).isEqualTo(AiOpsCostWindow.LAST_90D)
    }

    @Test
    fun `fromWire defaults to 30 days for null or unknown`() {
        assertThat(AiOpsCostWindow.fromWire(null)).isEqualTo(AiOpsCostWindow.LAST_30D)
        assertThat(AiOpsCostWindow.fromWire("bogus")).isEqualTo(AiOpsCostWindow.LAST_30D)
    }
}
