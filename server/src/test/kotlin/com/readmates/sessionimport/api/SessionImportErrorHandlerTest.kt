package com.readmates.sessionimport.api

import com.readmates.sessionimport.adapter.`in`.web.SessionImportErrorHandler
import com.readmates.sessionimport.application.InvalidSessionImportException
import com.readmates.sessionimport.application.model.SessionImportIssue
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus

class SessionImportErrorHandlerTest {
    private val handler = SessionImportErrorHandler()

    @Test
    fun `invalid import returns the first public issue without private exception detail`() {
        val error =
            InvalidSessionImportException(
                listOf(
                    SessionImportIssue("FIRST", "첫 번째 공개 오류입니다."),
                    SessionImportIssue("PRIVATE", "internal import detail must stay hidden"),
                ),
            )

        val response = handler.handleInvalidImport(error)

        assertThat(response.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(response.body!!.status).isEqualTo(400)
        assertThat(response.body!!.code).isEqualTo("INVALID_SESSION_IMPORT")
        assertThat(response.body!!.message).isEqualTo("첫 번째 공개 오류입니다.")
        assertThat(response.body!!.message).doesNotContain("internal import detail", error.message)
    }

    @Test
    fun `invalid import with no issues returns the public fallback message`() {
        val response = handler.handleInvalidImport(InvalidSessionImportException(emptyList()))

        assertThat(response.statusCode).isEqualTo(HttpStatus.BAD_REQUEST)
        assertThat(response.body!!.status).isEqualTo(400)
        assertThat(response.body!!.code).isEqualTo("INVALID_SESSION_IMPORT")
        assertThat(response.body!!.message).isEqualTo("세션 import 파일을 확인해 주세요.")
    }
}
