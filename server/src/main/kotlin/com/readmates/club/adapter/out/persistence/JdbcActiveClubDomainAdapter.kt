package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.port.out.ActiveClubDomainPort
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

@Repository
class JdbcActiveClubDomainAdapter(
    private val jdbcTemplate: JdbcTemplate,
    private val clock: Clock,
) : ActiveClubDomainPort {
    private val cache =
        AtomicReference<Pair<Instant, Set<String>>>(
            Pair(Instant.EPOCH, emptySet()),
        )

    override fun isActiveOrigin(origin: String): Boolean {
        val hostname = origin.removePrefix("https://")
        return hostname in freshHostnames()
    }

    private fun freshHostnames(): Set<String> {
        val (fetchedAt, hostnames) = cache.get()
        if (Duration.between(fetchedAt, clock.instant()) < TTL) {
            return hostnames
        }
        val refreshed =
            jdbcTemplate
                .queryForList(
                    "SELECT hostname FROM club_domains WHERE status = 'ACTIVE'",
                    String::class.java,
                ).filterNotNull()
                .toSet()
        cache.set(Pair(clock.instant(), refreshed))
        return refreshed
    }

    companion object {
        private val TTL = Duration.ofSeconds(60)
    }
}
