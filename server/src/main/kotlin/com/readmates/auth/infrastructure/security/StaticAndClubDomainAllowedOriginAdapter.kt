package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.out.AllowedOriginPort
import com.readmates.club.application.port.out.ActiveClubDomainPort
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

@Component
class StaticAndClubDomainAllowedOriginAdapter(
    @Value("\${readmates.allowed-origins:}") allowedOrigins: String,
    @Value("\${readmates.app-base-url:http://localhost:3000}") appBaseUrl: String,
    private val activeClubDomainPort: ActiveClubDomainPort,
) : AllowedOriginPort {
    private val staticOrigins = BffSecretFilter.parseAllowedOrigins(allowedOrigins, appBaseUrl)

    override fun isAllowed(origin: String): Boolean {
        if (origin in staticOrigins) return true
        return activeClubDomainPort.isActiveOrigin(origin)
    }
}
