package com.readmates.session.application

import com.readmates.shared.listing.application.model.HostListEpochKind
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class HostListEpochCoverageTest {
    @Test
    fun `every meeting and record sql sort filter source has a mutation owner`() {
        val querySql =
            read(
                "server/src/main/kotlin/com/readmates/session/adapter/out/persistence/" +
                    "HostSessionQueries.kt",
            )
        HostListEpochInventory.sources.forEach { source ->
            assertThat(querySql)
                .`as`("SQL projection must name %s", source.sqlToken)
                .contains(source.sqlToken)
            assertThat(source.mutationOwners).isNotEmpty()
            assertThat(source.kinds).isNotEmpty()
        }
        assertThat(HostListEpochInventory.sources.map { it.sqlToken }).contains(
            "sessions.state",
            "sessions.session_date",
            "sessions.title",
            "sessions.book_title",
            "sessions.number",
            "sessions.id",
            "attention_rank",
            "has_draft",
            "public_summary",
            "highlight_count",
            "one_liner_count",
            "feedback_ready",
            "access_scope",
            "site_visibility",
            "pending_rsvp_count",
            "participation_status",
            "deleted_at",
        )
    }

    @Test
    fun `attention rank inputs are version controlled per mode`() {
        val meeting = HostListEpochInventory.sources.filter { it.modes.contains(HostListEpochInventory.Mode.MEETING) }
        val record = HostListEpochInventory.sources.filter { it.modes.contains(HostListEpochInventory.Mode.RECORD) }
        assertThat(meeting.map { it.sqlToken }).contains(
            "sessions.state",
            "sessions.session_date",
            "pending_rsvp_count",
            "participation_status",
            "attention_rank",
        )
        assertThat(record.map { it.sqlToken }).contains(
            "sessions.state",
            "has_draft",
            "public_summary",
            "highlight_count",
            "one_liner_count",
            "feedback_ready",
            "access_scope",
            "site_visibility",
            "attention_rank",
        )
    }

    @Test
    fun `attendance confirmation owns the meeting epoch when it contributes to attention`() {
        val attendance =
            read("server/src/main/kotlin/com/readmates/session/application/service/HostSessionAttendanceService.kt")
        assertThat(attendance)
            .contains("HostListEpochPort")
            .contains("HostListEpochKind.MEETING")
        assertThat(
            HostListEpochInventory.sources
                .filter { source -> source.sqlToken == "attention_rank" }
                .flatMap { source -> source.mutationOwners },
        ).anySatisfy { owner ->
            assertThat(owner).endsWith("HostSessionAttendanceService.kt")
        }
    }

    @Test
    fun `every registered mutation owner bumps the matching epoch in the same class`() {
        HostListEpochInventory.sources.forEach { source ->
            source.mutationOwners.forEach { owner ->
                val sourceText = read(owner)
                assertThat(sourceText)
                    .`as`("%s must depend on HostListEpochPort", owner)
                    .contains("HostListEpochPort")
                source.kinds.forEach { kind ->
                    assertThat(sourceText)
                        .`as`("%s must bump %s", owner, kind)
                        .contains("HostListEpochKind.$kind")
                }
            }
        }
        assertThat(HostListEpochInventory.sources.flatMap { it.kinds }).contains(
            HostListEpochKind.MEETING,
            HostListEpochKind.RECORD,
        )
    }

    private fun read(relative: String): String {
        val path = projectRoot().resolve(relative)
        assertThat(Files.exists(path)).`as`("missing %s", relative).isTrue()
        return Files.readString(path)
    }

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }
}
