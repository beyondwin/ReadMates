package com.readmates.archive.adapter.out.persistence

import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveFeedbackDocumentStatusResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyRecentAttendanceResult
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import java.sql.ResultSet
import java.time.LocalDate

internal fun ResultSet.toArchiveSessionItem(currentMember: CurrentMember): ArchiveSessionResult {
    val sessionNumber = getInt("number")
    val myAttendanceStatus = getString("my_attendance_status")
    val feedbackDocumentUploadedAt = utcOffsetDateTimeOrNull("feedback_document_uploaded_at")?.toString()
    val feedbackDocumentReadable = feedbackDocumentUploadedAt != null &&
        canReadArchiveFeedbackDocument(currentMember, myAttendanceStatus)

    return ArchiveSessionResult(
        sessionId = uuid("id").toString(),
        sessionNumber = sessionNumber,
        title = getString("title"),
        bookTitle = getString("book_title"),
        bookAuthor = getString("book_author"),
        bookImageUrl = getString("book_image_url"),
        date = getObject("session_date", LocalDate::class.java).toString(),
        attendance = getInt("attendance"),
        total = getInt("total"),
        published = getBoolean("published"),
        state = getString("state"),
        feedbackDocument = MemberArchiveFeedbackDocumentStatusResult(
            available = feedbackDocumentUploadedAt != null,
            readable = feedbackDocumentReadable,
            lockedReason = when {
                feedbackDocumentUploadedAt == null -> "NOT_AVAILABLE"
                feedbackDocumentReadable -> null
                else -> "NOT_ATTENDED"
            },
            title = if (feedbackDocumentUploadedAt == null) null else "독서모임 ${sessionNumber}차 피드백",
            uploadedAt = feedbackDocumentUploadedAt,
        ),
    )
}

internal fun ResultSet.toMyArchiveQuestionResult() =
    MyArchiveQuestionResult(
        questionId = uuid("question_id").toString(),
        sessionId = uuid("id").toString(),
        sessionNumber = getInt("number"),
        bookTitle = getString("book_title"),
        date = getObject("session_date", LocalDate::class.java).toString(),
        priority = getInt("priority"),
        text = getString("text"),
        draftThought = getString("draft_thought"),
    )

internal fun ResultSet.toMyArchiveReviewResult() =
    MyArchiveReviewResult(
        reviewId = uuid("review_id").toString(),
        createdAt = utcOffsetDateTime("review_created_at").toString(),
        sessionId = uuid("session_id").toString(),
        sessionNumber = getInt("session_number"),
        bookTitle = getString("book_title"),
        date = getObject("session_date", LocalDate::class.java).toString(),
        kind = getString("kind"),
        text = getString("text"),
    )

internal fun ResultSet.toMyRecentAttendanceResult() =
    MyRecentAttendanceResult(
        sessionNumber = getInt("session_number"),
        attended = getBoolean("attended"),
    )

internal fun canReadArchiveFeedbackDocument(currentMember: CurrentMember, myAttendanceStatus: String?): Boolean =
    currentMember.isHost || (currentMember.isActive && myAttendanceStatus == "ATTENDED")
