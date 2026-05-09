package com.readmates.auth.domain

enum class MembershipStatus {
    INVITED,
    VIEWER,
    ACTIVE,
    SUSPENDED,
    LEFT,
    INACTIVE;

    fun canTransitionTo(next: MembershipStatus): Boolean =
        next in (TRANSITIONS[this] ?: emptySet())

    companion object {
        private val TRANSITIONS: Map<MembershipStatus, Set<MembershipStatus>> = mapOf(
            INVITED to setOf(VIEWER, ACTIVE, INACTIVE, LEFT),
            VIEWER to setOf(ACTIVE, INACTIVE, LEFT),
            ACTIVE to setOf(SUSPENDED, INACTIVE, LEFT),
            SUSPENDED to setOf(ACTIVE, INACTIVE, LEFT),
            LEFT to emptySet(),
            INACTIVE to emptySet(),
        )
    }
}
