package com.readmates.architecture

import com.tngtech.archunit.base.DescribedPredicate
import com.tngtech.archunit.core.domain.JavaClass
import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes
import com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.name
import kotlin.io.path.readLines
import kotlin.io.path.readText
import kotlin.io.path.relativeTo

private val importedClasses =
    ClassFileImporter()
        .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
        .importPackages("com.readmates")

private enum class ServerSliceType {
    WRITE,
    READ,
    OPS_READ,
    WORKFLOW,
    SHARED,
}

private data class ServerSlice(
    val name: String,
    val type: ServerSliceType,
    val inboundAdapterPackages: List<String> = emptyList(),
    val applicationPackages: List<String> = emptyList(),
)

private val serverSlices =
    listOf(
        ServerSlice(
            name = "session",
            type = ServerSliceType.WRITE,
            inboundAdapterPackages = listOf("com.readmates.session.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.session.application.."),
        ),
        ServerSlice(
            name = "note",
            type = ServerSliceType.READ,
            inboundAdapterPackages = listOf("com.readmates.note.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.note.application.."),
        ),
        ServerSlice(
            name = "publication",
            type = ServerSliceType.READ,
            inboundAdapterPackages = listOf("com.readmates.publication.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.publication.application.."),
        ),
        ServerSlice(
            name = "archive",
            type = ServerSliceType.READ,
            inboundAdapterPackages = listOf("com.readmates.archive.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.archive.application.."),
        ),
        ServerSlice(
            name = "browse",
            type = ServerSliceType.READ,
            inboundAdapterPackages = listOf("com.readmates.browse.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.browse.application.."),
        ),
        ServerSlice(
            name = "sessionclosing",
            type = ServerSliceType.READ,
            inboundAdapterPackages = listOf("com.readmates.sessionclosing.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.sessionclosing.application.."),
        ),
        ServerSlice(
            name = "feedback",
            type = ServerSliceType.WORKFLOW,
            inboundAdapterPackages = listOf("com.readmates.feedback.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.feedback.application.."),
        ),
        ServerSlice(
            name = "auth",
            type = ServerSliceType.WRITE,
            inboundAdapterPackages =
                listOf(
                    "com.readmates.auth.adapter.in.web..",
                    "com.readmates.auth.adapter.in.security..",
                    "com.readmates.auth.infrastructure.security..",
                ),
            applicationPackages = listOf("com.readmates.auth.application.."),
        ),
        ServerSlice(
            name = "notification",
            type = ServerSliceType.WRITE,
            inboundAdapterPackages =
                listOf(
                    "com.readmates.notification.adapter.in.web..",
                    "com.readmates.notification.adapter.in.kafka..",
                    "com.readmates.notification.adapter.in.scheduler..",
                ),
            applicationPackages = listOf("com.readmates.notification.application.."),
        ),
        ServerSlice(
            name = "club",
            type = ServerSliceType.WRITE,
            inboundAdapterPackages = listOf("com.readmates.club.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.club.application.."),
        ),
        ServerSlice(
            name = "admin.audit",
            type = ServerSliceType.READ,
            inboundAdapterPackages = listOf("com.readmates.admin.audit.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.admin.audit.application.."),
        ),
        ServerSlice(
            name = "admin.health",
            type = ServerSliceType.OPS_READ,
            inboundAdapterPackages =
                listOf(
                    "com.readmates.admin.health.adapter.in.web..",
                    "com.readmates.admin.health.adapter.in.scheduling..",
                ),
            applicationPackages = listOf("com.readmates.admin.health.application.."),
        ),
        ServerSlice(
            name = "admin.operations",
            type = ServerSliceType.WORKFLOW,
            inboundAdapterPackages = listOf("com.readmates.admin.operations.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.admin.operations.application.."),
        ),
        ServerSlice(
            name = "observability",
            type = ServerSliceType.OPS_READ,
            inboundAdapterPackages = listOf("com.readmates.observability.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.observability.application.."),
        ),
        ServerSlice(
            name = "admin.analytics",
            type = ServerSliceType.READ,
            inboundAdapterPackages = listOf("com.readmates.admin.analytics.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.admin.analytics.application.."),
        ),
        ServerSlice(
            name = "aigen",
            type = ServerSliceType.WORKFLOW,
            inboundAdapterPackages =
                listOf(
                    "com.readmates.aigen.adapter.in.web..",
                    "com.readmates.aigen.adapter.in.messaging..",
                    "com.readmates.aigen.adapter.in.scheduling..",
                ),
            applicationPackages = listOf("com.readmates.aigen.application.."),
        ),
        ServerSlice(
            name = "sessionimport",
            type = ServerSliceType.WORKFLOW,
            inboundAdapterPackages = listOf("com.readmates.sessionimport.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.sessionimport.application.."),
        ),
        ServerSlice(
            name = "sessionrecord",
            type = ServerSliceType.WORKFLOW,
            inboundAdapterPackages = listOf("com.readmates.sessionrecord.adapter.in.web.."),
            applicationPackages = listOf("com.readmates.sessionrecord.application.."),
        ),
        ServerSlice(
            name = "shared",
            type = ServerSliceType.SHARED,
            inboundAdapterPackages = listOf("com.readmates.shared.adapter.in.web.."),
        ),
    )

private val migratedApplicationPackages =
    serverSlices
        .flatMap(ServerSlice::applicationPackages)
        .toTypedArray()

private val migratedInboundAdapterPackages =
    serverSlices
        .flatMap(ServerSlice::inboundAdapterPackages)
        .toTypedArray()

private val legacyRepositoryDependencyTarget: DescribedPredicate<JavaClass> =
    DescribedPredicate.describe("project or legacy persistence repository") { target ->
        target.simpleName.endsWith("Repository") &&
            target.name !in
            setOf(
                "com.readmates.auth.infrastructure.security.OAuthFlowContextRepository",
                "org.springframework.security.oauth2.client.registration.ClientRegistrationRepository",
                "org.springframework.security.oauth2.client.web.AuthorizationRequestRepository",
            )
    }

@Tag("architecture")
class ServerArchitectureBoundaryTest {
    @Test
    fun `admin operations is registered as workflow slice`() {
        val adminOperations = serverSlices.single { slice -> slice.name == "admin.operations" }

        assertEquals(ServerSliceType.WORKFLOW, adminOperations.type)
        assertEquals(
            listOf("com.readmates.admin.operations.adapter.in.web.."),
            adminOperations.inboundAdapterPackages,
        )
        assertEquals(
            listOf("com.readmates.admin.operations.application.."),
            adminOperations.applicationPackages,
        )
    }

    @Test
    fun `admin operations application does not depend on adapters jdbc or spring web`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.admin.operations.application..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..adapter..",
                "org.springframework.jdbc..",
                "org.springframework.dao..",
                "org.springframework.http..",
                "org.springframework.web..",
            ).check(importedClasses)
    }

    @Test
    fun `server architecture registry includes recent workflow and migrated slices`() {
        val registered = serverSlices.map(ServerSlice::name).toSet()

        assertTrue(
            registered.containsAll(
                setOf(
                    "admin.audit",
                    "admin.health",
                    "admin.analytics",
                    "aigen",
                    "browse",
                    "sessionclosing",
                    "sessionimport",
                    "sessionrecord",
                    "observability",
                ),
            ),
            "Server slice registry must include recent migrated slices.",
        )
    }

    @Test
    fun `non web inbound adapters are registered`() {
        val inboundPackages = serverSlices.flatMap(ServerSlice::inboundAdapterPackages).toSet()

        assertTrue(inboundPackages.contains("com.readmates.aigen.adapter.in.messaging.."))
        assertTrue(inboundPackages.contains("com.readmates.aigen.adapter.in.scheduling.."))
        assertTrue(inboundPackages.contains("com.readmates.notification.adapter.in.kafka.."))
        assertTrue(inboundPackages.contains("com.readmates.notification.adapter.in.scheduler.."))
        assertTrue(inboundPackages.contains("com.readmates.admin.health.adapter.in.scheduling.."))
        assertTrue(inboundPackages.contains("com.readmates.auth.adapter.in.security.."))
        assertTrue(inboundPackages.contains("com.readmates.auth.infrastructure.security.."))
    }

    @Test
    fun `production inbound package discovery exactly matches registry`() {
        val discovered =
            discoverProductionInboundPackageRoots(architectureProjectRoot().resolve("server/src/main/kotlin"))
        val registered = normalizeInboundRegistryRoots(serverSlices.flatMap(ServerSlice::inboundAdapterPackages))

        assertEquals(discovered, registered)
        assertTrue(discovered.contains("com.readmates.auth.infrastructure.security"))
    }

    @Test
    fun `new production inbound package must be registered`(
        @TempDir sourceRoot: Path,
    ) {
        val sourceFile = sourceRoot.resolve("com/readmates/sample/adapter/in/cli/SampleCommand.kt")
        Files.createDirectories(sourceFile.parent)
        Files.writeString(
            sourceFile,
            """
            package com.readmates.sample.adapter.`in`.cli

            class SampleCommand
            """.trimIndent(),
        )

        assertThatThrownBy {
            requireInboundRegistryMatchesSource(sourceRoot, emptyList())
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("com.readmates.sample.adapter.in.cli")

        requireInboundRegistryMatchesSource(
            sourceRoot,
            listOf("com.readmates.sample.adapter.in.cli.."),
        )
    }

    @Test
    fun `repository dependency predicate allows exact OAuth contracts and rejects other repositories`() {
        val projectRepository =
            importedClasses.get("com.readmates.aigen.adapter.out.persistence.JdbcAiGenerationClubDefaultRepository")
        val oauthFlowContextRepository =
            importedClasses.get("com.readmates.auth.infrastructure.security.OAuthFlowContextRepository")
        val oauthSecurityRepositoryContracts =
            listOf(
                oauthFlowContextRepository,
                importedClasses.get("com.readmates.auth.infrastructure.security.SecurityConfig"),
            ).flatMap { javaClass -> javaClass.directDependenciesFromSelf }
                .map { dependency -> dependency.targetClass }
                .filter { javaClass -> javaClass.name.startsWith("org.springframework.security.") }
                .filter { javaClass -> javaClass.simpleName.endsWith("Repository") }
        val otherSpringSecurityRepository =
            ClassFileImporter().importClass(HttpSessionSecurityContextRepository::class.java)

        assertTrue(legacyRepositoryDependencyTarget.test(projectRepository))
        assertFalse(legacyRepositoryDependencyTarget.test(oauthFlowContextRepository))
        assertEquals(
            setOf(
                "org.springframework.security.oauth2.client.registration.ClientRegistrationRepository",
                "org.springframework.security.oauth2.client.web.AuthorizationRequestRepository",
            ),
            oauthSecurityRepositoryContracts.map { javaClass -> javaClass.name }.toSet(),
        )
        assertTrue(oauthSecurityRepositoryContracts.none(legacyRepositoryDependencyTarget::test))
        assertTrue(legacyRepositoryDependencyTarget.test(otherSpringSecurityRepository))
    }

    @Test
    fun `registered inbound adapters do not depend on persistence or legacy repositories`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedInboundAdapterPackages)
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
            .resideInAnyPackage(*migratedInboundAdapterPackages)
            .should()
            .dependOnClassesThat(legacyRepositoryDependencyTarget)
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
    fun `application packages do not depend on resilience4j types`() {
        noClasses()
            .that()
            .resideInAnyPackage(*migratedApplicationPackages)
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("io.github.resilience4j..")
            .check(importedClasses)
    }

    @Test
    fun `admin health application does not depend on micrometer or spring scheduling`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.admin.health.application..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "io.micrometer..",
                "org.springframework.scheduling..",
            ).check(importedClasses)
    }

    @Test
    fun `admin health application does not depend on shared adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.admin.health.application..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("com.readmates.shared.adapter..")
            .check(importedClasses)
    }

    @Test
    fun `aigen provider gate port does not expose resilience4j types`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.aigen.application.port.out..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("io.github.resilience4j..")
            .check(importedClasses)
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
    fun `aigen ops web adapter keeps persistence out of controller boundary`() {
        noClasses()
            .that()
            .haveSimpleName("AiGenerationOpsController")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework.jdbc..",
                "..adapter.out.persistence..",
                "..adapter.out.redis..",
                "org.springframework.data.redis..",
            ).check(importedClasses)
    }

    @Test
    fun `aigen ops application service keeps adapter boundary`() {
        noClasses()
            .that()
            .haveSimpleName("AiGenerationOpsService")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "..adapter.in.web..",
                "..adapter.out.persistence..",
                "..adapter.out.redis..",
                "org.springframework.jdbc..",
                "org.springframework.data.redis..",
            ).check(importedClasses)
    }

    @Test
    fun `aigen application does not depend on messaging adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.aigen.application..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("com.readmates.aigen.adapter.out.messaging..")
            .check(importedClasses)
    }

    @Test
    fun `aigen messaging inbound adapter avoids services and outbound adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.aigen.adapter.in.messaging..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "com.readmates.aigen.application.service..",
                "com.readmates.aigen.adapter.out..",
            ).check(importedClasses)
    }

    @Test
    fun `aigen scheduling inbound adapter depends on application ports instead of services or outbound adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.aigen.adapter.in.scheduling..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "com.readmates.aigen.application.service..",
                "com.readmates.aigen.adapter.out..",
            ).check(importedClasses)
    }

    @Test
    fun `aigen web adapters do not depend on messaging adapter queue failures`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.aigen.adapter.in.web..")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("com.readmates.aigen.adapter.out.messaging..")
            .check(importedClasses)
    }

    @Test
    fun `aigen LLM adapters do not depend on service-owned provider failure models`() {
        noClasses()
            .that()
            .resideInAnyPackage("com.readmates.aigen.adapter.out.llm..")
            .should()
            .dependOnClassesThat()
            .haveFullyQualifiedName("com.readmates.aigen.application.service.ProviderFailureClass")
            .check(importedClasses)
    }

    @Test
    fun `aigen outbound metrics adapters do not depend on service owned metric contracts`() {
        noClasses()
            .that()
            .haveFullyQualifiedName("com.readmates.aigen.adapter.out.redis.RedisGenerationCostCounters")
            .or()
            .haveFullyQualifiedName("com.readmates.aigen.adapter.out.resilience.ResilientProviderCallGate")
            .should()
            .dependOnClassesThat()
            .haveFullyQualifiedName("com.readmates.aigen.application.service.AiGenerationMetrics")
            .orShould()
            .dependOnClassesThat()
            .haveFullyQualifiedName("com.readmates.aigen.application.service.CapDenialReason")
            .orShould()
            .dependOnClassesThat()
            .haveFullyQualifiedName("com.readmates.aigen.application.service.ProviderCircuitState")
            .check(importedClasses)
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
    fun `notification Kafka adapters do not cross transport directions`() {
        noClasses()
            .that()
            .haveFullyQualifiedName("com.readmates.notification.adapter.out.kafka.NotificationKafkaConfiguration")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage("com.readmates.notification.adapter.in.kafka..")
            .check(importedClasses)

        noClasses()
            .that()
            .haveFullyQualifiedName(
                "com.readmates.notification.adapter.in.kafka.NotificationKafkaConsumerConfiguration",
            ).should()
            .dependOnClassesThat()
            .resideInAnyPackage("com.readmates.notification.adapter.out.kafka..")
            .check(importedClasses)
    }

    @Test
    fun `notification backlog policy ports do not depend on metrics or scheduling frameworks`() {
        noClasses()
            .that()
            .resideInAnyPackage(
                "com.readmates.notification.application.port.in..",
                "com.readmates.notification.application.port.out..",
            ).should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "io.micrometer..",
                "org.springframework.scheduling..",
            ).check(importedClasses)

        noClasses()
            .that()
            .haveSimpleName("CachedNotificationBacklogProvider")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "io.micrometer..",
                "org.springframework.scheduling..",
            ).check(importedClasses)
    }
}

@Tag("architecture")
class ServerArchitectureSourceBoundaryTest {
    @Test
    fun `admin health application does not declare scheduled methods`() {
        val violations =
            adminHealthApplicationSourceFiles()
                .flatMap { sourceFile ->
                    sourceFile
                        .readLines()
                        .mapIndexedNotNull { index, line ->
                            if ("@Scheduled" in line) {
                                "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                            } else {
                                null
                            }
                        }
                }.sorted()

        assertTrue(
            violations.isEmpty(),
            "Application packages must not declare @Scheduled methods:\n${violations.joinToString("\n")}",
        )
    }

    @Test
    fun `notification application does not declare scheduled methods`() {
        val violations =
            notificationApplicationSourceFiles()
                .flatMap { sourceFile ->
                    sourceFile
                        .readLines()
                        .mapIndexedNotNull { index, line ->
                            if ("@Scheduled" in line) {
                                "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                            } else {
                                null
                            }
                        }
                }.sorted()

        assertTrue(
            violations.isEmpty(),
            "Notification application packages must not declare @Scheduled methods:\n${violations.joinToString("\n")}",
        )
    }

    @Test
    fun `test membership inserts declare avatar keys`() {
        val membershipInsert =
            Regex(
                """\binsert\s+into\s+`?memberships`?\s*\(([^)]*)\)""",
                setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL),
            )
        val violations =
            testFixtureFiles()
                .flatMap { fixtureFile ->
                    val source = fixtureFile.readText()
                    membershipInsert.findAll(source).mapNotNull { match ->
                        val declaredColumns =
                            match
                                .groupValues[1]
                                .split(',')
                                .map { column -> column.trim().trim('`').lowercase() }
                        val insertLineStart = source.lastIndexOf('\n', match.range.first).let { it + 1 }
                        val markerLineEnd = (insertLineStart - 1).coerceAtLeast(0)
                        val markerLineStart = source.lastIndexOf('\n', markerLineEnd - 1).let { it + 1 }
                        val explicitlyAllowedOmission =
                            source
                                .substring(markerLineStart, markerLineEnd)
                                .contains(AVATAR_KEY_OMISSION_MARKER)
                        if ("avatar_key" in declaredColumns || explicitlyAllowedOmission) {
                            null
                        } else {
                            val line = source.take(match.range.first).count { it == '\n' } + 1
                            "${fixtureFile.relativeTo(projectRoot())}:$line"
                        }
                    }
                }.sorted()

        assertTrue(
            violations.isEmpty(),
            "Test membership INSERT fixtures must declare avatar_key:\n" + violations.joinToString("\n"),
        )
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
                    val classViolation =
                        if (javaClass.simpleName == forbiddenTypeName) {
                            listOf(javaClass.name)
                        } else {
                            emptyList()
                        }
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
                    javaClass.packageName == "com.readmates.auth" ||
                        javaClass.packageName.startsWith("com.readmates.auth.")
                }.flatMap { javaClass ->
                    val classViolation =
                        if (javaClass.simpleName == forbiddenTypeName) {
                            listOf(javaClass.name)
                        } else {
                            emptyList()
                        }
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
            "Outbound ports must not hide unsupported behavior behind default runtime failures:\n" +
                violations.joinToString("\n"),
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

    @Test
    fun `aigen application does not depend on web current member`() {
        val violations =
            sourceRoot()
                .resolve("com/readmates/aigen/application")
                .takeIf(Files::exists)
                ?.let { root ->
                    Files
                        .walk(root)
                        .use { paths ->
                            paths
                                .filter { it.name.endsWith(".kt") }
                                .flatMap { sourceFile ->
                                    sourceFile
                                        .readLines()
                                        .mapIndexedNotNull { index, line ->
                                            if ("CurrentMember" in line) {
                                                "${sourceFile.relativeTo(sourceRoot())}:${index + 1}: ${line.trim()}"
                                            } else {
                                                null
                                            }
                                        }.stream()
                                }.toList()
                        }
                } ?: emptyList()

        assertTrue(
            violations.isEmpty(),
            "Aigen application code must use application-safe actor values instead of CurrentMember:\n" +
                violations.joinToString("\n"),
        )
    }

    @Test
    fun `capability actors remain pure shared values`() {
        noClasses()
            .that()
            .haveFullyQualifiedName("com.readmates.shared.security.ClubActor")
            .or()
            .haveFullyQualifiedName("com.readmates.shared.security.PlatformActor")
            .should()
            .dependOnClassesThat()
            .resideInAnyPackage(
                "org.springframework..",
                "com.readmates.auth.domain..",
                "com.readmates.club.domain..",
            ).check(importedClasses)
    }

    @Suppress("MaxLineLength")
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

    private fun adminHealthApplicationSourceFiles(): List<Path> =
        Files
            .walk(sourceRoot().resolve("com/readmates/admin/health/application"))
            .use { paths -> paths.filter { it.name.endsWith(".kt") }.toList() }

    private fun notificationApplicationSourceFiles(): List<Path> =
        Files
            .walk(sourceRoot().resolve("com/readmates/notification/application"))
            .use { paths -> paths.filter { it.name.endsWith(".kt") }.toList() }

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

    private fun testFixtureFiles(): List<Path> =
        listOf(
            projectRoot().resolve("server/src/test/kotlin"),
            projectRoot().resolve("server/src/test/resources"),
        ).filter(Files::exists)
            .flatMap { root ->
                Files.walk(root).use { paths ->
                    paths
                        .filter(Files::isRegularFile)
                        .filter { path -> path.name.endsWith(".kt") || path.name.endsWith(".sql") }
                        .toList()
                }
            }

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }

    private companion object {
        const val AVATAR_KEY_OMISSION_MARKER = "membership-avatar-key-omission"
    }

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

    @Test
    fun `read-only application services must not depend on mutation ports`() {
        val mutationPortSuffixes =
            listOf(
                "SavePort",
                "UpdatePort",
                "DeletePort",
                "WriterPort",
                "StorePort",
                "WritePort",
            )

        val rule =
            classes()
                .that()
                .areAnnotatedWith(
                    "com.readmates.shared.architecture.ReadOnlyApplicationService",
                ).should()
                .onlyDependOnClassesThat(
                    DescribedPredicate.describe("non-mutation ports") { dep ->
                        val name = dep.name
                        val isMutationPort =
                            name.contains(".port.out.") &&
                                mutationPortSuffixes.any(name::endsWith)

                        !isMutationPort
                    },
                )
        rule.check(importedClasses)
    }

    @Test
    fun `read-only application services must not be Transactional`() {
        val rule =
            noClasses()
                .that()
                .areAnnotatedWith(
                    "com.readmates.shared.architecture.ReadOnlyApplicationService",
                ).should()
                .beAnnotatedWith(
                    "org.springframework.transaction.annotation.Transactional",
                )
        rule.check(importedClasses)
    }
}
