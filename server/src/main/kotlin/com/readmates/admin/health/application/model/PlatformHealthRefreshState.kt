package com.readmates.admin.health.application.model

enum class PlatformHealthRefreshState {
    FRESH,
    REFRESHING,
    STALE,
    UNAVAILABLE,
}

enum class PlatformHealthRefreshTrigger {
    LAZY,
    SCHEDULED,
}
