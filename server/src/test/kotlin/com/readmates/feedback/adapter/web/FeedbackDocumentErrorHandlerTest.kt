package com.readmates.feedback.adapter.web

import com.readmates.feedback.adapter.`in`.web.FeedbackDocumentErrorHandler
import com.readmates.feedback.application.FeedbackDocumentError
import com.readmates.feedback.application.FeedbackDocumentException
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class FeedbackDocumentErrorHandlerTest {
    @Test
    fun `invalid stored document remains numeric 422`() {
        val response =
            FeedbackDocumentErrorHandler().handleFeedbackDocumentException(
                FeedbackDocumentException(
                    FeedbackDocumentError.INVALID_STORED_DOCUMENT,
                    "invalid stored document",
                ),
            )

        assertThat(response.statusCode).isEqualTo(HttpStatus.UNPROCESSABLE_CONTENT)
        assertThat(response.statusCode.value()).isEqualTo(422)
    }
}
