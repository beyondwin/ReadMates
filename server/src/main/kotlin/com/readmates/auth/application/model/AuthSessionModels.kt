package com.readmates.auth.application.model

import java.time.OffsetDateTime

data class StoredAuthSession(
    val id: String,
    val userId: String,
    val sessionTokenHash: String,
    val createdAt: OffsetDateTime,
    val lastSeenAt: OffsetDateTime,
    val expiresAt: OffsetDateTime,
    val revoked: Boolean = false,
    val userAgent: String?,
    val ipHash: String?,
)
