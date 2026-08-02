package com.readmates.auth.infrastructure.security

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest
import java.time.Duration
import java.time.Instant

class OAuthFlowContextRepositoryTest {
    private val returnState = StubReturnState()
    private val intentStore = OAuthJoinIntentStore(Duration.ofMinutes(5))
    private val repository = OAuthFlowContextRepository(returnState, intentStore, Duration.ofMinutes(10), 4)

    @Test
    fun `crafted authorization GET without a POST-issued intent cannot create join context`() {
        val start = startRequest("state-crafted", "/clubs/reading-sai/app", "reading-sai", null)

        repository.saveAuthorizationRequest(authorization("state-crafted"), start, MockHttpServletResponse())

        assertNull(callbackContext(start, "state-crafted")?.joinClubSlug)
    }

    @Test
    fun `POST-issued intent is exact expiring and one use`() {
        val sessionOwner = MockHttpServletRequest("POST", "/api/auth/oauth/join-intent")
        val intent = intentStore.issue(sessionOwner, "reading-sai", "/clubs/reading-sai/app", Instant.now())
        val start = startRequest("state-one", "/clubs/reading-sai/app", "reading-sai", intent.token)
        start.setSession(sessionOwner.session!!)

        repository.saveAuthorizationRequest(authorization("state-one"), start, MockHttpServletResponse())
        assertEquals("reading-sai", callbackContext(start, "state-one")?.joinClubSlug)

        val replay = startRequest("state-replay", "/clubs/reading-sai/app", "reading-sai", intent.token)
        replay.setSession(sessionOwner.session!!)
        repository.saveAuthorizationRequest(authorization("state-replay"), replay, MockHttpServletResponse())
        assertNull(callbackContext(replay, "state-replay")?.joinClubSlug)
    }

    @Test
    fun `intent mismatch and expiry cannot join`() {
        val owner = MockHttpServletRequest("POST", "/api/auth/oauth/join-intent")
        val mismatch = intentStore.issue(owner, "reading-sai", "/clubs/reading-sai/app", Instant.now())
        val mismatchStart = startRequest("state-mismatch", "/clubs/other/app", "other", mismatch.token)
        mismatchStart.setSession(owner.session!!)
        repository.saveAuthorizationRequest(authorization("state-mismatch"), mismatchStart, MockHttpServletResponse())
        assertNull(callbackContext(mismatchStart, "state-mismatch")?.joinClubSlug)

        val expired = intentStore.issue(owner, "reading-sai", "/clubs/reading-sai/app", Instant.now().minusSeconds(301))
        val expiredStart = startRequest("state-expired", "/clubs/reading-sai/app", "reading-sai", expired.token)
        expiredStart.setSession(owner.session!!)
        repository.saveAuthorizationRequest(authorization("state-expired"), expiredStart, MockHttpServletResponse())
        assertNull(callbackContext(expiredStart, "state-expired")?.joinClubSlug)
    }

    @Test
    fun `raw invite parameter presence suppresses join even when blank or malformed`() {
        listOf("", "   ", "malformed").forEachIndexed { index, inviteToken ->
            val owner = MockHttpServletRequest("POST", "/api/auth/oauth/join-intent")
            val intent = intentStore.issue(owner, "reading-sai", "/clubs/reading-sai/app", Instant.now())
            val state = "state-invite-present-$index"
            val start =
                startRequest(state, "/clubs/reading-sai/app", "reading-sai", intent.token)
                    .also {
                        it.setSession(owner.session!!)
                        it.setParameter("inviteToken", inviteToken)
                    }

            repository.saveAuthorizationRequest(authorization(state), start, MockHttpServletResponse())

            val context = callbackContext(start, state)
            assertNull(context?.inviteToken)
            assertNull(context?.joinClubSlug)
        }
    }

    @Test
    fun `two tab contexts survive reverse callbacks and each state is consumed once`() {
        val owner = MockHttpServletRequest("POST", "/api/auth/oauth/join-intent")
        val alpha = intentStore.issue(owner, "reading-sai", "/clubs/reading-sai/app", Instant.now())
        val beta = intentStore.issue(owner, "sample-book-club", "/clubs/sample-book-club/app", Instant.now())
        val first =
            startRequest("state-alpha", "/clubs/reading-sai/app", "reading-sai", alpha.token)
                .also { it.setSession(owner.session!!) }
        val second =
            startRequest("state-beta", "/clubs/sample-book-club/app", "sample-book-club", beta.token)
                .also { it.setSession(owner.session!!) }

        repository.saveAuthorizationRequest(authorization("state-alpha"), first, MockHttpServletResponse())
        repository.saveAuthorizationRequest(authorization("state-beta"), second, MockHttpServletResponse())

        assertEquals("sample-book-club", callbackContext(second, "state-beta")?.joinClubSlug)
        assertEquals("reading-sai", callbackContext(first, "state-alpha")?.joinClubSlug)
        assertNull(callbackContext(first, "state-alpha"))
    }

    private fun callbackContext(
        owner: MockHttpServletRequest,
        state: String,
    ): OAuthFlowContext? {
        val callback = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        callback.setSession(owner.session!!)
        callback.setParameter("state", state)
        repository.removeAuthorizationRequest(callback, MockHttpServletResponse())
        return OAuthFlowContextRepository.consumedContext(callback)
    }

    private fun startRequest(
        state: String,
        returnTo: String,
        joinClub: String,
        intent: String?,
    ) = MockHttpServletRequest("GET", "/oauth2/authorization/google").apply {
        setParameter("returnTo", returnTo)
        setParameter("joinClub", joinClub)
        if (intent != null) setParameter("joinIntent", intent)
        setAttribute("testState", state)
    }

    private fun authorization(state: String) =
        OAuth2AuthorizationRequest
            .authorizationCode()
            .authorizationUri("https://accounts.example.test/oauth")
            .clientId("client")
            .redirectUri("https://auth.example.test/login/oauth2/code/google")
            .scopes(setOf("openid"))
            .state(state)
            .authorizationRequestUri("https://accounts.example.test/oauth?state=$state")
            .attributes(mapOf("registration_id" to "google"))
            .build()

    private class StubReturnState : OAuthReturnStateContract {
        override fun signReturnTarget(returnTo: String?): String? = returnTo?.takeIf { it.startsWith("/clubs/") }

        override fun scopedAppClubSlugFromState(signedState: String?): String? = signedState?.split('/')?.getOrNull(2)
    }
}
