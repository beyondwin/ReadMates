package com.readmates.club.application.port.`in`

import com.readmates.shared.security.CurrentPlatformAdmin
import java.util.UUID

interface ClubLifecycleUseCase {
    fun activateAfterFirstHostJoin(clubId: UUID)
    fun suspend(clubId: UUID, actor: CurrentPlatformAdmin, reason: String)
    fun restore(clubId: UUID, actor: CurrentPlatformAdmin)
    fun archive(clubId: UUID, actor: CurrentPlatformAdmin)
}
