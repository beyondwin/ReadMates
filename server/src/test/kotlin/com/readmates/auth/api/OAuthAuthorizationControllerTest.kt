package com.readmates.auth.api

import com.readmates.auth.infrastructure.security.OAuthInviteTokenSession
import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.web.util.UriComponentsBuilder

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.auth-base-url=https://auth.readmates.example",
        "spring.security.oauth2.client.registration.google.client-id=test-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-secret",
        "spring.security.oauth2.client.registration.google.scope=openid,email,profile",
    ],
)
@AutoConfigureMockMvc
class OAuthAuthorizationControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
) {
    @Test
    fun `google authorization endpoint redirects to provider when client registration is configured`() {
        val result = mockMvc.get("/oauth2/authorization/google")
            .andExpect {
                status { is3xxRedirection() }
            }
            .andReturn()

        assertTrue(
            result.response.getHeader(HttpHeaders.LOCATION)
                ?.startsWith("https://accounts.google.com/o/oauth2/v2/auth?") == true,
        )
    }

    @Test
    fun `google authorization redirect uri uses primary auth origin despite forwarded club host`() {
        val result = mockMvc.get("/oauth2/authorization/google") {
            header("X-Forwarded-Host", "reading-sai.example.test")
            header("X-Forwarded-Proto", "https")
        }
            .andExpect {
                status { is3xxRedirection() }
            }
            .andReturn()

        val location = result.response.getHeader(HttpHeaders.LOCATION)
        val redirectUri = UriComponentsBuilder.fromUriString(location!!)
            .build()
            .queryParams
            .getFirst("redirect_uri")

        assertEquals("https://auth.readmates.example/login/oauth2/code/google", redirectUri)
    }

    @Test
    fun `google authorization captures invite token before provider redirect`() {
        val result = mockMvc.get("/oauth2/authorization/google") {
            param("inviteToken", "inviteCaptureToken00000000000000000000000000")
        }
            .andExpect {
                status { is3xxRedirection() }
            }
            .andReturn()

        assertEquals(
            "inviteCaptureToken00000000000000000000000000",
            result.request.getSession(false)!!.getAttribute(
                OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE,
            ),
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
