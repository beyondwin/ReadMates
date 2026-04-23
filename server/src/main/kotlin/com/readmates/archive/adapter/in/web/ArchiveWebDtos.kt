package com.readmates.archive.adapter.`in`.web

import com.fasterxml.jackson.annotation.JsonProperty

data class ArchiveSessionItem(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val attendance: Int,
    val total: Int,
    val published: Boolean,
    val state: String,
    val feedbackDocument: MemberArchiveFeedbackDocumentStatus,
)

data class MyArchiveQuestionItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class MyArchiveReviewItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val kind: String,
    val text: String,
)

data class MemberArchiveSessionDetailResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val title: String,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val locationLabel: String,
    val attendance: Int,
    val total: Int,
    val state: String,
    val myAttendanceStatus: String?,
    @get:JsonProperty("isHost")
    val isHost: Boolean,
    val publicSummary: String?,
    val publicHighlights: List<MemberArchiveHighlightItem>,
    val clubQuestions: List<MemberArchiveQuestionItem>,
    val clubOneLiners: List<MemberArchiveOneLinerItem>,
    val publicOneLiners: List<MemberArchiveOneLinerItem>,
    val myQuestions: List<MemberArchiveQuestionItem>,
    val myCheckin: MemberArchiveCheckinItem?,
    val myOneLineReview: MemberArchiveOneLineReview?,
    val myLongReview: MemberArchiveLongReview?,
    val feedbackDocument: MemberArchiveFeedbackDocumentStatus,
)

data class MemberArchiveHighlightItem(
    val text: String,
    val sortOrder: Int,
    val authorName: String?,
    val authorShortName: String?,
)

data class MemberArchiveQuestionItem(
    val priority: Int,
    val text: String,
    val draftThought: String?,
    val authorName: String,
    val authorShortName: String,
)

data class MemberArchiveCheckinItem(
    val readingProgress: Int,
)

data class MemberArchiveOneLinerItem(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)

data class MemberArchiveOneLineReview(
    val text: String,
)

data class MemberArchiveLongReview(
    val body: String,
)

data class MemberArchiveFeedbackDocumentStatus(
    val available: Boolean,
    val readable: Boolean,
    val lockedReason: String?,
    val title: String?,
    val uploadedAt: String?,
)

data class MyPageResponse(
    val displayName: String,
    val shortName: String,
    val email: String,
    val role: String,
    val membershipStatus: String,
    val clubName: String?,
    val joinedAt: String,
    val sessionCount: Int,
    val totalSessionCount: Int,
    val recentAttendances: List<MyRecentAttendanceItem>,
)

data class MyRecentAttendanceItem(
    val sessionNumber: Int,
    val attended: Boolean,
)
