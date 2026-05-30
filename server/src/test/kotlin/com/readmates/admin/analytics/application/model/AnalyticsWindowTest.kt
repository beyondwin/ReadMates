package com.readmates.admin.analytics.application.model

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class AnalyticsWindowTest {
    @Test
    fun `fromWire maps each known wire value`() {
        assertThat(AnalyticsWindow.fromWire("7d")).isEqualTo(AnalyticsWindow.LAST_7D)
        assertThat(AnalyticsWindow.fromWire("30d")).isEqualTo(AnalyticsWindow.LAST_30D)
        assertThat(AnalyticsWindow.fromWire("90d")).isEqualTo(AnalyticsWindow.LAST_90D)
    }

    @Test
    fun `fromWire defaults to 30d for unknown or null`() {
        assertThat(AnalyticsWindow.fromWire(null)).isEqualTo(AnalyticsWindow.LAST_30D)
        assertThat(AnalyticsWindow.fromWire("nonsense")).isEqualTo(AnalyticsWindow.LAST_30D)
        assertThat(AnalyticsWindow.fromWire("")).isEqualTo(AnalyticsWindow.LAST_30D)
    }

    @Test
    fun `windows carry their day spans`() {
        assertThat(AnalyticsWindow.LAST_7D.days).isEqualTo(7L)
        assertThat(AnalyticsWindow.LAST_30D.days).isEqualTo(30L)
        assertThat(AnalyticsWindow.LAST_90D.days).isEqualTo(90L)
    }
}
