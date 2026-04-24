package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.HostMemberListItem
import com.readmates.auth.application.model.UpdateMemberProfileCommand
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface UpdateOwnMemberProfileUseCase {
    fun updateOwnProfile(authenticationEmail: String?, command: UpdateMemberProfileCommand): CurrentMember
}

interface UpdateHostMemberProfileUseCase {
    fun updateMemberProfile(
        host: CurrentMember,
        membershipId: UUID,
        command: UpdateMemberProfileCommand,
    ): HostMemberListItem
}
