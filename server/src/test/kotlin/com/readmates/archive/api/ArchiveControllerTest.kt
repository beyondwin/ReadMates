package com.readmates.archive.api

import com.readmates.archive.adapter.`in`.web.ArchiveController
import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveFeedbackDocumentStatusResult
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.port.`in`.GetArchiveSessionDetailUseCase
import com.readmates.archive.application.port.`in`.ListArchiveSessionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveQuestionsUseCase
import com.readmates.archive.application.port.`in`.ListMyArchiveReviewsUseCase
import com.readmates.auth.adapter.`in`.security.CurrentMemberArgumentResolver
import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.JoinedClubSummary
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentPlatformAdmin
import org.junit.jupiter.api.Test
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.request.RequestPostProcessor
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.util.UUID

class ArchiveControllerTest {
    private val mockMvc: MockMvc = MockMvcBuilders
        .standaloneSetup(
            ArchiveController(
                listArchiveSessionsUseCase = archiveUseCases,
                getArchiveSessionDetailUseCase = archiveUseCases,
                listMyArchiveQuestionsUseCase = archiveUseCases,
                listMyArchiveReviewsUseCase = archiveUseCases,
            ),
        )
        .setCustomArgumentResolvers(CurrentMemberArgumentResolver(resolveCurrentMemberUseCase))
        .build()

    @Test
    fun `returns unauthorized when the current member cannot be resolved`() {
        mockMvc.get("/api/archive/sessions")
            .andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `archive sessions returns cursor page`() {
        mockMvc.get("/api/archive/sessions?limit=2") {
            with(memberUser())
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.items") { isArray() }
                jsonPath("$.nextCursor") { exists() }
                jsonPath("$.items.length()") { value(2) }
            }
    }
}

private val archiveUseCases = object :
    ListArchiveSessionsUseCase,
    GetArchiveSessionDetailUseCase,
    ListMyArchiveQuestionsUseCase,
    ListMyArchiveReviewsUseCase {
    override fun listArchiveSessions(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<ArchiveSessionResult> =
        CursorPage(
            items = listOf(
                archiveSession(sessionNumber = 3),
                archiveSession(sessionNumber = 2),
            ),
            nextCursor = "next-page",
        )

    override fun getArchiveSessionDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
    ): MemberArchiveSessionDetailResult? = null

    override fun listMyQuestions(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<MyArchiveQuestionResult> = CursorPage(emptyList(), null)

    override fun listMyReviews(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<MyArchiveReviewResult> = CursorPage(emptyList(), null)
}

private val resolveCurrentMemberUseCase = object : ResolveCurrentMemberUseCase {
    override fun resolveByEmail(email: String): CurrentMember? = currentMember
    override fun findUserIdByEmail(email: String): UUID? = currentMember.userId
    override fun resolveByUserAndClub(userId: UUID, clubId: UUID): CurrentMember? = currentMember
    override fun resolveByEmailAndClub(email: String, clubId: UUID): CurrentMember? = currentMember
    override fun listJoinedClubs(userId: UUID): List<JoinedClubSummary> = emptyList()
    override fun findPlatformAdmin(userId: UUID): CurrentPlatformAdmin? = null
}

private fun memberUser(email: String = "member@example.com"): RequestPostProcessor =
    RequestPostProcessor { request ->
        request.userPrincipal = UsernamePasswordAuthenticationToken(email, "password", emptyList())
        request
    }

private fun archiveSession(sessionNumber: Int): ArchiveSessionResult =
    ArchiveSessionResult(
        sessionId = "00000000-0000-0000-0000-00000000030$sessionNumber",
        sessionNumber = sessionNumber,
        title = "$sessionNumber session",
        bookTitle = "$sessionNumber book",
        bookAuthor = "author",
        bookImageUrl = null,
        date = "2026-04-0$sessionNumber",
        attendance = 1,
        total = 1,
        published = true,
        state = "PUBLISHED",
        feedbackDocument = MemberArchiveFeedbackDocumentStatusResult(
            available = false,
            readable = false,
            lockedReason = "NOT_AVAILABLE",
            title = null,
            uploadedAt = null,
        ),
    )

private val currentMember = CurrentMember(
    userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
    membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
    clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
    clubSlug = "reading-sai",
    email = "member@example.com",
    displayName = "Member",
    accountName = "Member",
    role = MembershipRole.MEMBER,
    membershipStatus = MembershipStatus.ACTIVE,
)
