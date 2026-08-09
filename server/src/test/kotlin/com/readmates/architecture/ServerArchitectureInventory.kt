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

fun readArchitectureBaseline(path: Path): Set<String> {
    val rows =
        path.readLines()
            .map(String::trim)
            .filter { row -> row.isNotEmpty() && !row.startsWith("#") }
    require(rows.size == rows.toSet().size) { "Duplicate architecture baseline row in $path" }
    return rows.toSortedSet()
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
        .map { node -> nodes.filterTo(sortedSetOf()) { candidate ->
            candidate in reachability.getValue(node) && node in reachability.getValue(candidate)
        } }
        .filter { component -> component.size > 1 }
        .toSet()
}

private fun normalizedReadmatesImport(line: String): String? {
    val trimmed = line.trim()
    if (!trimmed.startsWith("import com.readmates.")) return null
    return trimmed.removePrefix("import ").replace("`", "")
}

private fun isBoundaryDebt(source: String, imported: String): Boolean {
    val rootedSource = "/$source"
    val inbound = "/adapter/in/" in rootedSource || "/infrastructure/security/" in rootedSource
    val application = "/application/" in rootedSource
    val outbound = "/adapter/out/" in rootedSource
    val crossFeatureInbound =
        ".adapter.in." in imported && !imported.startsWith("com.readmates.shared.adapter.in.web.")
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

private fun kotlinFiles(root: Path): List<Path> =
    Files.walk(root).use { paths ->
        paths.filter { path -> Files.isRegularFile(path) && path.name.endsWith(".kt") }.toList()
    }
