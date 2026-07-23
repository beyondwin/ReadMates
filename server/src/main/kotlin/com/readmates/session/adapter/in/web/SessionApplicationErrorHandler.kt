package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.CurrentSessionNotOpenException
import com.readmates.session.application.HostSessionCloseNotAllowedException
import com.readmates.session.application.HostSessionDeletionNotAllowedException
import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.HostSessionOpenNotAllowedException
import com.readmates.session.application.HostSessionParticipantNotFoundException
import com.readmates.session.application.HostSessionPublishNotAllowedException
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.session.application.InvalidMembershipIdException
import com.readmates.session.application.InvalidQuestionSetException
import com.readmates.session.application.InvalidSessionScheduleException
import com.readmates.session.application.OpenSessionAlreadyExistsException
import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
import com.readmates.shared.adapter.`in`.web.apiErrorResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class SessionApplicationErrorHandler {
    @ExceptionHandler(
        CurrentSessionNotOpenException::class,
        OpenSessionAlreadyExistsException::class,
        HostSessionDeletionNotAllowedException::class,
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
}
