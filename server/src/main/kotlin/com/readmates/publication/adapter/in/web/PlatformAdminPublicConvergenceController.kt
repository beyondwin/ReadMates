@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.web

import com.readmates.publication.application.model.PlatformAdminConvergenceAttempt
import com.readmates.publication.application.model.PlatformAdminPublicConvergenceView
import com.readmates.publication.application.port.`in`.PlatformAdminPublicConvergenceUseCase
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.toPlatformActor
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.time.Instant
import java.util.UUID

@RestController
@RequestMapping("/api/admin/public-takedowns/{receiptId}/convergence")
class PlatformAdminPublicConvergenceController(
    private val convergence: PlatformAdminPublicConvergenceUseCase,
) {
    @GetMapping
    fun view(
        admin: CurrentPlatformAdmin,
        @PathVariable receiptId: String,
    ): PlatformAdminPublicConvergenceResponse =
        convergence.view(admin.toPlatformActor(), parseUuid(receiptId))?.toResponse()
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "Public takedown convergence not found")

    @PostMapping("/retry")
    fun retry(
        admin: CurrentPlatformAdmin,
        @PathVariable receiptId: String,
    ): PlatformAdminPublicConvergenceResponse {
        val id = parseUuid(receiptId)
        if (convergence.view(admin.toPlatformActor(), id) == null) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Public takedown convergence not found")
        }
        return convergence.retry(admin.toPlatformActor(), id)?.toResponse()
            ?: throw ResponseStatusException(HttpStatus.CONFLICT, "Public convergence retry is not available")
    }

    private fun parseUuid(raw: String): UUID =
        runCatching { UUID.fromString(raw) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid takedown receipt id") }
}

data class PlatformAdminPublicConvergenceResponse(
    val schema: String = "admin.public_takedown.convergence.v1",
    val convergenceId: UUID,
    val originResult: String,
    val committedGeneration: Long,
    val status: String,
    val lastAttemptAt: Instant?,
    val retryable: Boolean,
    val attempts: List<PlatformAdminConvergenceAttemptResponse>,
)

data class PlatformAdminConvergenceAttemptResponse(
    val attemptNo: Int,
    val status: String,
    val observedAt: Instant,
    val resultCategory: String?,
)

private fun PlatformAdminPublicConvergenceView.toResponse() =
    PlatformAdminPublicConvergenceResponse(
        convergenceId = convergenceId,
        originResult = originResult,
        committedGeneration = committedGeneration,
        status = status.name,
        lastAttemptAt = lastAttemptAt,
        retryable = retryable,
        attempts = attempts.map(PlatformAdminConvergenceAttempt::toResponse),
    )

private fun PlatformAdminConvergenceAttempt.toResponse() =
    PlatformAdminConvergenceAttemptResponse(
        attemptNo = attemptNo,
        status = status.name,
        observedAt = observedAt,
        resultCategory = resultCategory?.name,
    )
