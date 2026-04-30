package com.readmates.shared.adapter.`in`.web

import com.readmates.shared.security.AccessDeniedException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class SharedApplicationErrorHandler {
    @ExceptionHandler(AccessDeniedException::class)
    fun handleAccessDenied(): ResponseEntity<Void> =
        ResponseEntity.status(HttpStatus.FORBIDDEN).build()
}
