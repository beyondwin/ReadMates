@file:Suppress("TooManyFunctions", "ktlint:standard:package-name")

package com.readmates.browse.adapter.`in`.web

import com.readmates.browse.application.model.GuestArchiveDetailResult
import com.readmates.browse.application.model.GuestArchiveSessionResult
import com.readmates.browse.application.model.GuestAttendeeResult
import com.readmates.browse.application.model.GuestBrowseNavigationResult
import com.readmates.browse.application.model.GuestBrowseShellResult
import com.readmates.browse.application.model.GuestCurrentSessionResult
import com.readmates.browse.application.model.GuestCursorPage
import com.readmates.browse.application.model.GuestHighlightResult
import com.readmates.browse.application.model.GuestLongReviewResult
import com.readmates.browse.application.model.GuestNoteFeedResult
import com.readmates.browse.application.model.GuestNoteSessionResult
import com.readmates.browse.application.model.GuestOneLinerResult
import com.readmates.browse.application.model.GuestQuestionResult
import com.readmates.browse.application.model.GuestUpcomingSessionResult

data class GuestBrowseShellResponse(
    val clubName: String,
    val tagline: String,
    val navigation: GuestBrowseNavigationResponse,
)

data class GuestBrowseNavigationResponse(
    val home: String,
    val current: String,
    val notes: String,
    val archive: String,
    val sessionDetail: String,
    val personalSpace: String,
    val personalRecords: String,
    val settings: String,
    val notifications: String,
    val feedback: String,
    val host: String,
)

data class GuestCurrentSessionResponse(
    val currentSession: GuestCurrentSession?,
)

data class GuestCurrentSession(
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
    val attendees: List<GuestAttendee>,
    val board: GuestSessionBoard,
)

data class GuestAttendee(
    val displayName: String,
    val avatarKey: String,
    val rsvpStatus: String,
    val attendanceStatus: String,
)

data class GuestSessionBoard(
    val questions: List<GuestQuestion>,
    val longReviews: List<GuestLongReview>,
)

data class GuestQuestion(
    val priority: Int,
    val text: String,
    val draftThought: String?,
    val authorName: String,
    val authorShortName: String,
    val avatarKey: String,
)

data class GuestLongReview(
    val title: String,
    val content: String,
    val authorName: String,
    val authorShortName: String,
    val avatarKey: String,
)

data class GuestUpcomingSessionResponse(
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

data class GuestCursorPageResponse<T>(
    val items: List<T>,
    val nextCursor: String?,
)

data class GuestNoteSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val questionCount: Int,
    val oneLinerCount: Int,
    val longReviewCount: Int,
    val highlightCount: Int,
    val totalCount: Int,
)

data class GuestNoteFeedItemResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val authorName: String?,
    val authorShortName: String?,
    val avatarKey: String?,
    val kind: String,
    val text: String,
)

data class GuestArchiveSessionResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val attendance: Int,
    val total: Int,
    val state: String,
)

data class GuestHighlightResponse(
    val text: String,
    val sortOrder: Int,
    val authorName: String?,
    val authorShortName: String?,
    val avatarKey: String?,
)

data class GuestOneLinerResponse(
    val text: String,
    val authorName: String,
    val authorShortName: String,
    val avatarKey: String,
)

data class GuestArchiveDetailResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val attendance: Int,
    val total: Int,
    val state: String,
    val summary: String?,
    val highlights: List<GuestHighlightResponse>,
    val questions: List<GuestQuestion>,
    val oneLiners: List<GuestOneLinerResponse>,
    val longReviews: List<GuestLongReview>,
)

internal fun GuestBrowseShellResult.toResponse() =
    GuestBrowseShellResponse(
        clubName = clubName,
        tagline = tagline,
        navigation = navigation.toResponse(),
    )

private fun GuestBrowseNavigationResult.toResponse() =
    GuestBrowseNavigationResponse(
        home = home,
        current = current,
        notes = notes,
        archive = archive,
        sessionDetail = sessionDetail,
        personalSpace = personalSpace,
        personalRecords = personalRecords,
        settings = settings,
        notifications = notifications,
        feedback = feedback,
        host = host,
    )

internal fun GuestCurrentSessionResult.toResponse() =
    GuestCurrentSessionResponse(
        currentSession =
            GuestCurrentSession(
                sessionId = sessionId,
                sessionNumber = sessionNumber,
                title = title,
                bookTitle = bookTitle,
                bookAuthor = bookAuthor,
                bookLink = bookLink,
                bookImageUrl = bookImageUrl,
                date = date,
                startTime = startTime,
                endTime = endTime,
                questionDeadlineAt = questionDeadlineAt,
                attendees = attendees.map(GuestAttendeeResult::toResponse),
                board =
                    GuestSessionBoard(
                        questions = questions.map(GuestQuestionResult::toResponse),
                        longReviews = longReviews.map(GuestLongReviewResult::toResponse),
                    ),
            ),
    )

private fun GuestAttendeeResult.toResponse() = GuestAttendee(displayName, avatarKey, rsvpStatus, attendanceStatus)

private fun GuestQuestionResult.toResponse() =
    GuestQuestion(
        priority,
        text,
        draftThought,
        authorName,
        authorShortName,
        avatarKey,
    )

private fun GuestLongReviewResult.toResponse() = GuestLongReview(title, content, authorName, authorShortName, avatarKey)

internal fun GuestCursorPage<GuestUpcomingSessionResult>.toResponse() =
    GuestCursorPageResponse(
        items = items.map(GuestUpcomingSessionResult::toResponse),
        nextCursor = nextCursor,
    )

private fun GuestUpcomingSessionResult.toResponse() =
    GuestUpcomingSessionResponse(
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        title = title,
        bookTitle = bookTitle,
        bookAuthor = bookAuthor,
        bookLink = bookLink,
        bookImageUrl = bookImageUrl,
        date = date,
        startTime = startTime,
        endTime = endTime,
        questionDeadlineAt = questionDeadlineAt,
        state = state,
    )

internal fun GuestCursorPage<GuestNoteSessionResult>.toNoteSessionsResponse() =
    GuestCursorPageResponse(items.map(GuestNoteSessionResult::toResponse), nextCursor)

private fun GuestNoteSessionResult.toResponse() =
    GuestNoteSessionResponse(
        sessionId,
        sessionNumber,
        bookTitle,
        date,
        questionCount,
        oneLinerCount,
        longReviewCount,
        highlightCount,
        totalCount,
    )

internal fun GuestCursorPage<GuestNoteFeedResult>.toNotesFeedResponse() =
    GuestCursorPageResponse(items.map(GuestNoteFeedResult::toResponse), nextCursor)

private fun GuestNoteFeedResult.toResponse() =
    GuestNoteFeedItemResponse(
        sessionId,
        sessionNumber,
        bookTitle,
        date,
        authorName,
        authorShortName,
        avatarKey,
        kind,
        text,
    )

internal fun GuestCursorPage<GuestArchiveSessionResult>.toArchiveResponse() =
    GuestCursorPageResponse(items.map(GuestArchiveSessionResult::toResponse), nextCursor)

private fun GuestArchiveSessionResult.toResponse() =
    GuestArchiveSessionResponse(
        sessionId,
        sessionNumber,
        title,
        bookTitle,
        bookAuthor,
        bookImageUrl,
        date,
        attendance,
        total,
        state,
    )

internal fun GuestArchiveDetailResult.toResponse() =
    GuestArchiveDetailResponse(
        sessionId,
        sessionNumber,
        title,
        bookTitle,
        bookAuthor,
        bookImageUrl,
        date,
        attendance,
        total,
        state,
        summary,
        highlights.map(GuestHighlightResult::toResponse),
        questions.map(GuestQuestionResult::toResponse),
        oneLiners.map(GuestOneLinerResult::toResponse),
        longReviews.map(GuestLongReviewResult::toResponse),
    )

private fun GuestHighlightResult.toResponse() =
    GuestHighlightResponse(
        text,
        sortOrder,
        authorName,
        authorShortName,
        avatarKey,
    )

private fun GuestOneLinerResult.toResponse() = GuestOneLinerResponse(text, authorName, authorShortName, avatarKey)
