package com.readmates.auth.api

import com.readmates.auth.infrastructure.security.OAuthFlowContextRepository
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.http.MediaType
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.mock.web.MockHttpSession
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders
import org.springframework.web.util.UriComponentsBuilder
import tools.jackson.databind.ObjectMapper
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

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
@Tag("integration")
class OAuthAuthorizationControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val flowRepository: OAuthFlowContextRepository,
    @param:Autowired private val objectMapper: ObjectMapper,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `google authorization endpoint redirects to provider when client registration is configured`() {
        val result =
            mockMvc
                .get("/oauth2/authorization/google")
                .andExpect {
                    status { is3xxRedirection() }
                }.andReturn()

        assertTrue(
            result.response
                .getHeader(HttpHeaders.LOCATION)
                ?.startsWith("https://accounts.google.com/o/oauth2/v2/auth?") == true,
        )
    }

    @Test
    fun `google authorization redirect uri uses primary auth origin despite forwarded club host`() {
        val result =
            mockMvc
                .get("/oauth2/authorization/google") {
                    header("X-Forwarded-Host", "reading-sai.example.test")
                    header("X-Forwarded-Proto", "https")
                }.andExpect {
                    status { is3xxRedirection() }
                }.andReturn()

        val location = result.response.getHeader(HttpHeaders.LOCATION)
        val redirectUri =
            UriComponentsBuilder
                .fromUriString(location!!)
                .build()
                .queryParams
                .getFirst("redirect_uri")

        assertEquals("https://auth.readmates.example/login/oauth2/code/google", redirectUri)
    }

    @Test
    fun `google account recovery requests provider account selection`() {
        val result =
            mockMvc
                .get("/oauth2/authorization/google") {
                    param("chooseAccount", "true")
                }.andExpect {
                    status { is3xxRedirection() }
                }.andReturn()

        val parameters =
            UriComponentsBuilder
                .fromUriString(result.response.getHeader(HttpHeaders.LOCATION)!!)
                .build()
                .queryParams

        assertEquals("select_account", parameters.getFirst("prompt"))
    }

    @Test
    fun `google authorization ignores arbitrary browser provider parameters`() {
        val result =
            mockMvc
                .get("/oauth2/authorization/google") {
                    param("chooseAccount", "TRUE")
                    param("prompt", "consent")
                    param("login_hint", "attacker@example.test")
                    param("hd", "example.test")
                }.andExpect {
                    status { is3xxRedirection() }
                }.andReturn()

        val parameters =
            UriComponentsBuilder
                .fromUriString(result.response.getHeader(HttpHeaders.LOCATION)!!)
                .build()
                .queryParams

        assertNull(parameters.getFirst("prompt"))
        assertNull(parameters.getFirst("login_hint"))
        assertNull(parameters.getFirst("hd"))
    }

    @Test
    fun `google authorization captures invite token in the exact oauth state context`() {
        val result =
            mockMvc
                .get("/oauth2/authorization/google") {
                    param("inviteToken", "inviteCaptureToken00000000000000000000000000")
                }.andExpect {
                    status { is3xxRedirection() }
                }.andReturn()

        val state = oauthState(result.response.getHeader(HttpHeaders.LOCATION)!!)
        val session = result.request.getSession(false) as MockHttpSession
        val callback = callback(session, state)
        flowRepository.removeAuthorizationRequest(callback, MockHttpServletResponse())
        assertEquals(
            "inviteCaptureToken00000000000000000000000000",
            OAuthFlowContextRepository.consumedContext(callback)?.inviteToken,
        )
    }

    @Test
    fun `join intent requires same session POST and binds to the provider state`() {
        val issued =
            mockMvc
                .post("/api/auth/oauth/join-intent") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"clubSlug":"reading-sai","returnTo":"/clubs/reading-sai/app"}"""
                }.andExpect { status { isOk() } }
                .andReturn()
        val session = issued.request.getSession(false) as MockHttpSession
        val intent = objectMapper.readTree(issued.response.contentAsString).get("intent").asText()
        val started =
            mockMvc
                .perform(
                    MockMvcRequestBuilders
                        .get("/oauth2/authorization/google")
                        .session(session)
                        .param("returnTo", "/clubs/reading-sai/app")
                        .param("joinClub", "reading-sai")
                        .param("joinIntent", intent),
                ).andExpect(
                    org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .status()
                        .is3xxRedirection,
                ).andReturn()
        val callback = callback(session, oauthState(started.response.getHeader(HttpHeaders.LOCATION)!!))
        flowRepository.removeAuthorizationRequest(callback, MockHttpServletResponse())

        assertEquals("reading-sai", OAuthFlowContextRepository.consumedContext(callback)?.joinClubSlug)
    }

    @Test
    fun `crafted top level join GET without intent cannot bind membership creation`() {
        val started =
            mockMvc
                .get("/oauth2/authorization/google") {
                    param("returnTo", "/clubs/reading-sai/app")
                    param("joinClub", "reading-sai")
                }.andExpect { status { is3xxRedirection() } }
                .andReturn()
        val callback =
            callback(
                started.request.getSession(false) as MockHttpSession,
                oauthState(started.response.getHeader(HttpHeaders.LOCATION)!!),
            )
        flowRepository.removeAuthorizationRequest(callback, MockHttpServletResponse())

        assertNull(OAuthFlowContextRepository.consumedContext(callback)?.joinClubSlug)
    }

    private fun callback(
        session: MockHttpSession,
        state: String,
    ) = MockHttpServletRequest("GET", "/login/oauth2/code/google").apply {
        setSession(session)
        setParameter("state", state)
    }

    private fun oauthState(location: String): String =
        URLDecoder.decode(
            UriComponentsBuilder
                .fromUriString(location)
                .build()
                .queryParams
                .getFirst("state")!!,
            StandardCharsets.UTF_8,
        )
}
