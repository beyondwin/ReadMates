package com.readmates.architecture

import com.readmates.auth.application.port.`in`.GetPendingApprovalUseCase
import com.readmates.auth.application.port.`in`.LeaveMembershipUseCase
import com.readmates.auth.application.port.`in`.ManageHostInvitationsUseCase
import com.readmates.auth.application.port.`in`.ManageMemberApprovalsUseCase
import com.readmates.auth.application.port.`in`.ManageMemberLifecycleUseCase
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.CurrentMember
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
import org.junit.jupiter.api.assertAll
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
    fun `auth inbound and security adapters do not depend on club inbound adapters`() {
        noClasses()
            .that()
            .resideInAnyPackage(
                "com.readmates.auth.adapter.in..",
                "com.readmates.auth.infrastructure.security..",
            ).should()
            .dependOnClassesThat()
            .resideInAnyPackage("com.readmates.club.adapter.in..")
            .check(importedClasses)
    }

    @Test
    fun `auth web adapters do not depend on auth concrete services`() {
        val sourceRoot = architectureProjectRoot().resolve("server/src/main/kotlin")
        val violations = authWebConcreteServiceImportViolations(sourceRoot)

        assertTrue(
            violations.isEmpty(),
            "Auth web adapters must not import auth concrete services:\n${violations.joinToString("\n")}",
        )
    }

    @Test
    fun `auth security filters consume auth ports and models instead of concrete auth resolution services`() {
        val sourceRoot = architectureProjectRoot().resolve("server/src/main/kotlin")
        val memberAuthoritiesFilter =
            sourceRoot.resolve("com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt").readText()
        val sessionCookieAuthenticationFilter =
            sourceRoot
                .resolve("com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt")
                .readText()

        assertTrue(
            memberAuthoritiesFilter.contains(
                "import com.readmates.auth.application.port.`in`.ResolveAuthenticatedPrincipalUseCase",
            ),
        )
        assertTrue(
            memberAuthoritiesFilter.contains(
                "import com.readmates.auth.application.port.`in`.SynthesizeAuthoritiesUseCase",
            ),
        )
        assertTrue(
            memberAuthoritiesFilter.contains(
                "import com.readmates.auth.application.model.AuthoritySynthesisRequest",
            ),
        )
        assertTrue(
            sessionCookieAuthenticationFilter.contains(
                "import com.readmates.auth.application.port.`in`.ResolveAuthenticatedPrincipalUseCase",
            ),
        )
        assertFalse(memberAuthoritiesFilter.contains("auth.application.service.AuthenticatedMemberResolver"))
        assertFalse(memberAuthoritiesFilter.contains("auth.application.service.AuthoritySynthesis"))
        assertFalse(memberAuthoritiesFilter.contains("auth.application.service.ClubContextInput"))
        assertFalse(sessionCookieAuthenticationFilter.contains("auth.application.service.AuthenticatedMemberResolver"))
    }

    @Test
    fun `authority synthesis request carries the complete authenticated member snapshot`() {
        val requestType = Class.forName("com.readmates.auth.application.model.AuthoritySynthesisRequest")
        val memberType = requestType.getDeclaredField("member").type

        assertEquals("com.readmates.auth.application.model.AuthenticatedMemberSnapshot", memberType.name)
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

    @Test
    fun `auth club context resolver stays a top level extension with ordinary imports`() {
        val sourceRoot = architectureProjectRoot().resolve("server/src/main/kotlin")
        val resolver = sourceRoot.resolve("com/readmates/auth/adapter/in/security/AuthClubContextResolver.kt")
        val source = resolver.readText()
        val taskThreeConsumerFiles =
            listOf(
                resolver,
                sourceRoot.resolve("com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt"),
                sourceRoot.resolve("com/readmates/auth/adapter/in/web/AuthMeController.kt"),
                sourceRoot.resolve("com/readmates/auth/adapter/in/web/MemberProfileController.kt"),
                sourceRoot.resolve("com/readmates/auth/infrastructure/security/MemberAuthoritiesFilter.kt"),
                sourceRoot.resolve("com/readmates/auth/infrastructure/security/SessionCookieAuthenticationFilter.kt"),
            )
        val resolverShapeViolations = resolverSourceShapeViolations(source)
        val fullyQualifiedReferences =
            fullyQualifiedReadMatesReferences(
                taskThreeConsumerFiles.map { sourceFile ->
                    sourceFile.relativeTo(sourceRoot).toString() to sourceFile.readText()
                },
            )
        val clubWebImportViolations = authClubWebImportViolations(sourceRoot)
        val resolverFailureMessage =
            "Auth club-context resolver must be the exact top-level extension:\n" +
                resolverShapeViolations.joinToString("\n")

        assertTrue(
            resolverShapeViolations.isEmpty(),
            resolverFailureMessage,
        )
        assertTrue(source.contains("import com.readmates.club.application.model.ResolvedClubContext"))
        assertTrue(
            source.contains(
                "import com.readmates.club.application.port.`in`.ResolveClubContextUseCase as ClubContextUseCase",
            ),
        )
        assertTrue(source.contains("import jakarta.servlet.http.HttpServletRequest"))
        assertTrue(
            clubWebImportViolations.isEmpty(),
            "Auth production code must not import club web adapters:\n${clubWebImportViolations.joinToString("\n")}",
        )
        assertTrue(
            fullyQualifiedReferences.isEmpty(),
            "Auth club-context helper consumers must use ordinary imports:\n" +
                fullyQualifiedReferences.joinToString("\n"),
        )
    }

    @Test
    fun `auth club context source shape guard rejects wrappers and current-member FQ bypasses`() {
        val wrappedResolver =
            """
            class AlternativeResolver {
            fun HttpServletRequest.resolveAuthClubContext(resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext {
                return RequestedAuthClubContext(false, AuthClubContextSource.NONE, null)
            }
            }
            """.trimIndent()
        val currentMemberFqBypass =
            """
            package com.readmates.auth.adapter.`in`.security
            val bypass = com.readmates.auth.adapter.`in`.security.AuthClubContextHeader.CLUB_SLUG
            """.trimIndent()
        val currentMemberResolverPath =
            "com/readmates/auth/adapter/in/security/CurrentMemberArgumentResolver.kt"

        assertTrue(resolverSourceShapeViolations(wrappedResolver).isNotEmpty())
        assertTrue(
            fullyQualifiedReadMatesReferences(
                listOf(currentMemberResolverPath to currentMemberFqBypass),
            ).isNotEmpty(),
        )
    }

    @Test
    fun `auth club context source shape guard ignores lexical decoys but rejects real code`() {
        val blockCommentDecoyWithWrappedResolver =
            """
            /*
            fun HttpServletRequest.resolveAuthClubContext(resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext {
            */
            class Wrapper { fun HttpServletRequest.resolveAuthClubContext(resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext {
                return RequestedAuthClubContext(false, AuthClubContextSource.NONE, null)
            } }
            """.trimIndent()
        val rawStringDecoyWithWrappedResolver =
            listOf(
                "val decoy = $TRIPLE_QUOTE",
                EXACT_AUTH_CLUB_CONTEXT_EXTENSION,
                "} { }",
                TRIPLE_QUOTE,
                "class Wrapper { fun HttpServletRequest.resolveAuthClubContext(" +
                    "resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext {",
                "    return RequestedAuthClubContext(false, AuthClubContextSource.NONE, null)",
                "} }",
            ).joinToString("\n")
        val harmlessFqText =
            listOf(
                "// com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG",
                "val raw = $TRIPLE_QUOTE" +
                    "com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG$TRIPLE_QUOTE",
                "val quoted = \"com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG\"",
                "val character = '{'",
            ).joinToString("\n")
        val realFqReference =
            """
            val bypass = com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG
            """.trimIndent()

        assertTrue(resolverSourceShapeViolations(blockCommentDecoyWithWrappedResolver).isNotEmpty())
        assertTrue(resolverSourceShapeViolations(rawStringDecoyWithWrappedResolver).isNotEmpty())
        assertTrue(fullyQualifiedReadMatesReferences(listOf("fixture.kt" to harmlessFqText)).isEmpty())
        assertTrue(fullyQualifiedReadMatesReferences(listOf("fixture.kt" to realFqReference)).isNotEmpty())
    }

    @Test
    fun `auth club context lexer tracks template depth and code token sequences`() {
        val assertions =
            buildList<() -> Unit> {
                executableTemplateFixtures().forEach { fixture ->
                    add(
                        {
                            assertTrue(
                                fullyQualifiedReadMatesReferences(listOf("fixture.kt" to fixture.source)).isNotEmpty(),
                                "${fixture.name} must expose executable FQ code after an inner block",
                            )
                        },
                    )
                    add(
                        {
                            val sourceWithLaterDeclaration = "${fixture.source}\n$EXACT_AUTH_CLUB_CONTEXT_EXTENSION"
                            assertTrue(
                                resolverSourceShapeViolations(sourceWithLaterDeclaration).isEmpty(),
                                "${fixture.name} must restore depth before a later top-level declaration",
                            )
                        },
                    )
                }
                nestedResolverTokenFixtures().forEach { fixture ->
                    add(
                        {
                            val sourceWithNestedDeclaration = "$EXACT_AUTH_CLUB_CONTEXT_EXTENSION\n${fixture.source}"
                            assertTrue(
                                resolverSourceShapeViolations(sourceWithNestedDeclaration).isNotEmpty(),
                                "${fixture.name} must count as an extra nested resolver declaration",
                            )
                        },
                    )
                }
                resolverLexicalDecoyFixtures().forEach { fixture ->
                    add(
                        {
                            assertTrue(
                                resolverSourceShapeViolations(fixture.source).isEmpty(),
                                "${fixture.name} must not count as a resolver declaration",
                            )
                        },
                    )
                }
                fqLexicalDecoyFixtures().forEach { fixture ->
                    add(
                        {
                            val violations =
                                fullyQualifiedReadMatesReferences(listOf("fixture.kt" to fixture.source))
                            assertTrue(violations.isEmpty(), "${fixture.name} must not count as executable FQ code")
                        },
                    )
                }
                addAll(nestedBlockCommentControlAssertions())
                addAll(literalDollarControlAssertions())
            }

        assertAll(assertions)
    }
}

private data class KotlinSourceFixture(
    val name: String,
    val source: String,
)

private fun nestedBlockCommentControlAssertions(): List<() -> Unit> =
    listOf(
        {
            val fixture = nestedBlockCommentResolverFixture()
            assertTrue(
                resolverSourceShapeViolations(fixture.source).isEmpty(),
                "${fixture.name} must remain ignored until the outer comment closes",
            )
        },
        {
            val fixture = nestedBlockCommentFqFixture()
            val references = fullyQualifiedReadMatesReferences(listOf("fixture.kt" to fixture.source))
            assertEquals(
                listOf(
                    "fixture.kt:5: val visible = " +
                        "com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG",
                ),
                references,
                "${fixture.name} must expose only the code after the outer comment closes",
            )
        },
    )

private fun literalDollarControlAssertions(): List<() -> Unit> =
    literalDollarFqFixtures().map { fixture ->
        {
            val references = fullyQualifiedReadMatesReferences(listOf("fixture.kt" to fixture.source))
            assertTrue(references.isEmpty(), "${fixture.name} must keep FQ-looking text literal")
        }
    }

private fun executableTemplateFixtures(): List<KotlinSourceFixture> {
    val fqReference = "com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG"
    return listOf(
        KotlinSourceFixture("normal template", "val normal = \"${'$'}{run { 1 }; $fqReference}\""),
        KotlinSourceFixture(
            "raw template",
            "val raw = $TRIPLE_QUOTE${'$'}{run { 1 }; $fqReference}$TRIPLE_QUOTE",
        ),
    )
}

private fun nestedResolverTokenFixtures(): List<KotlinSourceFixture> =
    listOf(
        KotlinSourceFixture(
            "comment-separated declaration",
            "class CommentWrapper { fun /*comment*/ HttpServletRequest . resolveAuthClubContext (" +
                "resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext = TODO() }",
        ),
        KotlinSourceFixture(
            "newline-separated declaration",
            listOf(
                "class NewlineWrapper { fun",
                "HttpServletRequest",
                ".",
                "resolveAuthClubContext",
                "(resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext = TODO() }",
            ).joinToString("\n"),
        ),
        KotlinSourceFixture(
            "alternate-whitespace declaration",
            "class WhitespaceWrapper { fun\tHttpServletRequest  .\t resolveAuthClubContext \t(" +
                "resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext = TODO() }",
        ),
    )

private fun resolverLexicalDecoyFixtures(): List<KotlinSourceFixture> =
    listOf(
        KotlinSourceFixture("line-comment resolver decoy", "// $EXACT_AUTH_CLUB_CONTEXT_EXTENSION"),
        KotlinSourceFixture("block-comment resolver decoy", "/* $EXACT_AUTH_CLUB_CONTEXT_EXTENSION */"),
        KotlinSourceFixture("ordinary-string resolver decoy", "val quoted = \"$EXACT_AUTH_CLUB_CONTEXT_EXTENSION\""),
        KotlinSourceFixture(
            "raw-string resolver decoy",
            "val raw = $TRIPLE_QUOTE $EXACT_AUTH_CLUB_CONTEXT_EXTENSION $TRIPLE_QUOTE",
        ),
    ).map { fixture -> fixture.copy(source = "${fixture.source}\n$EXACT_AUTH_CLUB_CONTEXT_EXTENSION") }

private fun fqLexicalDecoyFixtures(): List<KotlinSourceFixture> {
    val fqReference = "com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG"
    return listOf(
        KotlinSourceFixture("line-comment FQ decoy", "// $fqReference"),
        KotlinSourceFixture("block-comment FQ decoy", "/* $fqReference */"),
        KotlinSourceFixture("ordinary-string FQ decoy", "val quoted = \"$fqReference\""),
        KotlinSourceFixture("raw-string FQ decoy", "val raw = $TRIPLE_QUOTE $fqReference $TRIPLE_QUOTE"),
    )
}

private fun nestedBlockCommentResolverFixture(): KotlinSourceFixture =
    KotlinSourceFixture(
        "nested block-comment resolver decoy with visible resolver control",
        listOf(
            "/* outer",
            "  /* inner */",
            "  $EXACT_AUTH_CLUB_CONTEXT_EXTENSION",
            "*/",
            EXACT_AUTH_CLUB_CONTEXT_EXTENSION,
        ).joinToString("\n"),
    )

private fun nestedBlockCommentFqFixture(): KotlinSourceFixture {
    val fqReference = "com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG"
    return KotlinSourceFixture(
        "nested block-comment FQ decoy with visible FQ control",
        listOf(
            "/* outer",
            "  /* inner */",
            "  val hidden = $fqReference",
            "*/",
            "val visible = $fqReference",
        ).joinToString("\n"),
    )
}

private fun literalDollarFqFixtures(): List<KotlinSourceFixture> {
    val fqReference = "com.readmates.auth.adapter.in.security.AuthClubContextHeader.CLUB_SLUG"
    val literalDollar = '$'
    val rawLiteralDollarExpression = "$literalDollar{'$'}"
    return listOf(
        KotlinSourceFixture(
            "normal simple-template identifier",
            "val simple = \"$literalDollar$fqReference\"",
        ),
        KotlinSourceFixture(
            "raw simple-template identifier",
            "val simple = $TRIPLE_QUOTE$literalDollar$fqReference$TRIPLE_QUOTE",
        ),
        KotlinSourceFixture(
            "normal escaped-dollar text",
            "val escaped = \"\\$literalDollar{$fqReference}\"",
        ),
        KotlinSourceFixture(
            "raw escaped-dollar expression",
            "val escaped = $TRIPLE_QUOTE$rawLiteralDollarExpression{$fqReference}$TRIPLE_QUOTE",
        ),
    )
}

private fun resolverSourceShapeViolations(source: String): List<String> =
    buildList {
        val lexedSource = lexKotlinSource(source)
        val declarationIndexes = lexedSource.matchingTokenIndexes(AUTH_CLUB_CONTEXT_EXTENSION_TOKENS)
        if (declarationIndexes.size != 1) {
            add("expected one auth club-context extension declaration, found ${declarationIndexes.size}")
        } else {
            val declaration = lexedSource.tokens[declarationIndexes.single()]
            if (declaration.braceDepth != 0) {
                add("auth club-context extension must be top-level, found at brace depth ${declaration.braceDepth}")
            }
            if (!source.startsWith(EXACT_AUTH_CLUB_CONTEXT_EXTENSION, declaration.offset)) {
                add("auth club-context extension declaration does not match the required signature")
            }
        }
    }

private fun lexKotlinSource(source: String): KotlinLexedSource {
    val scanner = KotlinCodeScanner(source)
    scanner.scanCode()
    return scanner.lexedSource()
}

private fun fullyQualifiedReadMatesReferences(sourceFiles: List<Pair<String, String>>): List<String> =
    sourceFiles.flatMap { (relativePath, source) ->
        val lexedSource = lexKotlinSource(source)
        lexedSource
            .matchingTokenIndexes(READMATES_FQ_TOKENS)
            .mapNotNull { tokenIndex ->
                val precedingToken = lexedSource.tokens.getOrNull(tokenIndex - 1)?.text
                if (precedingToken == "package" || precedingToken == "import") {
                    null
                } else {
                    val reference = lexedSource.tokens[tokenIndex]
                    "$relativePath:${lexedSource.lineNumberAt(reference.offset)}: " +
                        lexedSource.sourceLineAt(reference.offset)
                }
            }
    }

private fun authClubWebImportViolations(sourceRoot: Path): List<String> =
    Files.walk(sourceRoot.resolve("com/readmates/auth")).use { paths ->
        paths
            .filter { sourceFile -> Files.isRegularFile(sourceFile) && sourceFile.toString().endsWith(".kt") }
            .flatMap { sourceFile ->
                sourceFile
                    .readLines()
                    .mapIndexedNotNull { index, line ->
                        val importName = line.trim().removePrefix("import ").replace("`", "")
                        if (importName.startsWith("com.readmates.club.adapter.in.web")) {
                            "${sourceFile.relativeTo(sourceRoot)}:${index + 1}: ${line.trim()}"
                        } else {
                            null
                        }
                    }.stream()
            }.toList()
    }

private fun authWebConcreteServiceImportViolations(sourceRoot: Path): List<String> =
    Files.walk(sourceRoot.resolve("com/readmates/auth/adapter/in/web")).use { paths ->
        paths
            .filter { sourceFile -> Files.isRegularFile(sourceFile) && sourceFile.toString().endsWith(".kt") }
            .flatMap { sourceFile ->
                sourceFile
                    .readLines()
                    .mapIndexedNotNull { index, line ->
                        val importName = line.trim().removePrefix("import").trimStart().replace("`", "")
                        if (importName.startsWith("com.readmates.auth.application.service.")) {
                            "${sourceFile.relativeTo(sourceRoot)}:${index + 1}: ${line.trim()}"
                        } else {
                            null
                        }
                    }.stream()
            }.toList()
    }

private const val EXACT_AUTH_CLUB_CONTEXT_EXTENSION =
    "fun HttpServletRequest.resolveAuthClubContext(" +
        "resolveClubContextUseCase: ClubContextUseCase): RequestedAuthClubContext {"

private const val TRIPLE_QUOTE = "\"\"\""
private val AUTH_CLUB_CONTEXT_EXTENSION_TOKENS =
    listOf("fun", "HttpServletRequest", ".", "resolveAuthClubContext", "(")
private val READMATES_FQ_TOKENS = listOf("com", ".", "readmates", ".")

private data class KotlinLexedSource(
    val source: String,
    val tokens: List<KotlinCodeToken>,
) {
    fun matchingTokenIndexes(expectedTokens: List<String>): List<Int> =
        tokens.indices.filter { tokenIndex ->
            expectedTokens.indices.all { expectedIndex ->
                tokens.getOrNull(tokenIndex + expectedIndex)?.text == expectedTokens[expectedIndex]
            }
        }

    fun lineNumberAt(offset: Int): Int = source.take(offset).count { character -> character == '\n' } + 1

    fun sourceLineAt(offset: Int): String {
        val lineStart = source.lastIndexOf('\n', offset).let { index -> index + 1 }
        val lineEnd = source.indexOf('\n', offset).let { index -> if (index == -1) source.length else index }
        return source.substring(lineStart, lineEnd).trim()
    }
}

private data class KotlinCodeToken(
    val text: String,
    val offset: Int,
    val braceDepth: Int,
)

private class KotlinCodeScanner(
    private val source: String,
) {
    private val tokens = mutableListOf<KotlinCodeToken>()
    private var braceDepth = 0

    fun scanCode(
        initialIndex: Int = 0,
        templateEntryDepth: Int? = null,
    ): Int {
        var index = initialIndex
        while (index < source.length) {
            when {
                templateEntryDepth == braceDepth && source[index] == '}' -> {
                    braceDepth--
                    return index + 1
                }
                source.startsWith("//", index) -> index = skipLineComment(index)
                source.startsWith("/*", index) -> index = skipBlockComment(index)
                source.startsWith(TRIPLE_QUOTE, index) -> index = skipRawString(index + TRIPLE_QUOTE.length)
                source[index] == '"' -> index = skipString(index + 1)
                source[index] == '\'' -> index = skipCharacterLiteral(index + 1)
                source[index] == '{' -> {
                    addToken("{", index)
                    braceDepth++
                    index++
                }
                source[index] == '}' -> {
                    addToken("}", index)
                    braceDepth--
                    index++
                }
                source[index].isKotlinIdentifierStart() -> index = scanIdentifier(index)
                source[index].isWhitespace() -> index++
                else -> {
                    addToken(source[index].toString(), index)
                    index++
                }
            }
        }
        return index
    }

    fun lexedSource(): KotlinLexedSource = KotlinLexedSource(source, tokens.toList())

    private fun scanIdentifier(initialIndex: Int): Int {
        var index = initialIndex + 1
        while (index < source.length && source[index].isKotlinIdentifierPart()) {
            index++
        }
        addToken(source.substring(initialIndex, index), initialIndex)
        return index
    }

    private fun skipLineComment(initialIndex: Int): Int {
        var index = initialIndex
        while (index < source.length && source[index] != '\n') {
            index++
        }
        return index
    }

    private fun skipBlockComment(initialIndex: Int): Int {
        var index = initialIndex + 2
        var commentDepth = 1
        while (index < source.length && commentDepth > 0) {
            when {
                source.startsWith("/*", index) -> {
                    commentDepth++
                    index += 2
                }
                source.startsWith("*/", index) -> {
                    commentDepth--
                    index += 2
                }
                else -> index++
            }
        }
        return index
    }

    private fun skipRawString(initialIndex: Int): Int {
        var index = initialIndex
        while (index < source.length) {
            when {
                source.startsWith(TRIPLE_QUOTE, index) -> return index + TRIPLE_QUOTE.length
                source.startsWith("${'$'}{", index) -> {
                    braceDepth++
                    index = scanCode(index + 2, templateEntryDepth = braceDepth)
                }
                source[index] == '$' -> index = skipSimpleTemplate(index)
                else -> index++
            }
        }
        return index
    }

    private fun skipString(initialIndex: Int): Int {
        var index = initialIndex
        while (index < source.length) {
            when {
                source[index] == '\\' -> index = (index + 2).coerceAtMost(source.length)
                source[index] == '"' -> return index + 1
                source.startsWith("${'$'}{", index) -> {
                    braceDepth++
                    index = scanCode(index + 2, templateEntryDepth = braceDepth)
                }
                source[index] == '$' -> index = skipSimpleTemplate(index)
                else -> index++
            }
        }
        return index
    }

    private fun skipSimpleTemplate(initialIndex: Int): Int {
        var index = initialIndex + 1
        while (index < source.length && (source[index] == '_' || source[index].isLetterOrDigit())) {
            index++
        }
        return index
    }

    private fun skipCharacterLiteral(initialIndex: Int): Int {
        var index = initialIndex
        while (index < source.length) {
            when {
                source[index] == '\\' -> index = (index + 2).coerceAtMost(source.length)
                source[index] == '\'' -> return index + 1
                else -> index++
            }
        }
        return index
    }

    private fun addToken(
        text: String,
        offset: Int,
    ) {
        tokens += KotlinCodeToken(text, offset, braceDepth)
    }
}

private fun Char.isKotlinIdentifierStart(): Boolean = this == '_' || isLetter()

private fun Char.isKotlinIdentifierPart(): Boolean = isKotlinIdentifierStart() || isDigit()

@Tag("architecture")
class ServerArchitectureSourceBoundaryTest {
    @Test
    fun `auth web authorization input ports accept club actors instead of current members`() {
        authWebAuthorizationInputPorts().forEach { useCase ->
            val parameterTypes = useCase.methods.flatMap { method -> method.parameterTypes.asIterable() }

            assertFalse(
                parameterTypes.contains(CurrentMember::class.java),
                "${useCase.simpleName} must not accept CurrentMember",
            )
            assertTrue(
                parameterTypes.contains(ClubActor::class.java),
                "${useCase.simpleName} must accept ClubActor",
            )
        }
    }

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

private fun authWebAuthorizationInputPorts() =
    listOf(
        ManageHostInvitationsUseCase::class.java,
        ManageMemberApprovalsUseCase::class.java,
        ManageMemberLifecycleUseCase::class.java,
        LeaveMembershipUseCase::class.java,
        GetPendingApprovalUseCase::class.java,
    )
