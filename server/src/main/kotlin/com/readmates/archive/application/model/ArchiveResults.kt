package com.readmates.archive.application.model

data class ArchiveSessionResult(
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
    val feedbackDocument: MemberArchiveFeedbackDocumentStatusResult,
)

data class MyArchiveQuestionResult(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val priority: Int,
    val text: String,
    val draftThought: String?,
)

data class MyArchiveReviewResult(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val kind: String,
    val text: String,
)

data class MemberArchiveSessionDetailResult(
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
    val isHost: Boolean,
    val publicSummary: String?,
    val publicHighlights: List<MemberArchiveHighlightResult>,
    val clubQuestions: List<MemberArchiveQuestionResult>,
    val clubOneLiners: List<MemberArchiveOneLinerResult>,
    val publicOneLiners: List<MemberArchiveOneLinerResult>,
    val myQuestions: List<MemberArchiveQuestionResult>,
    val myCheckin: MemberArchiveCheckinResult?,
    val myOneLineReview: MemberArchiveOneLineReviewResult?,
    val myLongReview: MemberArchiveLongReviewResult?,
    val feedbackDocument: MemberArchiveFeedbackDocumentStatusResult,
)

data class MemberArchiveHighlightResult(
    val text: String,
    val sortOrder: Int,
    val authorName: String?,
    val authorShortName: String?,
)

data class MemberArchiveQuestionResult(
    val priority: Int,
    val text: String,
    val draftThought: String?,
    val authorName: String,
    val authorShortName: String,
)

data class MemberArchiveCheckinResult(
    val readingProgress: Int,
)

data class MemberArchiveOneLinerResult(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)

data class MemberArchiveOneLineReviewResult(
    val text: String,
)

data class MemberArchiveLongReviewResult(
    val body: String,
)

data class MemberArchiveFeedbackDocumentStatusResult(
    val available: Boolean,
    val readable: Boolean,
    val lockedReason: String?,
    val title: String?,
    val uploadedAt: String?,
)

data class MyPageResult(
    val displayName: String,
    val shortName: String,
    val email: String,
    val role: String,
    val membershipStatus: String,
    val clubName: String?,
    val joinedAt: String,
    val sessionCount: Int,
    val totalSessionCount: Int,
    val recentAttendances: List<MyRecentAttendanceResult>,
)

data class MyRecentAttendanceResult(
    val sessionNumber: Int,
    val attended: Boolean,
)
