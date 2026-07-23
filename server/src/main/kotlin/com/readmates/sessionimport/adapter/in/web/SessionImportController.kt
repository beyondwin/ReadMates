package com.readmates.sessionimport.adapter.`in`.web

import com.readmates.sessionimport.application.port.`in`.CommitSessionImportUseCase
import com.readmates.sessionimport.application.port.`in`.PreviewSessionImportUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/session-import")
class SessionImportController(
    private val previewSessionImportUseCase: PreviewSessionImportUseCase,
    private val commitSessionImportUseCase: CommitSessionImportUseCase,
) {
    @PostMapping("/preview")
    fun preview(
        @PathVariable sessionId: String,
        @RequestBody request: SessionImportRequest,
        member: CurrentMember,
    ) = previewSessionImportUseCase.preview(request.toCommand(member, parseSessionId(sessionId)))

    @PostMapping("/commit")
    fun commit(
        @PathVariable sessionId: String,
        @RequestBody request: SessionImportRequest,
        member: CurrentMember,
    ) = commitSessionImportUseCase
        .commit(request.toCommand(member, parseSessionId(sessionId)))
        .toResponse()

    private fun parseSessionId(value: String): UUID =
        runCatching { UUID.fromString(value) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
}
