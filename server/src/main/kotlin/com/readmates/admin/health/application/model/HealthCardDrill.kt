package com.readmates.admin.health.application.model

sealed interface HealthCardDrill {
    data class AdminRoute(val target: String) : HealthCardDrill
}
