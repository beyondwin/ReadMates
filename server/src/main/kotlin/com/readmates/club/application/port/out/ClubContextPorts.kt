package com.readmates.club.application.port.out

import com.readmates.club.application.model.ClubSlug
import com.readmates.club.application.model.ResolvedClubContext

interface LoadClubContextPort {
    fun loadBySlug(slug: ClubSlug): ResolvedClubContext?

    fun loadByHostname(hostname: String): ResolvedClubContext?
}
