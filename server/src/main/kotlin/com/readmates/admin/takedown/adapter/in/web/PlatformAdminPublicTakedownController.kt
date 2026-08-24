@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.takedown.adapter.`in`.web

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
        PublicTakedownPreviewResponse.from(
            previewUseCase.preview(admin.toPlatformActor(), admin.role.name, request.toCommand()),
        )

    @PostMapping("/confirm")
    fun confirm(
        admin: CurrentPlatformAdmin,
        @RequestBody request: PublicTakedownConfirmRequest,
    ): PublicTakedownReceiptResponse =
        PublicTakedownReceiptResponse.from(
            confirmUseCase.confirm(admin.toPlatformActor(), admin.role.name, request.toCommand()),
        )
}

@RestControllerAdvice(assignableTypes = [PlatformAdminPublicTakedownController::class])
class PlatformAdminPublicTakedownErrorHandler {
    @ExceptionHandler(PublicTakedownException::class)
    fun handle(error: PublicTakedownException): ResponseEntity<ApiErrorResponse> =
        when (error.error) {
            PublicTakedownError.PERMISSION_DENIED,
            PublicTakedownError.PREVIEW_ACTOR_MISMATCH,
            -> apiErrorResponse(HttpStatus.FORBIDDEN, "PERMISSION_DENIED", "이 작업을 수행할 권한이 없습니다.")
            PublicTakedownError.TARGET_NOT_FOUND,
            PublicTakedownError.PREVIEW_NOT_FOUND,
            -> apiErrorResponse(HttpStatus.NOT_FOUND, error.error.name, "긴급 회수 대상을 찾을 수 없습니다.")
            PublicTakedownError.IDEMPOTENCY_KEY_REUSED,
            PublicTakedownError.TARGET_MISMATCH,
            PublicTakedownError.GENERATION_MISMATCH,
            PublicTakedownError.SURFACES_MISMATCH,
            PublicTakedownError.TARGET_NOT_PUBLIC,
            -> apiErrorResponse(HttpStatus.CONFLICT, error.error.name, "대상 상태가 미리보기와 달라 확정할 수 없습니다.")
            PublicTakedownError.PREVIEW_EXPIRED ->
                apiErrorResponse(HttpStatus.GONE, error.error.name, "긴급 회수 미리보기가 만료되었습니다.")
            PublicTakedownError.INVALID_REASON_CATEGORY,
            PublicTakedownError.INVALID_REASON,
            PublicTakedownError.INVALID_IDEMPOTENCY_KEY,
            -> apiErrorResponse(HttpStatus.BAD_REQUEST, error.error.name, "요청 값을 다시 확인해 주세요.")
            PublicTakedownError.TAKEDOWN_CONFIRM_DISABLED ->
                apiErrorResponse(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    error.error.name,
                    "보호된 캐시 안전 증거가 없어 긴급 회수를 확정할 수 없습니다.",
                )
        }

    @ExceptionHandler(InvalidPublicTakedownRequestException::class, HttpMessageNotReadableException::class)
    fun invalidRequest(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(HttpStatus.BAD_REQUEST, "INVALID_REQUEST", "요청 값을 다시 확인해 주세요.")
}
