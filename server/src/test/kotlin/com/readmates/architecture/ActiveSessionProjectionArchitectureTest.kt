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
            "Normal session SQL must read active_sessions; only deletion, explicit trash projection, " +
                "and max-number allocation queries may use sessions:\n" +
                violations.joinToString("\n"),
        )
    }

    @Test
    fun `existing session updates require deleted_at is null or active_sessions`() {
        val violations =
            kotlinFiles(sourceRoot()).flatMap { sourceFile ->
                val source = sourceFile.readText()
                SESSION_UPDATE_SCAN.findAll(source).mapNotNull { match ->
                    if (isAllowlisted(sourceFile, source, match) || isGuardedSessionUpdate(source, match)) {
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
            "Existing-session UPDATE must include deleted_at is null or active_sessions:\n" +
                violations.joinToString("\n"),
        )
    }

    private fun isAllowlisted(
        sourceFile: Path,
        source: String,
        match: MatchResult,
    ): Boolean {
        val windowStart = (match.range.first - 80).coerceAtLeast(0)
        val windowEnd = (match.range.last + 180).coerceAtMost(source.length)
        val window = collapseWhitespace(source.substring(windowStart, windowEnd))
        val inMaxNumberWindow =
            MAX_NUMBER_ALLOCATION_COLLAPSED in window
        val inProjectionLockWindow = PUBLIC_PROJECTION_LOCK_COLLAPSED in window
        val inTrashProjectionQuery =
            sourceFile.name == "HostSessionWriteQueries.kt" &&
                match.range.first in namedConstantRange(source, "LOAD_PROJECTION_SQL", "VERSION_VECTOR_SQL")
        val inVersionVectorQuery =
            sourceFile.name == "HostSessionWriteQueries.kt" &&
                match.range.first in namedConstantRange(source, "VERSION_VECTOR_SQL", null)
        val inOwnedWriteFunction =
            RAW_SESSION_WRITE_FUNCTIONS[sourceFile.name]
                .orEmpty()
                .any { functionName -> match.range.first in namedFunctionRange(source, functionName) }
        return when {
            sourceFile.name == "HostSessionDeletionQueries.kt" -> true
            sourceFile.name in PUBLIC_PROJECTION_LOCK_FILES -> inProjectionLockWindow
            sourceFile.name == "HostSessionWriteQueries.kt" ->
                inMaxNumberWindow || inTrashProjectionQuery || inVersionVectorQuery || inOwnedWriteFunction
            else -> inOwnedWriteFunction
        }
    }

    private fun namedConstantRange(
        source: String,
        startName: String,
        endName: String?,
    ): IntRange {
        val start = source.indexOf("private const val $startName")
        val end = endName?.let { source.indexOf("private const val $it") }?.takeIf { it >= 0 } ?: source.length
        return start..end
    }

    private fun namedFunctionRange(
        source: String,
        functionName: String,
    ): IntRange {
        val declarations = Regex("""(?m)^[ \t]*(?:override\s+)?(?:private\s+)?fun\s+\w+\s*\(""")
        val start =
            Regex("""(?m)^[ \t]*(?:override\s+)?(?:private\s+)?fun\s+$functionName\s*\(""")
                .find(source)
                ?.range
                ?.first
                ?: return IntRange.EMPTY
        val end = declarations.find(source, start + 1)?.range?.first ?: source.length
        return start until end
    }

    private fun isGuardedSessionUpdate(
        source: String,
        match: MatchResult,
    ): Boolean {
        val windowEnd =
            source.indexOf("\"\"\"", match.range.last).let { end ->
                if (end < 0) (match.range.last + 1200).coerceAtMost(source.length) else end
            }
        val statement = collapseWhitespace(source.substring(match.range.first, windowEnd)).lowercase()
        return "deleted_at is null" in statement || "active_sessions" in statement
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
        val SESSION_UPDATE_SCAN = Regex("""(?i)\bupdate\s+sessions\b""")
        const val MAX_NUMBER_ALLOCATION_COLLAPSED =
            "select coalesce(max(number), 0) + 1 from sessions where club_id = ?"
        const val PUBLIC_PROJECTION_LOCK_COLLAPSED =
            "select id from sessions where club_id = ? and deleted_at is null order by id for update"
        val PUBLIC_PROJECTION_LOCK_FILES =
            setOf(
                "JdbcAuthPublicProjectionMutationAdapter.kt",
                "JdbcClubPublicProjectionMutationAdapter.kt",
            )
        val RAW_SESSION_WRITE_FUNCTIONS =
            mapOf(
                "JdbcPublicTakedownAdapter.kt" to setOf("loadTarget", "lockSession"),
                "JdbcMemberLifecycleStoreAdapter.kt" to
                    setOf("lockOpenSessionForUpdate", "currentParticipantSetRevision"),
                "SessionScopedNotificationGuard.kt" to setOf("lockExisting"),
                "SessionRecordPublicProjectionWriteOperations.kt" to
                    setOf("lockSession", "loadAffectedOrigin"),
                "JdbcSessionParticipationWriteAdapter.kt" to setOf("lockOpenSession"),
                "HostPublicProjectionWriteOperations.kt" to
                    setOf("rotateAffectedContent", "lockSession", "loadOrigin"),
                "JdbcHostSessionRecoveryAdapter.kt" to setOf("lockForRestore"),
                "HostSessionWriteQueries.kt" to
                    setOf(
                        "lockParticipantSetRevision",
                        "sessionRevision",
                        "lockSession",
                        "lockCurrentOpenSession",
                        "revisionConflict",
                    ),
            )

        fun collapseWhitespace(value: String): String = value.replace(Regex("""\s+"""), " ")
    }
}
