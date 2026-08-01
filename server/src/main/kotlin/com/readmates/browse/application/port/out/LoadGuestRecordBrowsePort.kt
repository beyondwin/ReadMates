package com.readmates.browse.application.port.out

import com.readmates.browse.application.model.GuestArchiveDetailResult
import com.readmates.browse.application.model.GuestArchiveSessionResult
import com.readmates.browse.application.model.GuestNoteFeedCursor
import com.readmates.browse.application.model.GuestNoteFeedResult
import com.readmates.browse.application.model.GuestNoteSessionResult
import com.readmates.browse.application.model.GuestRecordCursor

interface LoadGuestRecordBrowsePort {
    fun loadNoteSessions(
        clubSlug: String,
        cursor: GuestRecordCursor?,
        limit: Int,
    ): List<GuestNoteSessionResult>

    fun loadNotesFeed(
        clubSlug: String,
        cursor: GuestNoteFeedCursor?,
        limit: Int,
    ): List<GuestNoteFeedResult>

    fun loadArchiveSessions(
        clubSlug: String,
        cursor: GuestRecordCursor?,
        limit: Int,
    ): List<GuestArchiveSessionResult>

    fun loadArchiveDetail(
        clubSlug: String,
        sessionId: String,
    ): GuestArchiveDetailResult?
}
