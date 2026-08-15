package com.readmates.aigen.application.model

enum class ProviderCircuitState {
    CLOSED,
    OPEN,
    HALF_OPEN,
    DISABLED,
    FORCED_OPEN,
    METRICS_ONLY,
}

enum class CapDenialReason {
    HOST_DAILY,
    CLUB_MONTHLY,
    HOST_PER_MINUTE,
}
