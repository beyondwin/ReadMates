@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.port.`in`.PreviewHostSessionRestoreCommand
import com.readmates.session.application.port.`in`.PreviewHostSessionRestoreUseCase
import com.readmates.session.application.port.`in`.RestoreHostSessionCommand
import com.readmates.session.application.port.`in`.RestoreHostSessionUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class HostSessionRestoreRequest(
    val expectedCurrentHash: String,
)

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/changes/{changeId}")
class HostSessionRecoveryController(
    private val previewHostSessionRestoreUseCase: PreviewHostSessionRestoreUseCase,
    private val restoreHostSessionUseCase: RestoreHostSessionUseCase,
) {
    @GetMapping("/restore-preview")
    fun preview(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @PathVariable changeId: String,
    ) = previewHostSessionRestoreUseCase.preview(
        PreviewHostSessionRestoreCommand(
            host = member,
            sessionId = parseHostSessionId(sessionId),
            changeId = parseHostSessionId(changeId),
        ),
    )

    @PostMapping("/restore")
    fun restore(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @PathVariable changeId: String,
        @RequestBody request: HostSessionRestoreRequest,
    ) = restoreHostSessionUseCase.restore(
        RestoreHostSessionCommand(
            host = member,
            sessionId = parseHostSessionId(sessionId),
            changeId = parseHostSessionId(changeId),
            expectedCurrentHash = request.expectedCurrentHash,
        ),
    )
}
