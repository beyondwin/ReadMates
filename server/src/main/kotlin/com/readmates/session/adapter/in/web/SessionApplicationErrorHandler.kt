package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.CurrentSessionNotOpenException
import com.readmates.session.application.HostSessionChangeNotRestorableException
import com.readmates.session.application.HostSessionCloseNotAllowedException
import com.readmates.session.application.HostSessionDeletionNotAllowedException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.HostSessionParticipantNotFoundException
import com.readmates.session.application.HostSessionPublishNotAllowedException
import com.readmates.session.application.HostSessionRecordStagingRequiredException
import com.readmates.session.application.HostSessionReopenNotAllowedException
import com.readmates.session.application.HostSessionRestoreStaleException
import com.readmates.session.application.HostSessionReturnToDraftNotAllowedException
import com.readmates.session.application.HostSessionRevisionConflictException
import com.readmates.session.application.HostSessionUnpublishNotAllowedException
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.session.application.InvalidMembershipIdException
import com.readmates.session.application.InvalidQuestionSetException
import com.readmates.session.application.InvalidSessionExposureException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.session.application.model.HostListCursorStaleException
import com.readmates.session.application.model.HostMutationNotAuthorizedException
import com.readmates.session.application.model.HostSessionDeletionBlockedException
import com.readmates.session.application.model.HostSessionLifecycleReasonRequiredException
import com.readmates.session.application.model.HostSessionTrashExpiredException
import com.readmates.session.application.model.InvalidHostSessionLifecycleReasonException
import com.readmates.session.application.model.InvalidHostSessionListQueryException
import com.readmates.session.application.model.MutationPendingException
import com.readmates.shared.adapter.`in`.web.ApiErrorBlocker
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import com.readmates.shared.mutation.application.model.IdempotencyKeyReusedException
import com.readmates.shared.mutation.application.model.InvalidMutationIdempotencyKeyException
import com.readmates.shared.mutation.application.model.UnknownMutationOperationException
import com.readmates.shared.observability.RequestIdFilter
import com.readmates.shared.paging.InvalidHostListCursorException
import jakarta.validation.ConstraintViolationException
import org.slf4j.MDC
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
            message = "적용 기록 또는 알림 이력이 있는 모임은 삭제할 수 없습니다.",
            blockers = ex.blockers.map { ApiErrorBlocker(it.code.name, it.count) },
        )

    @ExceptionHandler(HostSessionDeletionNotAllowedException::class)
    fun handleDeletionNotAllowed(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_DELETION_NOT_ALLOWED",
            message = "작성 중이거나 멤버와 준비 중인 모임만 삭제할 수 있습니다.",
        )

    @ExceptionHandler(HostSessionRecordStagingRequiredException::class)
    fun handleStagingRequired(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_RECORD_STAGING_REQUIRED",
            message = "모임 기록은 기록 초안에서 수정한 뒤 기록에 반영해 주세요.",
        )

    @ExceptionHandler(InvalidSessionExposureException::class)
    fun handleInvalidExposure(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_EXPOSURE_INVALID",
            message = "모임 보기 범위가 현재 모임 상태와 맞지 않습니다.",
        )

    @ExceptionHandler(OpenSessionAlreadyExistsException::class)
    fun handleOpenSessionExists(ex: OpenSessionAlreadyExistsException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_OPEN_ALREADY_EXISTS",
            message = "이미 진행 중인 모임이 있습니다. 그 모임을 마치거나 작성 중으로 되돌린 뒤 다시 시도하세요.",
            openSessionId = ex.openSessionId?.toString(),
        )

    @ExceptionHandler(HostSessionReopenNotAllowedException::class)
    fun handleReopenNotAllowed(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_REOPEN_NOT_ALLOWED",
            message = "기록 정리 중인 모임만 다시 열 수 있습니다.",
        )

    @ExceptionHandler(HostSessionUnpublishNotAllowedException::class)
    fun handleUnpublishNotAllowed(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_UNPUBLISH_NOT_ALLOWED",
            message = "게스트·멤버 노트에 게시된 모임만 게시를 취소할 수 있습니다.",
        )

    @ExceptionHandler(HostSessionReturnToDraftNotAllowedException::class)
    fun handleReturnToDraftNotAllowed(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "SESSION_RETURN_TO_DRAFT_NOT_ALLOWED",
            message = "멤버와 준비 중인 모임만 작성 중으로 되돌릴 수 있습니다.",
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
            message = "요청한 작업이 현재 모임 상태와 충돌합니다.",
        )

    @ExceptionHandler(
        HostSessionNotFoundException::class,
        HostSessionParticipantNotFoundException::class,
    )
    fun handleNotFound(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.NOT_FOUND,
            code = "SESSION_NOT_FOUND",
            message = "요청한 모임을 찾을 수 없습니다.",
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
            message = "모임 요청 값을 확인해 주세요.",
        )

    @ExceptionHandler(ConstraintViolationException::class)
    fun handleConstraintViolation(ex: ConstraintViolationException): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_REQUEST",
            message = "모임 요청 값을 확인해 주세요.",
            field = ex.canonicalHostSessionField(),
        )

    @ExceptionHandler(InvalidHostSessionCursorException::class, InvalidHostListCursorException::class)
    fun handleInvalidCursor(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_CURSOR",
            message = "커서가 현재 검색 조건과 일치하지 않습니다.",
        )

    @ExceptionHandler(InvalidHostSessionListQueryException::class)
    fun handleInvalidListQuery(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_REQUEST",
            message = "모임 요청 값을 확인해 주세요.",
        )

    @ExceptionHandler(HostSessionRevisionConflictException::class)
    fun handleRevisionConflict(ex: HostSessionRevisionConflictException) =
        ResponseEntity.status(HttpStatus.CONFLICT).body(
            HostSessionRevisionConflictResponse(
                message = "다른 호스트가 모임을 먼저 저장했습니다. 최신 내용을 확인한 뒤 다시 적용하세요.",
                status = HttpStatus.CONFLICT.value(),
                current = ex.current.toBody(),
                changedAt = ex.changedAt?.toString(),
                changedByDisplay = ex.changedByDisplay,
                traceId = MDC.get(RequestIdFilter.MDC_KEY),
            ),
        )

    @ExceptionHandler(HostListCursorStaleException::class)
    fun handleListCursorStale(ex: HostListCursorStaleException): ResponseEntity<HostListCursorStaleResponse> =
        ResponseEntity.status(HttpStatus.CONFLICT).body(
            HostListCursorStaleResponse(
                message = "목록이 바뀌었습니다. 처음부터 다시 불러오세요.",
                status = HttpStatus.CONFLICT.value(),
                restartTarget =
                    HostListRestartTargetBody(
                        mode =
                            ex.restartTarget.mode.name
                                .lowercase(),
                        states = ex.restartTarget.states,
                    ),
                traceId = MDC.get(RequestIdFilter.MDC_KEY),
            ),
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

    @ExceptionHandler(HostSessionChangeNotRestorableException::class)
    fun handleChangeNotRestorable(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "HOST_SESSION_CHANGE_NOT_RESTORABLE",
            message = "이 변경은 지금 복원할 수 없습니다.",
        )

    @ExceptionHandler(HostSessionRestoreStaleException::class)
    fun handleRestoreStale(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "HOST_SESSION_RESTORE_STALE",
            message = "모임이 바뀌었습니다. 최신 값을 확인한 뒤 다시 복원하세요.",
        )

    @ExceptionHandler(HostSessionTrashExpiredException::class)
    fun handleTrashExpired(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.GONE,
            code = "HOST_SESSION_TRASH_EXPIRED",
            message = "복원 기간이 지났습니다.",
        )

    @ExceptionHandler(IdempotencyKeyReusedException::class)
    fun handleIdempotencyReused(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "IDEMPOTENCY_KEY_REUSED",
            message = "같은 요청 키로 다른 내용이 이미 처리되었습니다.",
        )

    @ExceptionHandler(InvalidMutationIdempotencyKeyException::class, UnknownMutationOperationException::class)
    fun handleInvalidIdempotency(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.BAD_REQUEST,
            code = "INVALID_REQUEST",
            message = "모임 요청 값을 확인해 주세요.",
        )

    @ExceptionHandler(MutationPendingException::class)
    fun handleMutationPending(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.CONFLICT,
            code = "MUTATION_PENDING",
            message = "같은 요청이 아직 처리 중입니다.",
        )

    @ExceptionHandler(HostMutationNotAuthorizedException::class)
    fun handleMutationUnauthorized(): ResponseEntity<ApiErrorResponse> =
        apiErrorResponse(
            status = HttpStatus.FORBIDDEN,
            code = "PERMISSION_DENIED",
            message = "권한이 없습니다.",
        )
}

private val hostSessionFieldPriority =
    listOf(
        "title",
        "bookTitle",
        "author",
        "meetingDate",
        "meetingTime",
        "locationLabel",
        "meetingUrl",
        "meetingPasscode",
        "bookLink",
        "bookImageUrl",
        "questionDeadlineAt",
    ).withIndex().associate { (index, field) -> field to index }

private fun ConstraintViolationException.canonicalHostSessionField(): String? =
    constraintViolations
        .filter { violation -> violation.rootBeanClass == HostSessionRequest::class.java }
        .mapNotNull { violation ->
            violation.propertyPath
                .lastOrNull()
                ?.name
                ?.toCanonicalHostSessionField()
        }.distinct()
        .minWithOrNull(
            compareBy<String> { field -> hostSessionFieldPriority[field] ?: Int.MAX_VALUE }
                .thenBy { field -> field },
        )

private fun String.toCanonicalHostSessionField(): String? =
    when (this) {
        "title" -> "title"
        "bookTitle" -> "bookTitle"
        "bookAuthor" -> "author"
        "date", "validCalendarDate" -> "meetingDate"
        "startTime", "endTime", "validTimeRange" -> "meetingTime"
        "locationLabel" -> "locationLabel"
        "meetingUrl", "allowedMeetingUrl" -> "meetingUrl"
        "meetingPasscode" -> "meetingPasscode"
        "bookLink", "allowedBookLink" -> "bookLink"
        "bookImageUrl", "allowedBookImageUrl" -> "bookImageUrl"
        "questionDeadlineAt", "validQuestionDeadline" -> "questionDeadlineAt"
        else -> null
    }
