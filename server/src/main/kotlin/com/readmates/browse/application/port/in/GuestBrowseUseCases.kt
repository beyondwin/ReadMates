@file:Suppress("ktlint:standard:package-name")

package com.readmates.browse.application.port.`in`

import com.readmates.browse.application.model.GuestArchiveDetailResult
import com.readmates.browse.application.model.GuestArchiveSessionResult
import com.readmates.browse.application.model.GuestBrowseShellResult
import com.readmates.browse.application.model.GuestCurrentSessionResult
import com.readmates.browse.application.model.GuestCursorPage
import com.readmates.browse.application.model.GuestNoteFeedResult
import com.readmates.browse.application.model.GuestNoteSessionResult
import com.readmates.browse.application.model.GuestUpcomingSessionResult

interface GetGuestBrowseShellUseCase {
    fun getShell(clubSlug: String): GuestBrowseShellResult?
}

interface GetGuestCurrentSessionUseCase {
    fun getCurrentSession(clubSlug: String): GuestCurrentSessionResult?
}

interface ListGuestUpcomingSessionsUseCase {
    fun listUpcomingSessions(
        clubSlug: String,
        requestedLimit: Int?,
        rawCursor: String?,
    ): GuestCursorPage<GuestUpcomingSessionResult>?
}

interface ListGuestNoteSessionsUseCase {
    fun listNoteSessions(
        clubSlug: String,
        requestedLimit: Int?,
        rawCursor: String?,
    ): GuestCursorPage<GuestNoteSessionResult>?
}

interface ListGuestNotesFeedUseCase {
    fun listNotesFeed(
        clubSlug: String,
        requestedLimit: Int?,
        rawCursor: String?,
    ): GuestCursorPage<GuestNoteFeedResult>?
}

interface ListGuestArchiveSessionsUseCase {
    fun listArchiveSessions(
        clubSlug: String,
        requestedLimit: Int?,
        rawCursor: String?,
    ): GuestCursorPage<GuestArchiveSessionResult>?
}

interface GetGuestArchiveDetailUseCase {
    fun getArchiveDetail(
        clubSlug: String,
        sessionId: String,
    ): GuestArchiveDetailResult?
}
