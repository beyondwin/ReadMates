package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiGenerationActor

/**
 * Input ports for the per-club AI defaults flow (spec §7.6).
 *
 * The host of a club may view and update the default LLM model used when
 * starting an AI generation job without an explicit `model` override.
 *
 * Implementations live in `com.readmates.aigen.application.service` and
 * are exposed via the REST adapter at `/api/host/clubs/{clubSlug}/ai-defaults`.
 */
interface GetClubAiDefaultsUseCase {
    fun get(
        clubSlug: String,
        actor: AiGenerationActor,
    ): ClubAiDefaultsView
}

interface UpdateClubAiDefaultsUseCase {
    fun update(
        clubSlug: String,
        defaultModel: String,
        actor: AiGenerationActor,
    )
}

/**
 * Read-side projection of a club's AI defaults. `defaultModel` is the
 * allowlisted model name (e.g. `claude-sonnet-4-6`), or `null` when the
 * club has not chosen a default and the platform fallback applies.
 */
data class ClubAiDefaultsView(
    val defaultModel: String?,
)
