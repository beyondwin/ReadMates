package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

enum class GroundedRequestMode { PRIMARY, REPAIR, REGENERATE_SECTION }

data class GroundedRenderRequest(
    val provider: Provider,
    val sessionMeta: SessionMeta,
    val turns: List<ValidatedTranscriptTurn>,
    val hostInstructions: String? = null,
    val mode: GroundedRequestMode = GroundedRequestMode.PRIMARY,
    val currentDraft: GroundedGenerationDraft? = null,
    val requestedSection: GenerationItem? = null,
)

data class RenderedGroundedRequest(
    val systemText: String,
    val userText: String,
    val schemaJson: String,
    val maxOutputTokens: Int,
) {
    fun estimatedInputTokens(): Long =
        sequenceOf(systemText, userText, schemaJson)
            .sumOf { it.toByteArray(StandardCharsets.UTF_8).size.toLong() }

    fun sha256(): String {
        val digest = MessageDigest.getInstance("SHA-256")
        sequenceOf(systemText, userText, schemaJson, maxOutputTokens.toString()).forEach { value ->
            digest.update(value.toByteArray(StandardCharsets.UTF_8))
            digest.update(0)
        }
        return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
    }
}

fun interface GroundedRequestRenderer {
    fun render(request: GroundedRenderRequest): RenderedGroundedRequest
}
