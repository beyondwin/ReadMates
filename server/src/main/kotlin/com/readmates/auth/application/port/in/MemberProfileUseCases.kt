package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.HostMemberListItem
import com.readmates.auth.application.model.MemberProfile
import com.readmates.auth.application.model.UpdateMemberProfileCommand
import java.util.UUID

interface UpdateOwnMemberProfileUseCase {
    fun updateOwnProfile(authenticationEmail: String?, command: UpdateMemberProfileCommand): MemberProfile
}

interface UpdateHostMemberProfileUseCase {
    fun updateMemberProfile(
        authenticationEmail: String?,
        membershipId: UUID,
        command: UpdateMemberProfileCommand,
    ): HostMemberListItem
}
