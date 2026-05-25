package com.readmates.shared.observability.slo

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Paths

class SloCatalogDocsConsistencyTest {
    @Test
    fun `every SLO id in slos_yaml appears in slos_md`() {
        val catalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
        val slosMd =
            Files.readString(Paths.get("../docs/operations/observability/slos.md"))
        val missing = catalog.slos.map { it.id }.filterNot { id -> slosMd.contains(id) }
        assertTrue(missing.isEmpty()) {
            "slos.md is missing references for ids: $missing. " +
                "Update docs/operations/observability/slos.md to include every id from slos.yaml."
        }
    }

    @Test
    fun `slos_md does not reference unknown ids`() {
        val catalog = SloCatalogLoader().loadFromClasspath("/slo/slos.yaml")
        val slosMd =
            Files.readString(Paths.get("../docs/operations/observability/slos.md"))
        val knownIds = catalog.slos.map { it.id }.toSet()
        val pattern = Regex("`([a-z][a-z0-9_]+)`")
        val mentionedSloIds =
            pattern
                .findAll(slosMd)
                .map { it.groupValues[1] }
                .filter { it.contains("_") && it.length >= MIN_SLO_ID_LENGTH }
                .toSet()
        val unknown =
            mentionedSloIds
                .filter { it.endsWith("_ratio") || it.endsWith("_p95") || it == "api_availability" }
                .filterNot { it in knownIds }
        assertTrue(unknown.isEmpty()) {
            "slos.md references unknown SLO ids: $unknown. " +
                "Either add them to slos.yaml or remove from slos.md."
        }
    }

    private companion object {
        private const val MIN_SLO_ID_LENGTH = 8
    }
}
