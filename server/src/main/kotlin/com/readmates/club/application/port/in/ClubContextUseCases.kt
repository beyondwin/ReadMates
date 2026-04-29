package com.readmates.club.application.port.`in`

import com.readmates.club.application.model.ResolvedClubContext

interface ResolveClubContextUseCase {
    fun resolveBySlug(slug: String): ResolvedClubContext?

    fun resolveByHost(host: String?): ResolvedClubContext?
}
