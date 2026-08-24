package com.readmates.shared.listing.application.model

import java.util.UUID

enum class HostListEpochKind {
    MEETING,
    RECORD,
}

data class HostListEpoch(
    val clubId: UUID,
    val meetingEpoch: Long,
    val recordEpoch: Long,
) {
    init {
        require(meetingEpoch >= 0) { "meetingEpoch must be non-negative" }
        require(recordEpoch >= 0) { "recordEpoch must be non-negative" }
    }

    fun value(kind: HostListEpochKind): Long =
        when (kind) {
            HostListEpochKind.MEETING -> meetingEpoch
            HostListEpochKind.RECORD -> recordEpoch
        }
}
