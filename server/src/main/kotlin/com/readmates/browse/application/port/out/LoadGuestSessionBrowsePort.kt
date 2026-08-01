package com.readmates.browse.application.port.out

import com.readmates.browse.application.model.GuestBrowseShellResult
import com.readmates.browse.application.model.GuestCurrentSessionResult
import com.readmates.browse.application.model.GuestUpcomingSessionCursor
import com.readmates.browse.application.model.GuestUpcomingSessionResult

interface LoadGuestSessionBrowsePort {
    fun loadShell(clubSlug: String): GuestBrowseShellResult?

    fun loadCurrentSession(clubSlug: String): GuestCurrentSessionResult?

    fun loadUpcomingSessions(
        clubSlug: String,
        cursor: GuestUpcomingSessionCursor?,
        limit: Int,
    ): List<GuestUpcomingSessionResult>
}
