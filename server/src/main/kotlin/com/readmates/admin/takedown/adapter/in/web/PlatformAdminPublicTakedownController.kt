@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.takedown.adapter.`in`.web

import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownActor
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.port.`in`.ConfirmPublicTakedownUseCase
import com.readmates.admin.takedown.application.port.`in`.PreviewPublicTakedownUseCase
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.toPlatformActor
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestController
@RequestMapping("/api/admin/public-takedowns")
class PlatformAdminPublicTakedownController(
    private val previewUseCase: PreviewPublicTakedownUseCase,
    private val confirmUseCase: ConfirmPublicTakedownUseCase,
) {
    @PostMapping("/preview")
    fun preview(
        admin: CurrentPlatformAdmin,
        @RequestBody request: PublicTakedownPreviewRequest,
    ): PublicTakedownPreviewResponse =
        previewUseCase
            .preview(admin.toTakedownActor(), request.clubId, request.sessionId, request.publicationId)
            .toResponse()

    @PostMapping("/confirm")
    fun confirm(
        admin: CurrentPlatformAdmin,
        @RequestBody request: ConfirmPublicTakedownRequest,
    ): PublicTakedownReceiptResponse =
        confirmUseCase
            .confirm(
                admin.toTakedownActor(),
                ConfirmPublicTakedownCommand(
                    previewId = request.previewId,
                    reasonCategory = request.reasonCategory,
                    reason = request.reason,
                    idempotencyKey = request.idempotencyKey,
                ),
            ).toResponse()
}

@RestControllerAdvice(assignableTypes = [PlatformAdminPublicTakedownController::class])
class PlatformAdminPublicTakedownErrorHandler {
    @ExceptionHandler(PublicTakedownException::class)
    fun handle(error: PublicTakedownException): ResponseEntity<ApiErrorResponse> {
        val status =
            when (error.error) {
                PublicTakedownError.ACTIVATION_NOT_VERIFIED,
                PublicTakedownError.DIGEST_KEY_UNAVAILABLE,
                -> HttpStatus.SERVICE_UNAVAILABLE
                PublicTakedownError.PERMISSION_DENIED -> HttpStatus.FORBIDDEN
                PublicTakedownError.TARGET_NOT_FOUND,
                PublicTakedownError.PREVIEW_NOT_FOUND,
                -> HttpStatus.NOT_FOUND
                PublicTakedownError.INVALID_REQUEST -> HttpStatus.BAD_REQUEST
                PublicTakedownError.TARGET_NOT_PUBLIC,
                PublicTakedownError.PREVIEW_EXPIRED,
                PublicTakedownError.PREVIEW_TARGET_MISMATCH,
                PublicTakedownError.GENERATION_MISMATCH,
                PublicTakedownError.IDEMPOTENCY_CONFLICT,
                -> HttpStatus.CONFLICT
            }
        return apiErrorResponse(status, error.error.name, safeMessage(error.error))
    }

    @ExceptionHandler(HttpMessageNotReadableException::class)
    @Suppress("ktlint:standard:function-expression-body")
    fun invalidRequest(
        @Suppress("UNUSED_PARAMETER") error: HttpMessageNotReadableException,
    ): ResponseEntity<ApiErrorResponse> {
        return apiErrorResponse(
            HttpStatus.BAD_REQUEST,
            PublicTakedownError.INVALID_REQUEST.name,
            "요청을 확인해 주세요.",
        )
    }

    private fun safeMessage(error: PublicTakedownError): String =
        when (error) {
            PublicTakedownError.ACTIVATION_NOT_VERIFIED -> "안전 증거가 확인되기 전에는 긴급 회수를 실행할 수 없습니다."
            PublicTakedownError.DIGEST_KEY_UNAVAILABLE -> "요청을 안전하게 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
            PublicTakedownError.PERMISSION_DENIED -> "이 작업을 수행할 권한이 없습니다."
            PublicTakedownError.TARGET_NOT_FOUND,
            PublicTakedownError.PREVIEW_NOT_FOUND,
            -> "대상을 찾을 수 없습니다."
            PublicTakedownError.INVALID_REQUEST -> "요청을 확인해 주세요."
            else -> "대상이 변경되었습니다. 새 미리보기를 확인해 주세요."
        }
}

private fun CurrentPlatformAdmin.toTakedownActor() =
    PublicTakedownActor(
        authority = toPlatformActor(),
        roleSnapshot = role.name,
    )
