package com.readmates.browse.application.model

data class GuestBrowseShellResult(
    val clubName: String,
    val tagline: String,
    val navigation: GuestBrowseNavigationResult,
)

data class GuestBrowseNavigationResult(
    val home: String = "OPEN",
    val current: String = "OPEN",
    val notes: String = "OPEN",
    val archive: String = "OPEN",
    val sessionDetail: String = "OPEN",
    val mySpace: String = "PREVIEW",
    val myRecords: String = "PREVIEW",
    val settings: String = "LOCKED",
    val notifications: String = "LOCKED",
    val feedback: String = "LOCKED",
    val host: String = "DENY",
)

data class GuestAttendeeResult(
    val displayName: String,
    val avatarKey: String,
    val rsvpStatus: String,
    val attendanceStatus: String,
)

data class GuestQuestionResult(
    val priority: Int,
    val text: String,
    val draftThought: String?,
    val authorName: String,
    val authorShortName: String,
    val avatarKey: String,
)

data class GuestLongReviewResult(
    val title: String,
    val content: String,
    val authorName: String,
    val authorShortName: String,
    val avatarKey: String,
)

data class GuestCurrentSessionResult(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String,
    val endTime: String,
    val questionDeadlineAt: String,
    val attendees: List<GuestAttendeeResult>,
    val questions: List<GuestQuestionResult>,
    val longReviews: List<GuestLongReviewResult>,
)

data class GuestUpcomingSessionResult(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookLink: String?,
    val bookImageUrl: String?,
    val date: String,
    val startTime: String,
    val endTime: String,
    val questionDeadlineAt: String,
    val state: String,
)

data class GuestUpcomingSessionCursor(
    val date: String,
    val startTime: String,
    val sessionId: String,
)

data class GuestCursorPage<T>(
    val items: List<T>,
    val nextCursor: String?,
)
