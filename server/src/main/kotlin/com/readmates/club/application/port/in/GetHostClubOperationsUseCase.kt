package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.HostClubOperationsSnapshot
import com.readmates.shared.security.CurrentMember

interface GetHostClubOperationsUseCase {
    fun hostOperationsSnapshot(host: CurrentMember): HostClubOperationsSnapshot
}
