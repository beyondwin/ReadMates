@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.web

import com.readmates.publication.application.model.PublicConvergenceNotAuthorizedException
import com.readmates.publication.application.model.PublicConvergenceNotFoundException
import com.readmates.publication.application.model.PublicConvergenceRetryUnavailableException
import com.readmates.publication.application.model.PublicConvergenceView
import com.readmates.publication.application.port.`in`.GetHostPublicConvergenceUseCase
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.toClubActor
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.util.UUID

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/publication/convergence")
class HostPublicConvergenceController(
    private val getHostPublicConvergence: GetHostPublicConvergenceUseCase,
) {
    @GetMapping
    fun getLatest(
        member: CurrentMember,
        @PathVariable sessionId: UUID,
    ): ResponseEntity<PublicConvergenceView> {
        val convergence = getHostPublicConvergence.getLatestConvergence(member.toClubActor(), sessionId)
        return convergence?.let { ResponseEntity.ok(it) }
            ?: ResponseEntity.noContent().build()
    }

    @GetMapping("/{mutationReceiptId}")
    fun get(
        member: CurrentMember,
        @PathVariable sessionId: UUID,
        @PathVariable mutationReceiptId: UUID,
    ) = getHostPublicConvergence.getConvergence(member.toClubActor(), sessionId, mutationReceiptId)

    @PostMapping("/{convergenceId}/retry")
    fun retry(
        member: CurrentMember,
        @PathVariable sessionId: UUID,
        @PathVariable convergenceId: UUID,
    ) = getHostPublicConvergence.retryConvergence(member.toClubActor(), sessionId, convergenceId)
}

@RestControllerAdvice(assignableTypes = [HostPublicConvergenceController::class])
class HostPublicConvergenceErrorHandler {
    @ExceptionHandler(PublicConvergenceNotAuthorizedException::class)
    fun forbidden(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            HttpStatus.FORBIDDEN,
            "PERMISSION_DENIED",
            "이 작업을 수행할 권한이 없습니다.",
        )

    @ExceptionHandler(PublicConvergenceNotFoundException::class)
    fun notFound(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            HttpStatus.NOT_FOUND,
            "PUBLIC_CONVERGENCE_NOT_FOUND",
            "회수 상태를 찾을 수 없습니다.",
        )

    @ExceptionHandler(PublicConvergenceRetryUnavailableException::class)
    fun retryUnavailable(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            HttpStatus.CONFLICT,
            "PUBLIC_CONVERGENCE_RETRY_UNAVAILABLE",
            "현재 상태에서는 회수를 다시 시도할 수 없습니다.",
        )
}
