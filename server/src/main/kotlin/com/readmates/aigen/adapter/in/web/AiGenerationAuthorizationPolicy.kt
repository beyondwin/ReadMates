package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.SessionMeta
import com.readmates.shared.security.CurrentMember
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.UUID

/**
 * Authorization port for the AI generation controller. Implementations
 * verify the caller's host membership on the session's club and return
 * the [SessionMeta] the controller needs to dispatch a generation job.
 *
 * Phase 2 ships an interface + a stub `@Component` implementation that
 * throws until task 2.5 wires the real DB lookup. Tests inject a fake.
 */
interface AiGenerationAuthorizationPolicy {
    fun requireHostAccess(
        sessionId: UUID,
        member: CurrentMember,
    ): SessionMeta
}

/**
 * Stub implementation. Replaced in task 2.5 by a DB-backed adapter that
 * loads the session record, confirms the caller has an active HOST role
 * on the owning club, and returns the populated [SessionMeta]. Wired
 * only when `readmates.aigen.enabled=true`, behind a `@Primary`-free
 * bean so the real implementation can override it later.
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class StubAiGenerationAuthorizationPolicy : AiGenerationAuthorizationPolicy {
    override fun requireHostAccess(
        sessionId: UUID,
        member: CurrentMember,
    ): SessionMeta =
        throw NotImplementedError(
            "AiGenerationAuthorizationPolicy is not wired yet — task 2.5",
        )
}
