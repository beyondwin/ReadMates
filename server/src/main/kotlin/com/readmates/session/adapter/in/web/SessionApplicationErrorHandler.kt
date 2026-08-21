package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.CurrentSessionNotOpenException
import com.readmates.session.application.HostSessionCloseNotAllowedException
import com.readmates.session.application.HostSessionDeletionNotAllowedException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.HostSessionParticipantNotFoundException
import com.readmates.session.application.HostSessionPublishNotAllowedException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionReopenNotAllowedException
import com.readmates.session.application.HostSessionReturnToDraftNotAllowedException
import com.readmates.session.application.HostSessionUnpublishNotAllowedException
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.session.application.InvalidMembershipIdException
import com.readmates.session.application.InvalidQuestionSetException
import com.readmates.session.application.InvalidSessionExposureException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionLifecycleReasonRequiredException
import com.readmates.session.application.model.InvalidHostSessionLifecycleReasonException
import com.readmates.shared.adapter.`in`.web.ApiErrorBlocker
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
@Suppress("TooManyFunctions")
class SessionApplicationErrorHandler {
    @ExceptionHandler(HostSessionDeletionBlockedException::class)
    fun handleDeletionBlocked(ex: HostSessionDeletionBlockedException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_DELETE_BLOCKED",
            message = "적용 기록 또는 알림 이력이 있는 세션은 삭제할 수 없습니다.",
            blockers = ex.blockers.map { ApiErrorBlocker(it.code.name, it.count) },
        )

    @ExceptionHandler(HostSessionDeletionNotAllowedException::class)
    fun handleDeletionNotAllowed(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_DELETION_NOT_ALLOWED",
            message = "초안 또는 진행 중인 세션만 삭제할 수 있습니다.",
        )

    @ExceptionHandler(HostSessionRecordStagingRequiredException::class)
    fun handleStagingRequired(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_RECORD_STAGING_REQUIRED",
            message = "종료된 세션 기록은 초안에서 수정한 뒤 적용해 주세요.",
        )

    @ExceptionHandler(InvalidSessionExposureException::class)
    fun handleInvalidExposure(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_EXPOSURE_INVALID",
            message = "세션 공개 범위가 현재 세션 상태와 맞지 않습니다.",
        )

    @ExceptionHandler(OpenSessionAlreadyExistsException::class)
    fun handleOpenSessionExists(ex: OpenSessionAlreadyExistsException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_OPEN_ALREADY_EXISTS",
            message = "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 모임 전으로 되돌린 뒤 다시 시도하세요.",
            openSessionId = ex.openSessionId?.toString(),
        )

    @ExceptionHandler(HostSessionReopenNotAllowedException::class)
    fun handleReopenNotAllowed(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_REOPEN_NOT_ALLOWED",
            message = "마감된 세션만 다시 열 수 있습니다.",
        )

    @ExceptionHandler(HostSessionUnpublishNotAllowedException::class)
    fun handleUnpublishNotAllowed(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_UNPUBLISH_NOT_ALLOWED",
            message = "공개된 세션만 공개를 취소할 수 있습니다.",
        )

    @ExceptionHandler(HostSessionReturnToDraftNotAllowedException::class)
    fun handleReturnToDraftNotAllowed(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_RETURN_TO_DRAFT_NOT_ALLOWED",
            message = "진행 중인 세션만 예정으로 되돌릴 수 있습니다.",
        )

    @ExceptionHandler(
        CurrentSessionNotOpenException::class,
        HostSessionOpenNotAllowedException::class,
        HostSessionCloseNotAllowedException::class,
        HostSessionPublishNotAllowedException::class,
    )
    fun handleConflict(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "CONFLICT",
            message = "요청한 작업이 현재 세션 상태와 충돌합니다.",
        )

    @ExceptionHandler(
        HostSessionNotFoundException::class,
        HostSessionParticipantNotFoundException::class,
    )
    fun handleNotFound(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.NOT_FOUND,
            code = "SESSION_NOT_FOUND",
            message = "요청한 세션을 찾을 수 없습니다.",
        )

    @ExceptionHandler(
        InvalidMembershipIdException::class,
        InvalidSessionScheduleException::class,
        InvalidQuestionSetException::class,
    )
    fun handleBadRequest(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_REQUEST",
            message = "세션 요청 값을 확인해 주세요.",
        )

    @ExceptionHandler(InvalidHostSessionCursorException::class)
    fun handleInvalidCursor(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_CURSOR",
            message = "커서가 현재 검색 조건과 일치하지 않습니다.",
        )

    @ExceptionHandler(HostSessionLifecycleReasonRequiredException::class)
    fun handleLifecycleReasonRequired(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "LIFECYCLE_REASON_REQUIRED",
            message = "수명주기 되돌리기 사유를 선택해 주세요.",
        )

    @ExceptionHandler(InvalidHostSessionLifecycleReasonException::class)
    fun handleInvalidLifecycleReason(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "LIFECYCLE_REASON_INVALID",
            message = "수명주기 되돌리기 사유가 올바르지 않습니다.",
        )
}
