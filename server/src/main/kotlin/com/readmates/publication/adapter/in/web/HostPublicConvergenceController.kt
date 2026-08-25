@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.web

import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.publication.application.port.`in`.HostPublicConvergenceUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/publication/convergence")
class HostPublicConvergenceController(
    private val convergence: HostPublicConvergenceUseCase,
) {
    @GetMapping
    fun view(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ): ResponseEntity<PublicConvergenceView> {
        val view = convergence.view(member, parseUuid(sessionId))
        return if (view == null) ResponseEntity.noContent().build() else ResponseEntity.ok(view)
    }

    @PostMapping("/{convergenceId}/retry")
    fun retry(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @PathVariable convergenceId: String,
    ): PublicConvergenceView =
        convergence.retry(member, parseUuid(sessionId), parseUuid(convergenceId))
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Public convergence retry is not available")

    private fun parseUuid(raw: String): UUID =
        runCatching { UUID.fromString(raw) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid convergence resource id") }
}
