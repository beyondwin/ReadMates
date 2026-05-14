package com.readmates.auth.domain

enum class MemberLifecycleStatus(
    val storageValue: String,
) {
    INVITED("INVITED"),
    VIEWER("VIEWER"),
    ACTIVE("ACTIVE"),
    SUSPENDED("SUSPENDED"),
    LEFT("LEFT"),
    INACTIVE("INACTIVE"),
    ;

    fun allowsTransitionTo(next: MemberLifecycleStatus): Boolean = TRANSITIONS[this].orEmpty().contains(next)

    companion object {
        private val TRANSITIONS: Map<MemberLifecycleStatus, Set<MemberLifecycleStatus>> =
            mapOf(
                INVITED to setOf(VIEWER, ACTIVE, INACTIVE, LEFT),
                VIEWER to setOf(ACTIVE, INACTIVE, LEFT),
                ACTIVE to setOf(SUSPENDED, INACTIVE, LEFT),
                SUSPENDED to setOf(ACTIVE, INACTIVE, LEFT),
                LEFT to emptySet(),
                INACTIVE to emptySet(),
            )

        fun fromStorage(value: String): MemberLifecycleStatus =
            values().firstOrNull { it.storageValue == value }
                ?: throw IllegalArgumentException("Unknown member lifecycle status: $value")
    }
}

class IllegalMemberStateTransitionException(
    val from: MemberLifecycleStatus,
    val to: MemberLifecycleStatus,
) : IllegalStateException("Illegal member state transition: $from -> $to")
