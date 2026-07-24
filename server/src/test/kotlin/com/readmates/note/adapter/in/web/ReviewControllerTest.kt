@file:Suppress("ktlint:standard:package-name")

package com.readmates.note.adapter.`in`.web

import com.readmates.session.application.model.LongReviewResult
import com.readmates.session.application.model.OneLineReviewResult
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.port.`in`.SaveReviewUseCase
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class ReviewControllerTest {
    private val saveReviewUseCase = RecordingSaveReviewUseCase()
    private val mockMvc: MockMvc =
        MockMvcBuilders
            .standaloneSetup(ReviewController(saveReviewUseCase))
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
