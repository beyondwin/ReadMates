package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.SessionMeta
import java.util.UUID

interface LoadAiGenerationSessionMetaPort {
    fun load(sessionId: UUID): SessionMeta?
}
