package com.readmates.note.adapter.`in`.web

import com.readmates.note.application.port.`in`.GetNotesFeedUseCase
import com.readmates.note.application.port.`in`.ListNoteSessionsUseCase
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/notes")
class NotesFeedController(
    private val getNotesFeedUseCase: GetNotesFeedUseCase,
    private val listNoteSessionsUseCase: ListNoteSessionsUseCase,
) {
    @GetMapping("/feed")
    fun feed(
        member: CurrentMember,
        @RequestParam("sessionId", required = false) sessionId: String?,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): CursorPageResponse<NoteFeedItem> =
        getNotesFeedUseCase
            .getNotesFeed(member, sessionId, PageRequest.cursor(limit, cursor, defaultLimit = 60, maxLimit = 120))
            .mapItems { it.toNoteFeedItem() }

    @GetMapping("/sessions")
    fun sessions(
        member: CurrentMember,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ): CursorPageResponse<NoteSessionItem> =
        listNoteSessionsUseCase
            .listNoteSessions(member, PageRequest.cursor(limit, cursor, defaultLimit = 30, maxLimit = 100))
            .mapItems { it.toNoteSessionItem() }
}
