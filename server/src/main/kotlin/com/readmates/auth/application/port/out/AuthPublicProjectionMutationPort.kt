package com.readmates.auth.application.port.out

import java.util.UUID

data class AuthPublicProjectionMutation(
    val clubId: UUID,
    val actorMembershipId: UUID?,
    val subjectMembershipId: UUID,
    val operation: String,
    val clubBodyChanged: Boolean = false,
    val includeSubjectPublicContent: Boolean = true,
    val affectedSessionIds: Set<UUID> = emptySet(),
)

/** Opaque proof that potentially affected public session rows were locked before auth writes. */
interface AuthPublicProjectionLock

/** Records public projection effects without coupling auth to publication application types. */
interface AuthPublicProjectionMutationPort {
    fun lockPotentiallyAffectedSessions(clubId: UUID): AuthPublicProjectionLock

    fun record(
        lock: AuthPublicProjectionLock,
        mutation: AuthPublicProjectionMutation,
    ): Int

    class Noop : AuthPublicProjectionMutationPort {
        private class Lock : AuthPublicProjectionLock

        override fun lockPotentiallyAffectedSessions(clubId: UUID): AuthPublicProjectionLock = Lock()

        override fun record(
            lock: AuthPublicProjectionLock,
            mutation: AuthPublicProjectionMutation,
        ): Int = 0
    }
}
