package com.readmates.architecture

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readLines
import kotlin.io.path.relativeTo

private val featurePackageRoots =
    linkedMapOf(
        "session" to "com/readmates/session",
        "note" to "com/readmates/note",
        "publication" to "com/readmates/publication",
        "archive" to "com/readmates/archive",
        "browse" to "com/readmates/browse",
        "sessionclosing" to "com/readmates/sessionclosing",
        "feedback" to "com/readmates/feedback",
        "auth" to "com/readmates/auth",
        "notification" to "com/readmates/notification",
        "club" to "com/readmates/club",
        "admin.audit" to "com/readmates/admin/audit",
        "admin.health" to "com/readmates/admin/health",
        "admin.operations" to "com/readmates/admin/operations",
        "observability" to "com/readmates/observability",
        "admin.analytics" to "com/readmates/admin/analytics",
        "aigen" to "com/readmates/aigen",
        "sessionimport" to "com/readmates/sessionimport",
        "sessionrecord" to "com/readmates/sessionrecord",
        "shared" to "com/readmates/shared",
    )

fun boundaryDebtImports(sourceRoot: Path): Set<String> =
    kotlinFiles(sourceRoot)
        .flatMap { source ->
            val relative = source.relativeTo(sourceRoot).toString().replace('\\', '/')
            source.readLines().mapNotNull { line ->
                val imported = normalizedReadmatesImport(line) ?: return@mapNotNull null
                if (isBoundaryDebt(relative, imported)) "$relative|$imported" else null
            }
        }.toSortedSet()

fun applicationFeatureEdges(sourceRoot: Path): Set<String> =
    featurePackageRoots
        .flatMap { (sourceFeature, packageRoot) ->
            val applicationRoot = sourceRoot.resolve(packageRoot).resolve("application")
            if (!Files.exists(applicationRoot)) return@flatMap emptyList()
            kotlinFiles(applicationRoot).flatMap { source ->
                source.readLines().mapNotNull { line ->
                    val imported = normalizedReadmatesImport(line) ?: return@mapNotNull null
                    val targetFeature = featureFor(imported) ?: return@mapNotNull null
                    if (targetFeature == sourceFeature) null else "$sourceFeature|$targetFeature"
                }
            }
        }.toSortedSet()

fun readBoundaryImportBaseline(path: Path): Set<String> =
    readArchitectureBaseline(path, "boundary import") { row ->
        val fields = row.split('|')
        fields.size == ARCHITECTURE_IDENTITY_FIELD_COUNT &&
            BOUNDARY_SOURCE.matches(fields[0]) &&
            IMPORTED_SYMBOL.matches(fields[1])
    }

fun readFeatureDependencyBaseline(path: Path): Set<String> =
    readArchitectureBaseline(path, "feature dependency") { row ->
        val fields = row.split('|')
        fields.size == ARCHITECTURE_IDENTITY_FIELD_COUNT && fields.all(FEATURE_NAME::matches)
    }

fun readRetiredBoundaryImports(path: Path): Set<String> =
    readArchitectureBaseline(path, "retired boundary import") { row ->
        val fields = row.split('|')
        fields.size == ARCHITECTURE_IDENTITY_FIELD_COUNT &&
            BOUNDARY_SOURCE.matches(fields[0]) &&
            IMPORTED_SYMBOL.matches(fields[1])
    }

fun readRetiredFeatureDependencies(path: Path): Set<String> =
    readArchitectureBaseline(path, "retired feature dependency") { row ->
        val fields = row.split('|')
        fields.size == ARCHITECTURE_IDENTITY_FIELD_COUNT && fields.all(FEATURE_NAME::matches)
    }

fun cyclicFeatureComponents(edges: Set<String>): Set<Set<String>> {
    val pairs = edges.map { edge -> edge.split('|').let { it[0] to it[1] } }
    val nodes = pairs.flatMap { (source, target) -> listOf(source, target) }.toSet()
    val adjacency = nodes.associateWith { node -> pairs.filter { it.first == node }.map { it.second }.toSet() }

    fun reachable(start: String): Set<String> {
        val seen = mutableSetOf<String>()
        val pending = ArrayDeque<String>().apply { add(start) }
        while (pending.isNotEmpty()) {
            val current = pending.removeFirst()
            if (seen.add(current)) adjacency.getValue(current).forEach(pending::addLast)
        }
        return seen
    }
    val reachability = nodes.associateWith(::reachable)
    return nodes
        .map { node ->
            nodes.filterTo(sortedSetOf()) { candidate ->
                candidate in reachability.getValue(node) && node in reachability.getValue(candidate)
            }
        }.filter { component -> component.size > 1 }
        .toSet()
}

private fun normalizedReadmatesImport(line: String): String? {
    val trimmed = line.trim()
    if (!trimmed.startsWith("import com.readmates.")) return null
    return trimmed.removePrefix("import ").replace("`", "")
}

private fun isBoundaryDebt(
    source: String,
    imported: String,
): Boolean {
    val rootedSource = "/$source"
    val inbound = "/adapter/in/" in rootedSource || "/infrastructure/security/" in rootedSource
    val application = "/application/" in rootedSource
    val outbound = "/adapter/out/" in rootedSource
    val sourceFeature = featureForSourcePath(source)
    val targetFeature = featureFor(imported)
    val crossFeatureInbound =
        ".adapter.in." in imported &&
            !imported.startsWith("com.readmates.shared.adapter.in.web.") &&
            (sourceFeature == null || targetFeature == null || sourceFeature != targetFeature)
    return (inbound && (".application.service." in imported || ".adapter.out." in imported || crossFeatureInbound)) ||
        (application && ".adapter." in imported) ||
        (outbound && (".adapter.in." in imported || ".application.service." in imported))
}

private fun featureFor(imported: String): String? =
    featurePackageRoots
        .mapValues { (_, path) -> path.replace('/', '.') }
        .entries
        .filter { (_, packageRoot) -> imported == packageRoot || imported.startsWith("$packageRoot.") }
        .maxByOrNull { (_, packageRoot) -> packageRoot.length }
        ?.key

private fun featureForSourcePath(source: String): String? =
    featurePackageRoots
        .entries
        .filter { (_, packageRoot) -> source == packageRoot || source.startsWith("$packageRoot/") }
        .maxByOrNull { (_, packageRoot) -> packageRoot.length }
        ?.key

private fun kotlinFiles(root: Path): List<Path> =
    Files.walk(root).use { paths ->
        paths.filter { path -> Files.isRegularFile(path) && path.name.endsWith(".kt") }.toList()
    }

private fun readArchitectureBaseline(
    path: Path,
    label: String,
    isValid: (String) -> Boolean,
): Set<String> {
    val rows =
        path
            .readLines()
            .filterNot { row -> row.isBlank() || row.trimStart().startsWith("#") }
            .map { row ->
                require(row == row.trim() && isValid(row)) { "Malformed $label baseline row in $path: $row" }
                row
            }
    val duplicates =
        rows
            .groupingBy { row -> row }
            .eachCount()
            .filterValues { count -> count > 1 }
            .keys
    require(duplicates.isEmpty()) { "Duplicate $label baseline rows in $path: ${duplicates.sorted().joinToString()}" }
    return rows.toSortedSet()
}

private val BOUNDARY_SOURCE = Regex("""com/readmates/[A-Za-z0-9_/]+\.kt""")
private val IMPORTED_SYMBOL = Regex("""com\.readmates\.[A-Za-z0-9_.]+""")
private val FEATURE_NAME = Regex("""[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)?""")
private const val ARCHITECTURE_IDENTITY_FIELD_COUNT = 2
