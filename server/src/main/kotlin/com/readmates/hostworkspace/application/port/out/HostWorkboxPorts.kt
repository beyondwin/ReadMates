package com.readmates.hostworkspace.application.port.out

import com.readmates.hostworkspace.application.model.HostWorkboxSnapshot
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPage
import com.readmates.hostworkspace.application.model.HostWorkboxSnapshotPageQuery
import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxDeferral
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import java.time.OffsetDateTime

interface HostWorkboxDeferralPort {
    fun upsertDeferral(deferral: HostWorkboxDeferral)

    fun findActiveDeferral(
        owner: HostWorkboxOwner,
        key: HostWorkItemKey,
        evaluatedAt: OffsetDateTime,
    ): HostWorkboxDeferral?

    fun removeDeferral(
        owner: HostWorkboxOwner,
        key: HostWorkItemKey,
    ): Boolean

    fun purgeExpiredDeferrals(
        owner: HostWorkboxOwner,
        evaluatedAt: OffsetDateTime,
        limit: Int,
    ): Int
}

interface HostWorkboxSnapshotPort {
    fun saveSnapshot(snapshot: HostWorkboxSnapshot)

    fun loadSnapshotPage(query: HostWorkboxSnapshotPageQuery): HostWorkboxSnapshotPage?

    fun purgeExpiredSnapshots(
        evaluatedAt: OffsetDateTime,
        limit: Int,
    ): Int
}
