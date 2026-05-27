package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.port.`in`.AuthorizeAiGenerationSessionUseCase
import com.readmates.aigen.application.port.out.LoadAiGenerationSessionMetaPort
import com.readmates.shared.security.AccessDeniedException
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.util.UUID

@Service
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class AiGenerationAuthorizationService(
    private val sessionMetaPort: LoadAiGenerationSessionMetaPort,
) : AuthorizeAiGenerationSessionUseCase {
    override fun authorize(
        sessionId: UUID,
        actor: AiGenerationActor,
    ): SessionMeta {
        val meta = sessionMetaPort.load(sessionId)
            ?: throw AccessDeniedException("Session $sessionId not found")
        if (meta.clubId != actor.clubId || !actor.isHost) {
            throw AccessDeniedException("Host access to session $sessionId is required")
        }
        return meta
    }
}
