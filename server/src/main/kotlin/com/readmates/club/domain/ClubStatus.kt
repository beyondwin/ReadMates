package com.readmates.club.domain

enum class ClubStatus {
    SETUP_REQUIRED,
    ACTIVE,
    SUSPENDED,
    ARCHIVED,
    ;

    fun canTransitionTo(next: ClubStatus): Boolean = next in (TRANSITIONS[this] ?: emptySet())

    companion object {
        private val TRANSITIONS: Map<ClubStatus, Set<ClubStatus>> =
            mapOf(
                SETUP_REQUIRED to setOf(ACTIVE),
                ACTIVE to setOf(SUSPENDED, ARCHIVED),
                SUSPENDED to setOf(ACTIVE, ARCHIVED),
                ARCHIVED to emptySet(),
            )
    }
}
