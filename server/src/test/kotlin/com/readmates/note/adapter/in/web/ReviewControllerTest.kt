@file:Suppress("ktlint:standard:package-name")

package com.readmates.note.adapter.`in`.web

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.model.LongReviewResult
import com.readmates.session.application.model.OneLineReviewResult
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.port.`in`.SaveReviewUseCase
import com.readmates.shared.security.CurrentMember
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.core.MethodParameter
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.bind.support.WebDataBinderFactory
import org.springframework.web.context.request.NativeWebRequest
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.method.support.ModelAndViewContainer
import java.util.UUID

class ReviewControllerTest {
    private val saveReviewUseCase = RecordingSaveReviewUseCase()
    private val mockMvc: MockMvc =
        MockMvcBuilders
            .standaloneSetup(ReviewController(saveReviewUseCase))
            .setCustomArgumentResolvers(StubCurrentMemberResolver())
            .build()

    @Test
    fun `blank one line review is rejected before invoking the use case`() {
        mockMvc
            .post("/api/sessions/current/one-line-reviews") {
                contentType = MediaType.APPLICATION_JSON
                content = """{ "text": " " }"""
            }.andExpect {
                status { isBadRequest() }
            }

        assertEquals(0, saveReviewUseCase.invocationCount)
    }
}

private class StubCurrentMemberResolver : HandlerMethodArgumentResolver {
    override fun supportsParameter(p: MethodParameter): Boolean = p.parameterType == CurrentMember::class.java

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?,
    ): CurrentMember = currentMember
}

private val currentMember =
    CurrentMember(
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

private class RecordingSaveReviewUseCase : SaveReviewUseCase {
    var invocationCount = 0
        private set

    override fun saveOneLineReview(command: SaveOneLineReviewCommand): OneLineReviewResult {
        invocationCount += 1
        error("validation should reject the request before the use case is invoked")
    }

    override fun saveLongReview(command: SaveLongReviewCommand): LongReviewResult {
        invocationCount += 1
        error("validation should reject the request before the use case is invoked")
    }
}
