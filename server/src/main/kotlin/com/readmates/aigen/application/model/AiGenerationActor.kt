package com.readmates.aigen.application.model

import com.readmates.shared.security.AuthenticatedClubActor
import java.util.UUID

data class AiGenerationActor(
    override val userId: UUID,
    override val clubId: UUID,
    override val clubSlug: String,
    override val isHost: Boolean,
) : AuthenticatedClubActor
