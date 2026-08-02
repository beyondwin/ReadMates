package com.readmates.auth.infrastructure.security

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest
import org.springframework.stereotype.Component
import java.io.Serializable
import java.time.Duration
import java.time.Instant
import java.util.LinkedHashMap

data class OAuthFlowContext(
    val signedReturnState: String?,
    val inviteToken: String?,
    val joinClubSlug: String?,
) : Serializable {
    private companion object {
        const val serialVersionUID: Long = 1L
    }
}

@Component
class OAuthFlowContextRepository(
    private val oauthReturnState: OAuthReturnStateContract,
    private val joinIntentStore: OAuthJoinIntentStore,
    @param:Value("\${readmates.auth.oauth-context-ttl:10m}") private val ttl: Duration,
    @param:Value("\${readmates.auth.oauth-context-limit:8}") private val limit: Int,
) : AuthorizationRequestRepository<OAuth2AuthorizationRequest> {
    override fun loadAuthorizationRequest(request: HttpServletRequest): OAuth2AuthorizationRequest? =
        stateEntry(request, consume = false)?.authorizationRequest

    override fun saveAuthorizationRequest(
        authorizationRequest: OAuth2AuthorizationRequest?,
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        if (authorizationRequest == null) {
            removeAuthorizationRequest(request, response)
            return
        }
        val state = authorizationRequest.state?.takeIf { it.isNotBlank() } ?: return
        val signedReturnState = oauthReturnState.signReturnTarget(request.getParameter("returnTo"))
        val rawReturnTo = request.getParameter("returnTo")?.trim()
        val inviteToken = InviteTokenFormat.normalize(request.getParameter("inviteToken"))
        val requestedClub = OAuthGuestJoinSession.normalize(request.getParameter("joinClub"))
        val signedClub = oauthReturnState.scopedAppClubSlugFromState(signedReturnState)
        val joinClub =
            requestedClub
                ?.takeIf { inviteToken == null && it == signedClub && rawReturnTo != null }
                ?.takeIf {
                    joinIntentStore.consume(
                        request = request,
                        token = request.getParameter("joinIntent"),
                        clubSlug = it,
                        returnTo = rawReturnTo!!,
                    )
                }
        val context = OAuthFlowContext(signedReturnState, inviteToken, joinClub)
        val session = request.getSession(true)
        synchronized(session) {
            val entries = entries(session.getAttribute(SESSION_ATTRIBUTE))
            prune(entries)
            entries[state] = StoredOAuthFlow(authorizationRequest, context, Instant.now().plus(ttl).toEpochMilli())
            while (entries.size > limit.coerceIn(1, MAX_CONTEXTS)) entries.remove(entries.keys.first())
            session.setAttribute(SESSION_ATTRIBUTE, entries)
        }
    }

    override fun removeAuthorizationRequest(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ): OAuth2AuthorizationRequest? {
        val entry = stateEntry(request, consume = true) ?: return null
        request.setAttribute(CONSUMED_CONTEXT_ATTRIBUTE, entry.context)
        return entry.authorizationRequest
    }

    private fun stateEntry(
        request: HttpServletRequest,
        consume: Boolean,
    ): StoredOAuthFlow? {
        val state = request.getParameter("state")?.trim()?.takeIf { it.isNotEmpty() }
        val session = request.getSession(false)
        return if (state == null || session == null) {
            null
        } else {
            synchronized(session) {
                val entries = entries(session.getAttribute(SESSION_ATTRIBUTE))
                prune(entries)
                val entry = if (consume) entries.remove(state) else entries[state]
                if (entries.isEmpty()) {
                    session.removeAttribute(SESSION_ATTRIBUTE)
                } else {
                    session.setAttribute(SESSION_ATTRIBUTE, entries)
                }
                entry
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun entries(value: Any?): LinkedHashMap<String, StoredOAuthFlow> =
        (value as? LinkedHashMap<String, StoredOAuthFlow>) ?: LinkedHashMap()

    private fun prune(entries: LinkedHashMap<String, StoredOAuthFlow>) {
        val now = Instant.now().toEpochMilli()
        entries.entries.removeIf { it.value.expiresAtEpochMillis < now }
    }

    private data class StoredOAuthFlow(
        val authorizationRequest: OAuth2AuthorizationRequest,
        val context: OAuthFlowContext,
        val expiresAtEpochMillis: Long,
    ) : Serializable {
        private companion object {
            const val serialVersionUID: Long = 1L
        }
    }

    companion object {
        internal const val SESSION_ATTRIBUTE = "READMATES_OAUTH_STATE_CONTEXTS"
        private const val CONSUMED_CONTEXT_ATTRIBUTE = "READMATES_OAUTH_CONSUMED_CONTEXT"
        private const val MAX_CONTEXTS = 16

        fun consumedContext(request: HttpServletRequest): OAuthFlowContext? =
            request.getAttribute(CONSUMED_CONTEXT_ATTRIBUTE) as? OAuthFlowContext
    }
}
