package com.readmates.note.adapter.`in`.web

import com.readmates.note.application.port.`in`.GetNotesFeedUseCase
import com.readmates.note.application.port.`in`.ListNoteSessionsUseCase
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
    ): List<NoteFeedItem> =
        getNotesFeedUseCase.getNotesFeed(member, sessionId).map { it.toNoteFeedItem() }

    @GetMapping("/sessions")
    fun sessions(member: CurrentMember): List<NoteSessionItem> =
        listNoteSessionsUseCase.listNoteSessions(member).map { it.toNoteSessionItem() }
}
