package com.readmates.support

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

class GroundedAiGenerationMigrationContractTest {
    @Test
    fun `expand migration does not rewrite stored model identifiers needed by older servers`() {
        val resource =
            javaClass.classLoader.getResource(
                "db/mysql/migration/V37__grounded_ai_generation.sql",
            )
        assertNotNull(resource)

        val migration = resource!!.readText()

        assertFalse(
            migration.contains("UPDATE ai_generation_club_defaults", ignoreCase = true),
            "An expand migration must not rewrite defaults that the previous server version still reads literally",
        )
    }
}
