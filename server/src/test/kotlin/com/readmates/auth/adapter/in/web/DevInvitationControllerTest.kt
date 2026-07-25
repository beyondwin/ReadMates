@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.adapter.`in`.web

import com.readmates.shared.adapter.`in`.web.SharedApplicationErrorHandler
import org.junit.jupiter.api.Test
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.MockMvcBuilders

class DevInvitationControllerTest {
    private val mockMvc: MockMvc =
        MockMvcBuilders
            .standaloneSetup(DevInvitationController())
            .setControllerAdvice(SharedApplicationErrorHandler())
            .build()

    @Test
    fun `legacy dev password invitation accept endpoint returns gone`() {
        mockMvc
            .post("/api/dev/invitations/removed-password-token/accept")
            .andExpect {
                status { isGone() }
                jsonPath("$.code") { value("GONE") }
                jsonPath("$.message") { value("더 이상 사용할 수 없는 경로입니다.") }
                jsonPath("$.status") { value(410) }
            }
    }
}
