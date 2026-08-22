package com.readmates.auth.adapter.out.persistence

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class JdbcMemberApprovalStoreAdapterTest {
    @Test
    fun `leftover addToCurrentOpenSession cannot insert or reactivate session participants`() {
        val source =
            read(
                "server/src/main/kotlin/com/readmates/auth/adapter/out/persistence/JdbcMemberApprovalStoreAdapter.kt",
            )
        val method =
            source
                .substringAfter("override fun addToCurrentOpenSession(")
                .substringBefore("override fun findMemberForHost(")
        assertThat(method)
            .`as`("leftover auto-add must not write session_participants")
            .doesNotContain("insert into session_participants")
            .doesNotContain("participation_status = 'ACTIVE'")
            .doesNotContain("on duplicate key update")
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
