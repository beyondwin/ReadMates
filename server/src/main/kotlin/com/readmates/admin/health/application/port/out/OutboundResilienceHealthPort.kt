package com.readmates.admin.health.application.port.out

fun interface OutboundResilienceHealthPort {
    fun openCircuitCount(): Int
}
