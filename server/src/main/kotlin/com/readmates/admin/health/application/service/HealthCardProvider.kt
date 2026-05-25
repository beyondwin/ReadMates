package com.readmates.admin.health.application.service

import com.readmates.admin.health.application.model.HealthCard

interface HealthCardProvider {
    val cardId: String

    fun compute(): HealthCard
}
