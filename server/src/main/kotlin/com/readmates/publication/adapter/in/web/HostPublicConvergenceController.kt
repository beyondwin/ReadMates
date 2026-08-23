@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.web

import com.readmates.publication.application.model.PublicConvergenceNotAuthorizedException
import com.readmates.publication.application.model.PublicConvergenceNotFoundException
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
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.util.UUID

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/publication/convergence")
class HostPublicConvergenceController(
    private val getHostPublicConvergence: GetHostPublicConvergenceUseCase,
) {
    @GetMapping("/{mutationReceiptId}")
    fun get(
        member: CurrentMember,
        @PathVariable sessionId: UUID,
        @PathVariable mutationReceiptId: UUID,
    ) = getHostPublicConvergence.getConvergence(member.toClubActor(), sessionId, mutationReceiptId)
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
}
