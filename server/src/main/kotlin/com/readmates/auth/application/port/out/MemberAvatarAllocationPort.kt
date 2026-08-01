package com.readmates.auth.application.port.out

import com.readmates.auth.domain.BookClubAvatarKey
import java.util.UUID

interface MemberAvatarAllocationPort {
    fun allocate(
        clubId: UUID,
        userId: UUID? = null,
    ): BookClubAvatarKey

    fun allocateForClubSlug(
        clubSlug: String,
        userId: UUID? = null,
    ): BookClubAvatarKey
}
