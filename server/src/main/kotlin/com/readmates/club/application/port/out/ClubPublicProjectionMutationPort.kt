package com.readmates.club.application.port.out

import java.util.UUID

data class ClubPublicProjectionMutation(
    val clubId: UUID,
    val actorUserId: UUID?,
    val operation: String,
    val exposureChanged: Boolean,
    val exposureLock: ClubPublicProjectionLock? = null,
)

/** Opaque proof that all club session rows were locked in canonical order. */
interface ClubPublicProjectionLock

interface ClubPublicProjectionMutationPort {
    fun lockForExposure(clubId: UUID): ClubPublicProjectionLock

    fun record(mutation: ClubPublicProjectionMutation): Int

    class Noop : ClubPublicProjectionMutationPort {
        private class Lock : ClubPublicProjectionLock

        override fun lockForExposure(clubId: UUID): ClubPublicProjectionLock = Lock()

        override fun record(mutation: ClubPublicProjectionMutation): Int = 0
    }
}
