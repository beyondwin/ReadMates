package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.`in`.ClubAiDefaultsView
import com.readmates.aigen.application.port.`in`.GetClubAiDefaultsUseCase
import com.readmates.aigen.application.port.`in`.UpdateClubAiDefaultsUseCase
import com.readmates.aigen.application.port.out.AiGenerationClubDefaultPort
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.shared.security.AccessDeniedException
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service

/**
 * Application service backing the `GET`/`PUT` `/api/host/clubs/{clubSlug}/ai-defaults`
 * endpoints (spec §7.6).
 *
 * Authorization:
 *  - The caller must be an active HOST.
 *  - The caller's actor club slug must match the path's `clubSlug`.
 * Both checks throw [AccessDeniedException], which the REST advice maps to
 * HTTP 403.
 *
 * Model validation:
 *  - The candidate `defaultModel` must resolve to a [ModelId] whose name
 *    prefix maps to a known [Provider] AND be flagged enabled by the
 *    [ModelCatalog]. Otherwise an [AiGenerationException] with
 *    [ErrorCode.AI_DISABLED] is raised (spec §7.6 + §9.2).
 */
@Service
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class ClubAiDefaultsService(
    private val clubDefaultPort: AiGenerationClubDefaultPort,
    private val modelCatalog: ModelCatalog,
) : GetClubAiDefaultsUseCase,
    UpdateClubAiDefaultsUseCase {
    override fun get(
        clubSlug: String,
        actor: AiGenerationActor,
    ): ClubAiDefaultsView {
        requireHostOfClub(clubSlug, actor)
        val row = clubDefaultPort.load(actor.clubId)
        return ClubAiDefaultsView(defaultModel = row?.defaultModel)
    }

    override fun update(
        clubSlug: String,
        defaultModel: String,
        actor: AiGenerationActor,
    ) {
        requireHostOfClub(clubSlug, actor)
        val resolved =
            resolveAllowlistedModel(defaultModel)
                ?: throw AiGenerationException.Coded(
                    ErrorCode.AI_DISABLED,
                    "model '$defaultModel' is not allowlisted",
                )
        clubDefaultPort.upsert(
            clubId = actor.clubId,
            defaultModel = resolved.name,
            updatedBy = actor.userId,
        )
    }

    private fun requireHostOfClub(
        clubSlug: String,
        actor: AiGenerationActor,
    ) {
        if (actor.clubSlug != clubSlug || !actor.isHost) {
            throw AccessDeniedException("Host of '$clubSlug' required")
        }
    }

    /**
     * Resolve `name` to an allowlisted [ModelId] or null. We try the catalog
     * alias map first (in case future entries differ from the literal name),
     * then derive the provider from the name prefix and consult
     * [ModelCatalog.isEnabled] for the final allowlist decision.
     */
    private fun resolveAllowlistedModel(name: String): ModelId? {
        val direct = modelCatalog.resolveAlias(name)
        val fallback = providerFromName(name)?.let { provider -> ModelId(provider, name) }
        return direct ?: fallback?.takeIf(modelCatalog::isEnabled)
    }

    private fun providerFromName(name: String): Provider? =
        when {
            name.startsWith("claude-") -> Provider.CLAUDE
            name.startsWith("gemini-") -> Provider.GEMINI
            name.startsWith("gpt-") -> Provider.OPENAI
            OPENAI_O_SERIES_REGEX.matches(name) -> Provider.OPENAI
            else -> null
        }

    private companion object {
        private val OPENAI_O_SERIES_REGEX = Regex("^o\\d.*")
    }
}
