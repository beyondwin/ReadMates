package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.SessionMeta
import java.util.UUID

interface AuthorizeAiGenerationSessionUseCase {
    fun authorize(
        sessionId: UUID,
        actor: AiGenerationActor,
    ): SessionMeta
}
