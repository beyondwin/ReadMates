package com.readmates.shared.cache

import io.micrometer.core.instrument.MeterRegistry
import org.springframework.beans.factory.ObjectProvider
import org.springframework.stereotype.Component

@Component
class RedisCacheMetrics(
    private val meterRegistryProvider: ObjectProvider<MeterRegistry>,
) {
    fun increment(name: String, vararg tags: String) {
        val registry = meterRegistryProvider.ifAvailable ?: return
        registry.counter(name, *tags).increment()
    }
}
