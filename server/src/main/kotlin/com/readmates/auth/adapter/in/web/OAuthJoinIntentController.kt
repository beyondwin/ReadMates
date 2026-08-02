@file:Suppress("ktlint:standard:package-name")

package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.infrastructure.security.OAuthGuestJoinSession
import com.readmates.auth.infrastructure.security.OAuthJoinIntentStore
import com.readmates.auth.infrastructure.security.OAuthReturnState
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

data class OAuthJoinIntentRequest(
    val clubSlug: String?,
    val returnTo: String?,
)

data class OAuthJoinIntentResponse(
    val intent: String,
    val expiresAt: Instant,
)

@RestController
@RequestMapping("/api/auth/oauth")
class OAuthJoinIntentController(
    private val oauthReturnState: OAuthReturnState,
    private val joinIntentStore: OAuthJoinIntentStore,
) {
    @PostMapping("/join-intent", consumes = ["application/json"], produces = ["application/json"])
    fun issue(
        @RequestBody body: OAuthJoinIntentRequest,
        request: HttpServletRequest,
    ): ResponseEntity<OAuthJoinIntentResponse> {
        val clubSlug = OAuthGuestJoinSession.normalize(body.clubSlug)
        val returnTo = body.returnTo?.trim()
        val signedReturn = oauthReturnState.signReturnTarget(returnTo)
        return if (
            clubSlug == null ||
            signedReturn == null ||
            oauthReturnState.scopedAppClubSlugFromState(signedReturn) != clubSlug
        ) {
            ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).build()
        } else {
            val issued = joinIntentStore.issue(request, clubSlug, requireNotNull(returnTo))
            ResponseEntity
                .ok()
                .cacheControl(CacheControl.noStore())
                .body(OAuthJoinIntentResponse(issued.token, issued.expiresAt))
        }
    }
}
