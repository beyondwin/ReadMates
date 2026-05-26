package com.readmates.admin.health.adapter.out.persistence

import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import com.readmates.admin.health.application.model.DeployAttemptFinalStatus
import com.readmates.admin.health.application.model.DeployAttemptStripEntry
import com.readmates.admin.health.application.port.out.DeployLedgerPort
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant

class JsonlDeployLedgerAdapter(
    private val ledgerPathSupplier: () -> Path,
    private val objectMapper: ObjectMapper,
) : DeployLedgerPort {
    override fun tailLatestAttempts(limit: Int): List<DeployAttemptStripEntry> {
        val path = ledgerPathSupplier()
        if (!Files.exists(path)) return emptyList()

        val grouped = LinkedHashMap<String, MutableList<JsonNode>>()
        Files.newBufferedReader(path).use { reader ->
            reader.lineSequence()
                .mapNotNull { line ->
                    if (line.isBlank()) return@mapNotNull null
                    runCatching { objectMapper.readTree(line) }.getOrNull()
                }
                .forEach { event ->
                    val attemptId = event.path("attemptId").asText().ifBlank { return@forEach }
                    grouped.getOrPut(attemptId) { mutableListOf() }.add(event)
                }
        }

        val entries =
            grouped.map { (attemptId, events) ->
                val sorted = events.sortedBy { it.path("ts").asText() }
                val firstStarted = sorted.firstOrNull { it.path("event").asText() == "STARTED" } ?: sorted.first()
                val terminal = sorted.lastOrNull { it.path("status").asText() in TERMINAL_STATUSES }
                val finalStatus =
                    when (terminal?.path("status")?.asText()) {
                        "SUCCEEDED" -> DeployAttemptFinalStatus.SUCCEEDED
                        "FAILED" -> DeployAttemptFinalStatus.FAILED
                        else -> DeployAttemptFinalStatus.RUNNING
                    }
                val startedAt = Instant.parse(firstStarted.path("ts").asText())
                val endedAt = terminal?.path("ts")?.asText()?.let(Instant::parse)
                val duration = terminal?.path("durationSeconds")?.takeIf { it.isNumber }?.asLong()
                val imageTag = extractImageTag(firstStarted.path("detail").asText())
                DeployAttemptStripEntry(
                    attemptId = attemptId,
                    startedAt = startedAt,
                    endedAt = endedAt,
                    finalStatus = finalStatus,
                    imageTag = imageTag,
                    durationSeconds = duration,
                )
            }
        return entries.sortedByDescending { it.startedAt }.take(limit)
    }

    private fun extractImageTag(detail: String): String? {
        val prefix = "image="
        return detail
            .split(' ')
            .firstOrNull { it.startsWith(prefix) }
            ?.removePrefix(prefix)
            ?.takeIf { it.isNotBlank() }
    }

    private companion object {
        private val TERMINAL_STATUSES = setOf("SUCCEEDED", "FAILED")
    }
}
