package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.AiGenerationClubDefaultPort
import com.readmates.aigen.application.port.out.ClubDefault
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.shared.security.AccessDeniedException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class ClubAiDefaultsServiceTest {
    private val clubId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000a0")
    private val otherClubId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000a1")
    private val hostUserId: UUID = UUID.fromString("00000000-0000-0000-0000-0000000000b0")
    private val clubSlug = "club-1"

    private val allowedClaude = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")

    private val hostActor =
        AiGenerationActor(
            userId = hostUserId,
            membershipId = UUID.randomUUID(),
            clubId = clubId,
            clubSlug = clubSlug,
            isHost = true,
        )

    private val memberOfDifferentClub = hostActor.copy(clubId = otherClubId, clubSlug = "other")
    private val nonHostMember = hostActor.copy(isHost = false)

    private val clubDefaultPort = FakeClubDefaultPort()
    private val modelCatalog = FakeModelCatalog(allowed = setOf(allowedClaude))
    private val service = ClubAiDefaultsService(clubDefaultPort, modelCatalog)

    @Test
    fun `get returns null defaultModel when no row exists`() {
        val view = service.get(clubSlug, hostActor)
        assertThat(view.defaultModel).isNull()
    }

    @Test
    fun `get returns existing defaultModel when row exists`() {
        clubDefaultPort.put(
            ClubDefault(
                clubId = clubId,
                defaultModel = "claude-sonnet-4-6",
                updatedAt = Instant.parse("2026-05-15T10:00:00Z"),
                updatedBy = hostUserId,
            ),
        )

        val view = service.get(clubSlug, hostActor)
        assertThat(view.defaultModel).isEqualTo("claude-sonnet-4-6")
    }

    @Test
    fun `get throws AccessDeniedException when member belongs to a different club`() {
        assertThatThrownBy { service.get(clubSlug, memberOfDifferentClub) }
            .isInstanceOf(AccessDeniedException::class.java)
    }

    @Test
    fun `get throws AccessDeniedException when member is not a host`() {
        assertThatThrownBy { service.get(clubSlug, nonHostMember) }
            .isInstanceOf(AccessDeniedException::class.java)
    }

    @Test
    fun `update with allowlisted model upserts via port`() {
        service.update(clubSlug, "claude-sonnet-4-6", hostActor)

        val saved = clubDefaultPort.load(clubId)
        assertThat(saved).isNotNull
        assertThat(saved!!.defaultModel).isEqualTo("claude-sonnet-4-6")
        assertThat(saved.updatedBy).isEqualTo(hostUserId)
    }

    @Test
    fun `update with non-allowlisted model throws AI_DISABLED`() {
        // gpt model name prefix is known but the catalog hasn't allowed it.
        assertThatThrownBy { service.update(clubSlug, "gpt-4o", hostActor) }
            .isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
                assertThat(it.code).isEqualTo(ErrorCode.AI_DISABLED)
            }
        assertThat(clubDefaultPort.load(clubId)).isNull()
    }

    @Test
    fun `update with unknown model name prefix throws AI_DISABLED`() {
        assertThatThrownBy { service.update(clubSlug, "unknownmodel-1", hostActor) }
            .isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
                assertThat(it.code).isEqualTo(ErrorCode.AI_DISABLED)
            }
        assertThat(clubDefaultPort.load(clubId)).isNull()
    }

    @Test
    fun `update by member of different club throws AccessDeniedException`() {
        assertThatThrownBy {
            service.update(clubSlug, "claude-sonnet-4-6", memberOfDifferentClub)
        }.isInstanceOf(AccessDeniedException::class.java)
        assertThat(clubDefaultPort.load(clubId)).isNull()
    }

    @Test
    fun `update by non-host member throws AccessDeniedException`() {
        assertThatThrownBy {
            service.update(clubSlug, "claude-sonnet-4-6", nonHostMember)
        }.isInstanceOf(AccessDeniedException::class.java)
        assertThat(clubDefaultPort.load(clubId)).isNull()
    }

    private class FakeClubDefaultPort : AiGenerationClubDefaultPort {
        private val rows = mutableMapOf<UUID, ClubDefault>()

        fun put(row: ClubDefault) {
            rows[row.clubId] = row
        }

        override fun load(clubId: UUID): ClubDefault? = rows[clubId]

        override fun upsert(
            clubId: UUID,
            defaultModel: String,
            updatedBy: UUID,
        ) {
            rows[clubId] =
                ClubDefault(
                    clubId = clubId,
                    defaultModel = defaultModel,
                    updatedAt = Instant.parse("2026-05-16T00:00:00Z"),
                    updatedBy = updatedBy,
                )
        }
    }

    private class FakeModelCatalog(
        private val allowed: Set<ModelId>,
    ) : ModelCatalog {
        override fun allowlisted(): List<ModelId> = allowed.toList()

        override fun pricing(id: ModelId): ModelPricing =
            ModelPricing(
                inputPerMTokenUsd = BigDecimal.ZERO,
                cacheWriteInputPerMTokenUsd = BigDecimal.ZERO,
                cachedInputPerMTokenUsd = BigDecimal.ZERO,
                outputPerMTokenUsd = BigDecimal.ZERO,
            )

        override fun resolveAlias(alias: String): ModelId? = allowed.firstOrNull { it.name == alias }

        override fun isEnabled(id: ModelId): Boolean = id in allowed
    }
}
