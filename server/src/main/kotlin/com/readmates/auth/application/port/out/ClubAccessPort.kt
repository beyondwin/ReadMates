package com.readmates.auth.application.port.out

import java.time.OffsetDateTime
import java.util.UUID

fun interface ClubAccessPort {
    fun touch(
        membershipId: UUID,
        clubId: UUID,
    ): OffsetDateTime?
}
