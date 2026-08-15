package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.port.out.PlatformHealthProvider

interface HealthCardProvider {
    val identity: PlatformHealthProvider

    val cardId: String
        get() = identity.cardId

    fun compute(): HealthCard
}
