package com.readmates.archive.api

import com.fasterxml.jackson.annotation.JsonProperty
import com.readmates.archive.application.ArchiveRepository
import com.readmates.auth.application.MemberAccountRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

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
)

data class MemberArchiveQuestionItem(
    val priority: Int,
    val text: String,
    val draftThought: String?,
    val authorName: String,
    val authorShortName: String,
)

data class MemberArchiveCheckinItem(
    val authorName: String,
    val authorShortName: String,
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

@RestController
@RequestMapping("/api/archive")
class ArchiveController(
    private val memberAccountRepository: MemberAccountRepository,
    private val archiveRepository: ArchiveRepository,
) {
    @GetMapping("/sessions")
    fun sessions(authentication: Authentication?): List<ArchiveSessionItem> {
        val currentMember = currentMember(authentication)
        return archiveRepository.findArchiveSessions(currentMember)
    }

    @GetMapping("/sessions/{sessionId}")
    fun sessionDetail(
        authentication: Authentication?,
        @PathVariable sessionId: String,
    ): MemberArchiveSessionDetailResponse =
        archiveRepository.findArchiveSessionDetail(currentMember(authentication), parseSessionId(sessionId))
            ?: throw ResponseStatusException(HttpStatus.NOT_FOUND)

    @GetMapping("/me/questions")
    fun myQuestions(authentication: Authentication?): List<MyArchiveQuestionItem> =
        archiveRepository.findMyQuestions(currentMember(authentication))

    @GetMapping("/me/reviews")
    fun myReviews(authentication: Authentication?): List<MyArchiveReviewItem> =
        archiveRepository.findMyReviews(currentMember(authentication))

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        val member = memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        if (!member.canBrowseMemberContent) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Member app access required")
        }
        return member
    }

    private fun parseSessionId(sessionId: String): UUID =
        runCatching { UUID.fromString(sessionId) }
            .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid session id") }
}
