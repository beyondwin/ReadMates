package com.readmates.club.application.model

import java.time.OffsetDateTime

data class HostClubOperationsSnapshot(
    val schema: String = "host.club_operations_snapshot.v1",
    val generatedAt: OffsetDateTime,
    val club: HostClubOperationsClub,
    val readiness: AdminClubReadinessSummary,
    val sessionProgress: AdminClubSessionProgress,
    val aiUsage: AdminClubAiUsage,
)

data class HostClubOperationsClub(
    val clubId: java.util.UUID,
    val slug: String,
    val name: String,
)

fun AdminClubOperationsSnapshot.toHostSnapshot(): HostClubOperationsSnapshot =
    HostClubOperationsSnapshot(
        generatedAt = generatedAt,
        club =
            HostClubOperationsClub(
                clubId = club.clubId,
                slug = club.slug,
                name = club.name,
            ),
        readiness = readiness,
        sessionProgress = sessionProgress,
        aiUsage = aiUsage,
    )
