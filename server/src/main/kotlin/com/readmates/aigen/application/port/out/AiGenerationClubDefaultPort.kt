package com.readmates.aigen.application.port.out

import java.time.Instant
import java.util.UUID

interface AiGenerationClubDefaultPort {
    fun load(clubId: UUID): ClubDefault?

    fun upsert(
        clubId: UUID,
        defaultModel: String,
        updatedBy: UUID,
    )
}

data class ClubDefault(
    val clubId: UUID,
    val defaultModel: String,
    val updatedAt: Instant,
    val updatedBy: UUID,
)
