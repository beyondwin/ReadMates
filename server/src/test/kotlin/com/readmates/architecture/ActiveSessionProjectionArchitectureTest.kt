package com.readmates.architecture

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readText
import kotlin.io.path.relativeTo

class ActiveSessionProjectionArchitectureTest {
    @Test
    fun `normal session readers use active_sessions instead of raw sessions`() {
        val sourceRoot = sourceRoot()
        val writeQueries =
            sourceRoot.resolve(
                "com/readmates/session/adapter/out/persistence/HostSessionWriteQueries.kt",
            )
        assertTrue(
            MAX_NUMBER_ALLOCATION_COLLAPSED in collapseWhitespace(writeQueries.readText()),
            "HostSessionWriteQueries must keep the raw sessions max-number allocation query",
        )

        val violations =
            kotlinFiles(sourceRoot).flatMap { sourceFile ->
                val source = sourceFile.readText()
                SESSION_TABLE_SCAN.findAll(source).mapNotNull { match ->
                    if (isAllowlisted(sourceFile, source, match)) {
                        null
                    } else {
                        val lineNumber = source.take(match.range.first).count { character -> character == '\n' } + 1
                        val relative = sourceFile.toAbsolutePath().normalize().relativeTo(projectRoot())
                        "$relative:$lineNumber: ${lineAt(source, match.range.first).trim()}"
                    }
                }
            }

        assertTrue(
            violations.isEmpty(),
            "Normal session SQL must read active_sessions; only HostSessionDeletionQueries " +
                "and the HostSessionWriteQueries max-number allocation query may use sessions:\n" +
                violations.joinToString("\n"),
        )
    }

    private fun isAllowlisted(
        sourceFile: Path,
        source: String,
        match: MatchResult,
    ): Boolean {
        if (sourceFile.name == "HostSessionDeletionQueries.kt") return true
        if (sourceFile.name != "HostSessionWriteQueries.kt") return false
        val windowStart = (match.range.first - 80).coerceAtLeast(0)
        val windowEnd = (match.range.last + 40).coerceAtMost(source.length)
        return MAX_NUMBER_ALLOCATION_COLLAPSED in collapseWhitespace(source.substring(windowStart, windowEnd))
    }

    private fun kotlinFiles(root: Path): List<Path> =
        Files.walk(root).use { paths ->
            paths
                .filter { path -> Files.isRegularFile(path) && path.name.endsWith(".kt") }
                .toList()
        }

    private fun sourceRoot(): Path =
        listOf(Path.of("src/main/kotlin"), Path.of("server/src/main/kotlin"))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first(Files::exists)

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }

    private fun lineAt(
        source: String,
        index: Int,
    ): String {
        val lineStart =
            source.lastIndexOf('\n', (index - 1).coerceAtLeast(0)).let { start ->
                if (start < 0) 0 else start + 1
            }
        val lineEnd =
            source.indexOf('\n', index).let { end ->
                if (end < 0) source.length else end
            }
        return source.substring(lineStart, lineEnd)
    }

    private companion object {
        val SESSION_TABLE_SCAN = Regex("""(?i)\b(?:from|join)\s+sessions\b""")
        const val MAX_NUMBER_ALLOCATION_COLLAPSED =
            "select coalesce(max(number), 0) + 1 from sessions where club_id = ?"

        fun collapseWhitespace(value: String): String = value.replace(Regex("""\s+"""), " ")
    }
}
