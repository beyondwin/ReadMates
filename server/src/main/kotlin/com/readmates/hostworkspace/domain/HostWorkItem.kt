package com.readmates.hostworkspace.domain

import java.time.OffsetDateTime
import java.util.UUID

@JvmInline
value class HostWorkItemKey(
    val value: String,
) {
    init {
        require(value.length in 1..MAX_LENGTH) { "Work item key must contain 1 to $MAX_LENGTH characters" }
        require(value.all { character -> character.code in VISIBLE_ASCII_RANGE }) {
            "Work item key must contain visible ASCII only"
        }
    }

    override fun toString(): String = value

    private companion object {
        const val MAX_LENGTH = 255
        val VISIBLE_ASCII_RANGE = 0x21..0x7e
    }
}

data class HostWorkboxOwner(
    val clubId: UUID,
    val hostMembershipId: UUID,
)

class HostWorkboxDeferral private constructor(
    val owner: HostWorkboxOwner,
    val key: HostWorkItemKey,
    val deferredUntil: OffsetDateTime,
) {
    companion object {
        fun create(
            owner: HostWorkboxOwner,
            key: HostWorkItemKey,
            deferredUntil: OffsetDateTime,
            evaluatedAt: OffsetDateTime,
        ): HostWorkboxDeferral {
            require(deferredUntil.isAfter(evaluatedAt)) { "Deferred time must be after evaluation time" }
            return HostWorkboxDeferral(owner, key, deferredUntil)
        }

        fun restore(
            owner: HostWorkboxOwner,
            key: HostWorkItemKey,
            deferredUntil: OffsetDateTime,
        ): HostWorkboxDeferral = HostWorkboxDeferral(owner, key, deferredUntil)
    }
}
