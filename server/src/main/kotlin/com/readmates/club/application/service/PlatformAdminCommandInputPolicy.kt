package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException

internal object PlatformAdminCommandInputPolicy {
    fun requireIdempotencyKey(value: String) {
        if (!IDEMPOTENCY_KEY.matches(value)) {
            throw PlatformAdminException(
                PlatformAdminError.INVALID_IDEMPOTENCY_KEY,
                PlatformAdminError.INVALID_IDEMPOTENCY_KEY.name,
            )
        }
    }

    private val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._-]{8,128}$")
}
