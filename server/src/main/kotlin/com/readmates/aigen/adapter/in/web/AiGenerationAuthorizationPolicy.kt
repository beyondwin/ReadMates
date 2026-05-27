package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.port.`in`.AuthorizeAiGenerationSessionUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.UUID

interface AiGenerationAuthorizationPolicy {
    fun requireHostAccess(
        sessionId: UUID,
        member: CurrentMember,
    ): SessionMeta

    fun actor(member: CurrentMember): AiGenerationActor =
        AiGenerationActor(
            userId = member.userId,
            clubId = member.clubId,
            clubSlug = member.clubSlug,
            isHost = member.isHost,
        )
}

@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class DefaultAiGenerationAuthorizationPolicy(
    private val authorizeSession: AuthorizeAiGenerationSessionUseCase,
) : AiGenerationAuthorizationPolicy {
    override fun requireHostAccess(
        sessionId: UUID,
        member: CurrentMember,
    ): SessionMeta = authorizeSession.authorize(sessionId, actor(member))
}
