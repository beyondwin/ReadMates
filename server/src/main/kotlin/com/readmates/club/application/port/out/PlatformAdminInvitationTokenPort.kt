package com.readmates.club.application.port.out

import java.util.UUID

class TransientPlatformAdminInvitationToken internal constructor(
    private val rawValue: String,
) {
    internal fun exposeForDelivery(): String = rawValue

    override fun toString(): String = "[REDACTED]"
}

class DerivedPlatformAdminHostInvitationToken internal constructor(
    internal val rawToken: TransientPlatformAdminInvitationToken,
    internal val tokenHash: String,
) {
    override fun toString(): String = "[REDACTED]"
}

fun interface DerivePlatformAdminHostInvitationTokenPort {
    fun derive(
        invitationId: UUID,
        clubId: UUID,
        digestKeyVersion: Int,
    ): DerivedPlatformAdminHostInvitationToken
}
