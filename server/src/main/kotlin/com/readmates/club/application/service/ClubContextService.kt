package com.readmates.club.application.service

import com.readmates.club.application.model.ClubSlug
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.club.application.port.out.LoadClubContextPort
import org.springframework.stereotype.Service
import java.util.Locale

@Service
class ClubContextService(
    private val loadClubContextPort: LoadClubContextPort,
) : ResolveClubContextUseCase {
    override fun resolveBySlug(slug: String): ResolvedClubContext? =
        runCatching { ClubSlug.parse(slug) }
            .getOrNull()
            ?.let(loadClubContextPort::loadBySlug)

    override fun resolveByHost(host: String?): ResolvedClubContext? {
        val normalizedHost = host
            ?.trim()
            ?.trimEnd('.')
            ?.lowercase(Locale.ROOT)
            ?.takeIf { it.isNotEmpty() }
            ?: return null

        return loadClubContextPort.loadByHostname(normalizedHost)
    }
}
