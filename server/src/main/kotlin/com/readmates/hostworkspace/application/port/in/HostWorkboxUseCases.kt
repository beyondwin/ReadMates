@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.application.port.`in`

import com.readmates.hostworkspace.domain.HostWorkItemKey
import com.readmates.hostworkspace.domain.HostWorkboxDeferral
import com.readmates.hostworkspace.domain.HostWorkboxOwner
import java.time.OffsetDateTime

interface DeferHostWorkItemUseCase {
    fun defer(
        owner: HostWorkboxOwner,
        key: HostWorkItemKey,
        deferredUntil: OffsetDateTime,
        evaluatedAt: OffsetDateTime,
    ): HostWorkboxDeferral
}

interface RemoveHostWorkItemDeferralUseCase {
    fun remove(
        owner: HostWorkboxOwner,
        key: HostWorkItemKey,
    ): Boolean
}
