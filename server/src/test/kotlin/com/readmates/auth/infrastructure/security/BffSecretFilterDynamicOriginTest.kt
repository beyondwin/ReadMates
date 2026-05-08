package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.club.adapter.out.persistence.JdbcActiveClubDomainAdapter
import com.readmates.club.application.port.out.ActiveClubDomainPort
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class BffSecretFilterDynamicOriginTest {

    @Test
    fun `static origin is always allowed`() {
        val allowedOriginPort = staticAndClubAllowedOriginPort(
            allowedOrigins = "https://static.example.com",
            activeClubDomainPort = object : ActiveClubDomainPort {
                override fun isActiveOrigin(origin: String) = false
            },
        )

        assertTrue(allowedOriginPort.isAllowed("https://static.example.com"))
        assertFalse(allowedOriginPort.isAllowed("https://unknown.example.com"))
    }

    @Test
    fun `active club domain origin is allowed`() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        `when`(
            jdbcTemplate.queryForList(
                "SELECT hostname FROM club_domains WHERE status = 'ACTIVE'",
                String::class.java,
            ),
        ).thenReturn(listOf("club.example.com"))

        val clock = Clock.fixed(Instant.now(), ZoneOffset.UTC)
        val activeClubDomainPort = JdbcActiveClubDomainAdapter(jdbcTemplate, clock)
        val allowedOriginPort = staticAndClubAllowedOriginPort(
            allowedOrigins = "",
            activeClubDomainPort = activeClubDomainPort,
        )

        assertTrue(allowedOriginPort.isAllowed("https://club.example.com"))
    }

    @Test
    fun `after TTL expiry deactivated club domain is rejected`() {
        val jdbcTemplate = mock(JdbcTemplate::class.java)
        val query = "SELECT hostname FROM club_domains WHERE status = 'ACTIVE'"
        `when`(jdbcTemplate.queryForList(query, String::class.java))
            .thenReturn(listOf("club.example.com"))
            .thenReturn(listOf())

        val start = Instant.now()
        val fixedClock = object : Clock() {
            var now = start
            override fun getZone() = ZoneOffset.UTC
            override fun withZone(zone: ZoneId) = this
            override fun instant() = now
        }

        val activeClubDomainPort = JdbcActiveClubDomainAdapter(jdbcTemplate, fixedClock)
        val allowedOriginPort = staticAndClubAllowedOriginPort(
            allowedOrigins = "",
            activeClubDomainPort = activeClubDomainPort,
        )

        assertTrue(allowedOriginPort.isAllowed("https://club.example.com"))

        fixedClock.now = start.plus(Duration.ofSeconds(61))

        assertFalse(allowedOriginPort.isAllowed("https://club.example.com"))
    }

    private fun staticAndClubAllowedOriginPort(
        allowedOrigins: String,
        activeClubDomainPort: ActiveClubDomainPort,
    ): AllowedOriginPort =
        StaticAndClubDomainAllowedOriginAdapter(
            allowedOrigins = allowedOrigins,
            appBaseUrl = "http://localhost:3000",
            activeClubDomainPort = activeClubDomainPort,
        )
}
