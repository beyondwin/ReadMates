@file:Suppress("ktlint:standard:package-name")

package com.readmates.hostworkspace.application.port.`in`

import com.readmates.hostworkspace.application.model.HostWorkboxActor
import com.readmates.hostworkspace.application.model.HostWorkboxPage
import com.readmates.hostworkspace.application.model.HostWorkboxRequest
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

fun interface GetHostWorkboxUseCase {
    fun get(request: HostWorkboxRequest): HostWorkboxPage
}

interface ManageHostWorkboxDeferralUseCase {
    fun defer(
        actor: HostWorkboxActor,
        key: HostWorkItemKey,
        deferredUntil: OffsetDateTime,
    ): HostWorkboxDeferral

    fun remove(
        actor: HostWorkboxActor,
        key: HostWorkItemKey,
    ): Boolean
}
