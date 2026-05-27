package com.readmates.club.adapter.`in`.web

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice(
    assignableTypes = [
        PlatformAdminController::class,
        PlatformAdminClubController::class,
        PlatformAdminClubOperationsController::class,
        PlatformAdminSupportWorkbenchController::class,
        SupportAccessGrantController::class,
    ],
)
class PlatformAdminErrorHandler {
    @ExceptionHandler(PlatformAdminException::class)
    fun handlePlatformAdminException(exception: PlatformAdminException): ResponseEntity<Void> =
        ResponseEntity.status(PLATFORM_ADMIN_ERROR_STATUSES.getValue(exception.error)).build()
}

private val PLATFORM_ADMIN_ERROR_STATUSES: Map<PlatformAdminError, HttpStatus> =
    mapOf(
        PlatformAdminError.INVALID_DOMAIN to HttpStatus.BAD_REQUEST,
        PlatformAdminError.INVALID_CLUB to HttpStatus.BAD_REQUEST,
        PlatformAdminError.CLUB_NOT_FOUND to HttpStatus.NOT_FOUND,
        PlatformAdminError.CLUB_PUBLISH_NOT_ALLOWED to HttpStatus.CONFLICT,
        PlatformAdminError.CLUB_HOST_REQUIRED to HttpStatus.CONFLICT,
        PlatformAdminError.CLUB_SLUG_CONFLICT to HttpStatus.CONFLICT,
        PlatformAdminError.EXISTING_USER_CONFIRMATION_REQUIRED to HttpStatus.CONFLICT,
        PlatformAdminError.CLUB_DOMAIN_NOT_FOUND to HttpStatus.NOT_FOUND,
        PlatformAdminError.CLUB_DOMAIN_CONFLICT to HttpStatus.CONFLICT,
        PlatformAdminError.GRANT_NOT_FOUND to HttpStatus.NOT_FOUND,
        PlatformAdminError.GRANT_REASON_REQUIRED to HttpStatus.BAD_REQUEST,
        PlatformAdminError.SUPPORT_TARGET_NOT_FOUND to HttpStatus.BAD_REQUEST,
        PlatformAdminError.SUPPORT_TARGET_NOT_ELIGIBLE to HttpStatus.BAD_REQUEST,
        PlatformAdminError.GRANT_EXPIRY_REQUIRED to HttpStatus.BAD_REQUEST,
        PlatformAdminError.GRANT_EXPIRY_IN_PAST to HttpStatus.BAD_REQUEST,
        PlatformAdminError.GRANT_EXPIRY_TOO_LONG to HttpStatus.BAD_REQUEST,
        PlatformAdminError.GRANT_DUPLICATE_ACTIVE to HttpStatus.CONFLICT,
    )
