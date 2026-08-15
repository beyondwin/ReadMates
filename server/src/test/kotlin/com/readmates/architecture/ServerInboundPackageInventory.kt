package com.readmates.architecture

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readLines

fun discoverProductionInboundPackageRoots(sourceRoot: Path): Set<String> {
    val packageNames =
        Files.walk(sourceRoot).use { paths ->
            paths
                .filter { path -> Files.isRegularFile(path) && path.name.endsWith(".kt") }
                .map { source -> productionPackageName(source) }
                .toList()
        }
    val adapterInboundRoots =
        packageNames.mapNotNull { packageName ->
            ADAPTER_INBOUND_PACKAGE.matchEntire(packageName)?.groupValues?.get(1)
        }
    val authSecurityRoots =
        packageNames
            .filter { packageName ->
                packageName == AUTH_SECURITY_INBOUND_ROOT || packageName.startsWith("$AUTH_SECURITY_INBOUND_ROOT.")
            }.map { AUTH_SECURITY_INBOUND_ROOT }
    val discovered = (adapterInboundRoots + authSecurityRoots).toSortedSet()
    require(discovered.isNotEmpty()) { "No production inbound package roots discovered under $sourceRoot" }
    return discovered
}

fun normalizeInboundRegistryRoots(patterns: Iterable<String>): Set<String> {
    val rawPatterns = patterns.toList()
    val normalized =
        rawPatterns.map { pattern ->
            require(pattern.endsWith("..")) { "Malformed inbound registry package pattern: $pattern" }
            val root = pattern.removeSuffix("..").replace("`", "")
            require(isInboundRoot(root)) { "Malformed inbound registry root: $pattern" }
            root
        }
    require(normalized.size == normalized.toSet().size) { "Duplicate inbound registry roots" }
    return normalized.toSortedSet()
}

fun requireInboundRegistryMatchesSource(
    sourceRoot: Path,
    registeredPatterns: Iterable<String>,
) {
    val discovered = discoverProductionInboundPackageRoots(sourceRoot)
    val registered = normalizeInboundRegistryRoots(registeredPatterns)
    val missing = discovered - registered
    val stale = registered - discovered
    require(missing.isEmpty() && stale.isEmpty()) {
        "Inbound registry differs from production packages; missing=${missing.sorted()}, stale=${stale.sorted()}"
    }
}

fun architectureProjectRoot(): Path =
    listOf(Path.of("."), Path.of(".."))
        .map { candidate -> candidate.toAbsolutePath().normalize() }
        .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }

private fun productionPackageName(source: Path): String {
    val packageLines = source.readLines().filter { line -> line.trimStart().startsWith("package ") }
    require(packageLines.size == 1) { "Production Kotlin source must declare exactly one package: $source" }
    val match = KOTLIN_PACKAGE.matchEntire(packageLines.single().trim())
    require(match != null) { "Malformed production package declaration in $source" }
    return match.groupValues[1].replace("`", "")
}

private fun isInboundRoot(packageName: String): Boolean =
    ADAPTER_INBOUND_ROOT.matches(packageName) || packageName == AUTH_SECURITY_INBOUND_ROOT

private val KOTLIN_PACKAGE = Regex("""package\s+($KOTLIN_IDENTIFIER(?:\.$KOTLIN_IDENTIFIER)*)""")
private val ADAPTER_INBOUND_PACKAGE = Regex("""(.+\.adapter\.in\.[^.]+)(?:\..*)?""")
private val ADAPTER_INBOUND_ROOT = Regex("""com\.readmates\..+\.adapter\.in\.[A-Za-z_][A-Za-z0-9_]*""")
private const val KOTLIN_IDENTIFIER = "(?:[A-Za-z_][A-Za-z0-9_]*|`[A-Za-z_][A-Za-z0-9_]*`)"
private const val AUTH_SECURITY_INBOUND_ROOT = "com.readmates.auth.infrastructure.security"
