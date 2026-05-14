package com.readmates.architecture

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readLines
import kotlin.io.path.relativeTo

@Tag("architecture")
class ServerArchitectureBoundaryTest {
    private val importedClasses =
        ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.readmates")

    private val migratedWebAdapterPackages =
        arrayOf(
            "com.readmates.session.adapter.in.web..",
            "com.readmates.note.adapter.in.web..",
            "com.readmates.publication.adapter.in.web..",
            "com.readmates.archive.adapter.in.web..",
            "com.readmates.feedback.adapter.in.web..",
            "com.readmates.auth.adapter.in.web..",
            "com.readmates.notification.adapter.in.web..",
            "com.readmates.shared.adapter.in.web..",
            "com.readmates.club.adapter.in.web..",
        )

    private val migratedApplicationPackages =
        arrayOf(
            "com.readmates.session.application..",
            "com.readmates.note.application..",
            "com.readmates.publication.application..",
            "com.readmates.archive.application..",
            "com.readmates.feedback.application..",
            "com.readmates.auth.application..",
            "com.readmates.notification.application..",
            "com.readmates.club.application..",
        )

    @Test
    fun `migrated web adapters do not depend on persistence or legacy repositories`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedWebAdapterPackages)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework.jdbc..",
                "..adapter.out.persistence..",
                "..adapter.out.redis..",
                "org.springframework.data.redis..",
            ).check(importedClasses)

        noClasses()
            .that()
            .resideInAnyPackage(*migratedWebAdapterPackages)
            .should()
            .dependOnClassesThat()
            .haveSimpleNameEndingWith("Repository")
            .check(importedClasses)
    }

    @Test
    fun `migrated application packages do not depend on adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedApplicationPackages)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..adapter.in.web..",
                "..adapter.out.persistence..",
                "..adapter.out.redis..",
            ).check(importedClasses)
    }

    @Test
    fun `migrated application packages do not depend on jdbc or dao frameworks`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedApplicationPackages)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework.jdbc..",
                "org.springframework.dao..",
                "org.springframework.data.redis..",
            ).check(importedClasses)
    }

    @Test
    fun `notification application does not depend on legacy notification outbox port`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.notification.application..")
            .should()
            .dependOnClassesThat()
            .haveSimpleName("NotificationOutboxPort")
            .check(importedClasses)
    }

    @Test
    fun `session application does not depend on removed host session write port`() {
        val forbiddenTypeName = "HostSessionWritePort"
        val bytecodeViolations =
            importedClasses
                .filter { javaClass ->
                    javaClass.packageName == "com.readmates.session.application" ||
                        javaClass.packageName.startsWith("com.readmates.session.application.")
                }.flatMap { javaClass ->
                    val classViolation = if (javaClass.simpleName == forbiddenTypeName) listOf(javaClass.name) else emptyList()
                    val dependencyViolations =
                        javaClass.directDependenciesFromSelf
                            .filter { dependency -> dependency.targetClass.simpleName == forbiddenTypeName }
                            .map { dependency -> "${javaClass.name} -> ${dependency.targetClass.name}" }
                    classViolation + dependencyViolations
                }.distinct()
                .sorted()
        val sourceViolations =
            sessionApplicationSourceFiles()
                .flatMap { sourceFile ->
                    sourceFile
                        .readLines()
                        .mapIndexedNotNull { index, line ->
                            if (forbiddenTypeName in line) {
                                "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                            } else {
                                null
                            }
                        }
                }.distinct()
                .sorted()
        val violations = (bytecodeViolations + sourceViolations).distinct().sorted()

        assertTrue(
            violations.isEmpty(),
            "Session application code must not reference removed $forbiddenTypeName:\n${violations.joinToString("\n")}",
        )
    }

    @Test
    fun `auth production code does not reference legacy member account store port`() {
        val forbiddenTypeName = "MemberAccountStorePort"
        val bytecodeViolations =
            importedClasses
                .filter { javaClass ->
                    javaClass.packageName == "com.readmates.auth" || javaClass.packageName.startsWith("com.readmates.auth.")
                }.flatMap { javaClass ->
                    val classViolation = if (javaClass.simpleName == forbiddenTypeName) listOf(javaClass.name) else emptyList()
                    val dependencyViolations =
                        javaClass.directDependenciesFromSelf
                            .filter { dependency -> dependency.targetClass.simpleName == forbiddenTypeName }
                            .map { dependency -> "${javaClass.name} -> ${dependency.targetClass.name}" }
                    classViolation + dependencyViolations
                }.distinct()
                .sorted()
        val sourceViolations =
            authProductionSourceFiles()
                .flatMap { sourceFile ->
                    sourceFile
                        .readLines()
                        .mapIndexedNotNull { index, line ->
                            if (forbiddenTypeName in line) {
                                "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                            } else {
                                null
                            }
                        }
                }.distinct()
                .sorted()
        val violations = (bytecodeViolations + sourceViolations).distinct().sorted()

        assertTrue(
            violations.isEmpty(),
            "Auth production code must not reference legacy $forbiddenTypeName:\n${violations.joinToString("\n")}",
        )
    }

    @Test
    fun `persistence adapters require jdbc template directly`() {
        val violations =
            persistenceAdapterSourceFiles()
                .filter { sourceFile ->
                    sourceFile.readLines().any { line -> "ObjectProvider<JdbcTemplate>" in line }
                }.map { sourceFile -> sourceFile.relativeTo(sourceRoot()).toString() }
                .sorted()

        assertTrue(
            violations.isEmpty(),
            "Persistence adapters must inject JdbcTemplate directly:\n${violations.joinToString("\n")}",
        )
    }

    @Test
    fun `outbound ports do not provide default runtime failure implementations`() {
        val violations =
            Files
                .walk(sourceRoot())
                .use { paths ->
                    paths
                        .filter { it.name.endsWith("Port.kt") }
                        .flatMap { sourceFile ->
                            val lines = sourceFile.readLines()
                            lines
                                .mapIndexedNotNull { index, line ->
                                    val lineText = line.trim()
                                    if (lineText.isRuntimeFailureDefault()) {
                                        "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: $lineText"
                                    } else {
                                        null
                                    }
                                }.stream()
                        }.toList()
                }.sorted()

        assertTrue(
            violations.isEmpty(),
            "Outbound ports must not hide unsupported behavior behind default runtime failures:\n${violations.joinToString("\n")}",
        )
    }

    private fun String.isRuntimeFailureDefault(): Boolean =
        !startsWith("//") &&
            listOf(
                "= error(",
                "= throw",
                "= TODO(",
                "error(",
                "throw ",
                "TODO(",
            ).any { marker -> marker in this }

    @Test
    fun `persistence adapters do not depend on spring web http types outside baseline exceptions`() {
        val forbiddenPrefixes =
            listOf(
                "org.springframework.http.",
                "org.springframework.web.",
            )
        val baselineExceptionClasses = emptySet<String>()
        val baselineExceptionImports = emptySet<String>()
        val bytecodeViolations =
            importedClasses
                .filter { javaClass -> javaClass.packageName.contains(".adapter.out.persistence") }
                .filterNot { javaClass -> javaClass.name in baselineExceptionClasses }
                .flatMap { javaClass ->
                    javaClass.directDependenciesFromSelf
                        .filter { dependency ->
                            forbiddenPrefixes.any { forbiddenPrefix ->
                                dependency.targetClass.name.startsWith(forbiddenPrefix)
                            }
                        }.map { dependency -> "${javaClass.name} -> ${dependency.targetClass.name}" }
                }.distinct()
                .sorted()
        val sourceViolations =
            persistenceAdapterSourceFiles()
                .flatMap { sourceFile ->
                    val relativePath = sourceFile.relativeTo(sourceRoot()).toString()
                    sourceFile
                        .readLines()
                        .filter { line ->
                            val importName = line.trim().removePrefix("import ").trim()
                            forbiddenPrefixes.any { forbiddenPrefix -> importName.startsWith(forbiddenPrefix) }
                        }.map { line -> "$relativePath: ${line.trim()}" }
                }.distinct()
                .sorted()
                .filterNot { violation -> violation in baselineExceptionImports }
        val violations = (bytecodeViolations + sourceViolations).distinct().sorted()

        assertTrue(
            violations.isEmpty(),
            "Persistence adapters must not depend on Spring HTTP/Web types outside explicit baseline exceptions:\n" +
                violations.joinToString("\n"),
        )
    }

    @Test
    fun `member profile application service does not depend on web status types`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.auth.application.service..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework.http..",
                "org.springframework.web..",
            ).check(importedClasses)
    }

    @Test
    fun `application packages do not depend on spring web http or security types`() {
        val forbiddenPrefixes =
            listOf(
                "org.springframework.http.",
                "org.springframework.security.",
                "org.springframework.web.",
            )
        val bytecodeViolations =
            importedClasses
                .filter { javaClass -> javaClass.residesInAnyPackagePattern(migratedApplicationPackages) }
                .flatMap { javaClass ->
                    javaClass.directDependenciesFromSelf
                        .filter { dependency ->
                            forbiddenPrefixes.any { forbiddenPrefix ->
                                dependency.targetClass.name.startsWith(forbiddenPrefix)
                            }
                        }.map { dependency -> "${javaClass.name} -> ${dependency.targetClass.name}" }
                }.distinct()
                .sorted()
        val sourceViolations =
            applicationSourceFiles()
                .flatMap { sourceFile ->
                    sourceFile
                        .readLines()
                        .filter { line ->
                            val importName = line.trim().removePrefix("import ").trim()
                            forbiddenPrefixes.any { forbiddenPrefix -> importName.startsWith(forbiddenPrefix) }
                        }.map { line ->
                            "${sourceFile.relativeTo(sourceRoot())}: ${line.trim()}"
                        }
                }.distinct()
                .sorted()
        val violations = (bytecodeViolations + sourceViolations).distinct().sorted()

        assertTrue(
            violations.isEmpty(),
            "Application packages must not depend on Spring HTTP/Web/Security types:\n${violations.joinToString("\n")}",
        )
    }

    private fun com.tngtech.archunit.core.domain.JavaClass.residesInAnyPackagePattern(patterns: Array<String>): Boolean =
        patterns.any { pattern ->
            val packagePrefix = pattern.removeSuffix("..")
            packageName == packagePrefix || packageName.startsWith("$packagePrefix.")
        }

    private fun applicationSourceFiles(): List<Path> =
        migratedApplicationPackages
            .map { pattern -> sourceRoot().resolve(pattern.removeSuffix("..").replace('.', '/')) }
            .filter(Files::exists)
            .flatMap { packageRoot ->
                Files
                    .walk(packageRoot)
                    .use { paths -> paths.filter { it.name.endsWith(".kt") }.toList() }
            }

    private fun authProductionSourceFiles(): List<Path> {
        val authRoot = sourceRoot().resolve("com/readmates/auth")
        if (!Files.exists(authRoot)) {
            return emptyList()
        }
        return Files
            .walk(authRoot)
            .use { paths -> paths.filter { it.name.endsWith(".kt") }.toList() }
    }

    private fun sessionApplicationSourceFiles(): List<Path> {
        val sessionApplicationRoot = sourceRoot().resolve("com/readmates/session/application")
        if (!Files.exists(sessionApplicationRoot)) {
            return emptyList()
        }
        return Files
            .walk(sessionApplicationRoot)
            .use { paths -> paths.filter { it.name.endsWith(".kt") }.toList() }
    }

    private fun persistenceAdapterSourceFiles(): List<Path> =
        Files
            .walk(sourceRoot())
            .use { paths ->
                paths
                    .filter { path ->
                        path.name.endsWith(".kt") &&
                            path.toString().contains(Path.of("adapter", "out", "persistence").toString())
                    }.toList()
            }

    private fun sourceRoot(): Path =
        listOf(Path.of("src/main/kotlin"), Path.of("server/src/main/kotlin"))
            .first(Files::exists)

    @Test
    fun `auth application services live in application service package`() {
        classes()
            .that()
            .resideInAPackage("com.readmates.auth.application..")
            .and()
            .areAnnotatedWith(Service::class.java)
            .should()
            .resideInAPackage("com.readmates.auth.application.service..")
            .check(importedClasses)
    }

    @Test
    fun `domain classes do not depend on adapters or web and jdbc frameworks`() {
        noClasses()
            .that()
            .resideInAnyPackage("..domain..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..adapter..",
                "org.springframework.web..",
                "org.springframework.jdbc..",
            ).check(importedClasses)
    }
}
