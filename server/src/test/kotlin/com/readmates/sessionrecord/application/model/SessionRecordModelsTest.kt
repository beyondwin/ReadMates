package com.readmates.sessionrecord.application.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SessionRecordModelsTest {
    @Test
    fun `draft sources exclude baseline`() {
        assertEquals(
            setOf("MANUAL", "JSON_IMPORT", "AI_GENERATED", "RESTORED"),
            SessionRecordDraftSource.entries.map { it.name }.toSet(),
        )
    }
}
