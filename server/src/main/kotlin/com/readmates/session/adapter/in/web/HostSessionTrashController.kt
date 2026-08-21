@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.port.`in`.GetHostSessionTrashUseCase
import com.readmates.session.application.port.`in`.ListHostSessionTrashCommand
import com.readmates.session.application.port.`in`.ListHostSessionTrashUseCase
import com.readmates.session.application.port.`in`.RestoreTrashedHostSessionUseCase
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/host/sessions")
class HostSessionTrashController(
    private val listHostSessionTrashUseCase: ListHostSessionTrashUseCase,
    private val getHostSessionTrashUseCase: GetHostSessionTrashUseCase,
    private val restoreTrashedHostSessionUseCase: RestoreTrashedHostSessionUseCase,
) {
    @GetMapping("/trash")
    fun list(
        member: CurrentMember,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ) = listHostSessionTrashUseCase.list(
        ListHostSessionTrashCommand(
            host = member,
            pageRequest = PageRequest.cursor(limit, requireValidTrashCursor(cursor), defaultLimit = 50, maxLimit = 100),
        ),
    )

    @GetMapping("/{sessionId}/trash")
    fun detail(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = getHostSessionTrashUseCase.trash(HostSessionIdCommand(member, parseHostSessionId(sessionId)))

    @PostMapping("/{sessionId}/restore")
    fun restore(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = restoreTrashedHostSessionUseCase.restore(HostSessionIdCommand(member, parseHostSessionId(sessionId)))
}

private fun requireValidTrashCursor(cursor: String?): String? {
    try {
        CursorCodec.decodeStrict(cursor)
    } catch (_: IllegalArgumentException) {
        throw InvalidHostSessionCursorException()
    }
    return cursor
}
