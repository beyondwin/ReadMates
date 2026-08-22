package com.readmates.shared.listing.application.port.out

import com.readmates.shared.listing.application.model.HostListEpoch
import com.readmates.shared.listing.application.model.HostListEpochKind
import java.util.UUID

interface HostListEpochPort {
    fun load(clubId: UUID): HostListEpoch

    fun bump(
        clubId: UUID,
        kinds: Set<HostListEpochKind>,
    )

    class Noop : HostListEpochPort {
        override fun load(clubId: UUID) = HostListEpoch(clubId, 0, 0)

        override fun bump(
            clubId: UUID,
            kinds: Set<HostListEpochKind>,
        ) = Unit
    }
}

fun HostListEpochPort.bump(
    clubId: UUID,
    vararg kinds: HostListEpochKind,
) = bump(clubId, kinds.toSet())
