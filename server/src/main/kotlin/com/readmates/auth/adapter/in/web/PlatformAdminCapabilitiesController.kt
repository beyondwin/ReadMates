@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.adapter.`in`.web

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.toPlatformActor
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset

@RestController
@RequestMapping("/api/admin/capabilities")
class PlatformAdminCapabilitiesController(
    private val clock: Clock,
) {
    @GetMapping
    fun get(admin: CurrentPlatformAdmin): ResponseEntity<PlatformAdminCapabilitiesResponse> {
        val body =
            PlatformAdminCapabilitiesResponse(
                schemaVersion = 1,
                role = admin.role,
                status = "ACTIVE",
                capabilities = admin.toPlatformActor().capabilities.sorted(),
                generatedAt = OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.UTC),
            )
        return ResponseEntity
            .ok()
            .header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(body)
    }
}

data class PlatformAdminCapabilitiesResponse(
    val schemaVersion: Int = 1,
    val role: PlatformAdminRole,
    val status: String = "ACTIVE",
    val capabilities: List<PlatformCapability>,
    val generatedAt: OffsetDateTime,
)
