package com.readmates.architecture

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

@Tag("architecture")
class ServerArchitectureInventoryTest {
    @Test
    fun `club application imports no auth source`() {
        val productionSourceRoot = projectRoot().resolve("server/src/main/kotlin")
        val clubApplicationRoot = productionSourceRoot.resolve("com/readmates/club/application")
        val violations =
            Files.walk(clubApplicationRoot).use { paths ->
                paths
                    .filter { sourceFile ->
                        Files.isRegularFile(sourceFile) && sourceFile.fileName.toString().endsWith(".kt")
                    }.flatMap { sourceFile ->
                        Files
                            .readAllLines(sourceFile)
                            .mapIndexedNotNull { index, line ->
                                if (line.trim().startsWith("import com.readmates.auth.")) {
                                    "${productionSourceRoot.relativize(sourceFile)}:${index + 1}: ${line.trim()}"
                                } else {
                                    null
                                }
                            }.stream()
                    }.toList()
            }

        assertThat(violations).isEmpty()
    }

    @Test
    fun `inbound adapter imports allow same feature but fail closed across or outside feature boundaries`(
        @TempDir root: Path,
    ) {
        writeInboundAdapterDirectionFixture(root)

        val authWeb = "com/readmates/auth/adapter/in/web/AuthWeb.kt"
        val authService = "com/readmates/auth/application/service/AuthService.kt"
        val authAdapter = "com/readmates/auth/adapter/out/persistence/AuthAdapter.kt"
        val unclassifiedSource = "com/readmates/unclassified/adapter/in/web/UnclassifiedSource.kt"
        val unclassifiedTarget = "com/readmates/auth/adapter/in/web/UnclassifiedTarget.kt"

        assertThat(boundaryDebtImports(root)).containsExactlyInAnyOrder(
            "$authWeb|com.readmates.club.adapter.in.web.ClubWebHelper",
            "$authWeb|com.readmates.auth.application.service.AuthService",
            "$authWeb|com.readmates.auth.adapter.out.persistence.AuthAdapter",
            "$authService|com.readmates.auth.adapter.out.persistence.AuthAdapter",
            "$authAdapter|com.readmates.auth.adapter.in.web.AuthWeb",
            "$authAdapter|com.readmates.auth.application.service.AuthService",
            "$unclassifiedSource|com.readmates.auth.adapter.in.security.AuthSecurityHelper",
            "$unclassifiedTarget|com.readmates.unclassified.adapter.in.web.UnclassifiedWebHelper",
        )
    }

    @Test
    fun `boundary inventory detects forbidden directions but permits shared web errors`(
        @TempDir root: Path,
    ) {
        write(
            root,
            "com/readmates/sample/adapter/in/web/SampleController.kt",
            """
            package com.readmates.sample.adapter.`in`.web
            import com.readmates.sample.application.service.SampleService
            import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
            """,
        )
        write(
            root,
            "com/readmates/sample/application/service/SampleService.kt",
            """
            package com.readmates.sample.application.service
            import com.readmates.sample.adapter.out.persistence.SampleAdapter
            """,
        )
        write(
            root,
            "com/readmates/sample/adapter/out/persistence/SampleAdapter.kt",
            """
            package com.readmates.sample.adapter.out.persistence
            import com.readmates.sample.application.service.SampleService
            """,
        )

        assertThat(boundaryDebtImports(root)).containsExactlyInAnyOrder(
            "com/readmates/sample/adapter/in/web/SampleController.kt|" +
                "com.readmates.sample.application.service.SampleService",
            "com/readmates/sample/application/service/SampleService.kt|" +
                "com.readmates.sample.adapter.out.persistence.SampleAdapter",
            "com/readmates/sample/adapter/out/persistence/SampleAdapter.kt|" +
                "com.readmates.sample.application.service.SampleService",
        )
    }

    @Test
    fun `repository boundary import baseline exactly matches source`() {
        val root = projectRoot()
        val actual = boundaryDebtImports(root.resolve("server/src/main/kotlin"))
        val baseline =
            readBoundaryImportBaseline(root.resolve("server/config/architecture/boundary-import-baseline.txt"))
        val approvedSeed =
            readBoundaryImportBaseline(
                root.resolve("server/config/architecture/phase-0-approved-boundary-imports.txt"),
            )
        val retired =
            readRetiredBoundaryImports(
                root.resolve("server/config/architecture/phase-0-retired-boundary-imports.txt"),
            )

        assertThat(actual).isEqualTo(baseline)
        requireApprovedIdentityPartition(
            current = baseline,
            retired = retired,
            approvedSeed = approvedSeed,
            ceiling = 39,
            label = "boundary import baseline",
        )
    }

    @Test
    fun `repository feature dependency baseline exactly matches source and cycles do not grow`() {
        val root = projectRoot()
        val actual = applicationFeatureEdges(root.resolve("server/src/main/kotlin"))
        val baseline =
            readFeatureDependencyBaseline(root.resolve("server/config/architecture/feature-dependency-baseline.txt"))
        val approvedSeed =
            readFeatureDependencyBaseline(
                root.resolve("server/config/architecture/phase-0-approved-feature-dependencies.txt"),
            )
        val retired =
            readRetiredFeatureDependencies(
                root.resolve("server/config/architecture/phase-0-retired-feature-dependencies.txt"),
            )
        val components = cyclicFeatureComponents(actual)
        val expectedComponents = setOf(setOf("session", "sessionimport", "sessionrecord"))

        assertThat(actual).isEqualTo(baseline)
        requireApprovedIdentityPartition(
            current = baseline,
            retired = retired,
            approvedSeed = approvedSeed,
            ceiling = 41,
            label = "feature dependency baseline",
        )
        assertThat(components).isEqualTo(expectedComponents)
    }

    @Test
    fun `boundary ratchet accepts unchanged seed`() {
        val approvedSeed = boundaryFixtureSeed()

        requireApprovedIdentityPartition(
            current = approvedSeed,
            retired = emptySet(),
            approvedSeed = approvedSeed,
            ceiling = 2,
            label = "boundary fixture",
        )
    }

    @Test
    fun `boundary ratchet accepts a tombstoned removal`() {
        val approvedSeed = boundaryFixtureSeed()

        requireApprovedIdentityPartition(
            current = setOf(approvedSeed.first()),
            retired = setOf(approvedSeed.last()),
            approvedSeed = approvedSeed,
            ceiling = 2,
            label = "boundary fixture",
        )
    }

    @Test
    fun `boundary ratchet rejects reintroduction of a retired identity`() {
        val approvedSeed = boundaryFixtureSeed()

        assertThatThrownBy {
            requireApprovedIdentityPartition(
                current = approvedSeed,
                retired = setOf(approvedSeed.last()),
                approvedSeed = approvedSeed,
                ceiling = 2,
                label = "boundary fixture",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `boundary ratchet rejects removal without a tombstone`() {
        val approvedSeed = boundaryFixtureSeed()

        assertThatThrownBy {
            requireApprovedIdentityPartition(
                current = setOf(approvedSeed.first()),
                retired = emptySet(),
                approvedSeed = approvedSeed,
                ceiling = 2,
                label = "boundary fixture",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `boundary ratchet rejects a same size identity substitution`() {
        val approvedSeed = boundaryFixtureSeed()
        val substituted =
            setOf(
                approvedSeed.first(),
                "com/readmates/c/adapter/in/web/C.kt|com.readmates.c.application.service.CService",
            )

        assertThatThrownBy {
            requireApprovedIdentityPartition(
                current = substituted,
                retired = setOf(approvedSeed.last()),
                approvedSeed = approvedSeed,
                ceiling = 2,
                label = "boundary fixture",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("com/readmates/c/adapter/in/web/C.kt")
    }

    @Test
    fun `feature ratchet accepts unchanged seed`() {
        val approvedSeed = setOf("auth|club", "club|shared")

        requireApprovedIdentityPartition(
            current = approvedSeed,
            retired = emptySet(),
            approvedSeed = approvedSeed,
            ceiling = 2,
            label = "feature fixture",
        )
    }

    @Test
    fun `feature ratchet accepts a tombstoned removal`() {
        val approvedSeed = setOf("auth|club", "club|shared")

        requireApprovedIdentityPartition(
            current = setOf("auth|club"),
            retired = setOf("club|shared"),
            approvedSeed = approvedSeed,
            ceiling = 2,
            label = "feature fixture",
        )
    }

    @Test
    fun `feature ratchet rejects reintroduction of a retired identity`() {
        val approvedSeed = setOf("auth|club", "club|shared")

        assertThatThrownBy {
            requireApprovedIdentityPartition(
                current = approvedSeed,
                retired = setOf("club|shared"),
                approvedSeed = approvedSeed,
                ceiling = 2,
                label = "feature fixture",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `feature ratchet rejects removal without a tombstone`() {
        val approvedSeed = setOf("auth|club", "club|shared")

        assertThatThrownBy {
            requireApprovedIdentityPartition(
                current = setOf("auth|club"),
                retired = emptySet(),
                approvedSeed = approvedSeed,
                ceiling = 2,
                label = "feature fixture",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `feature ratchet rejects a same size identity substitution`() {
        val approvedSeed = setOf("auth|club", "club|shared")
        val substituted = setOf("auth|club", "example|shared")

        assertThatThrownBy {
            requireApprovedIdentityPartition(
                current = substituted,
                retired = setOf("club|shared"),
                approvedSeed = approvedSeed,
                ceiling = 2,
                label = "feature fixture",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("example|shared")
    }

    @Test
    fun `architecture baselines fail closed for duplicate and malformed rows`(
        @TempDir root: Path,
    ) {
        val duplicateBoundary = root.resolve("boundary.txt")
        val malformedFeature = root.resolve("feature.txt")
        Files.writeString(
            duplicateBoundary,
            "com/readmates/a/A.kt|com.readmates.a.B\ncom/readmates/a/A.kt|com.readmates.a.B\n",
        )
        Files.writeString(malformedFeature, "auth|club|shared\n")

        assertThatThrownBy { readBoundaryImportBaseline(duplicateBoundary) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Duplicate")
        assertThatThrownBy { readFeatureDependencyBaseline(malformedFeature) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Malformed")
    }

    @Test
    fun `architecture retired ledgers fail closed for duplicate malformed or outside seed rows`(
        @TempDir root: Path,
    ) {
        val duplicateBoundaryRetired = root.resolve("boundary-retired.txt")
        val malformedFeatureRetired = root.resolve("feature-retired.txt")
        val duplicate = "com/readmates/a/A.kt|com.readmates.a.B"
        Files.writeString(duplicateBoundaryRetired, "$duplicate\n$duplicate\n")
        Files.writeString(malformedFeatureRetired, "auth|club|shared\n")

        assertThatThrownBy { readRetiredBoundaryImports(duplicateBoundaryRetired) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Duplicate")
        assertThatThrownBy { readRetiredFeatureDependencies(malformedFeatureRetired) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Malformed")
        assertThatThrownBy {
            requireApprovedIdentityPartition(
                current = setOf("auth|club"),
                retired = setOf("example|shared"),
                approvedSeed = setOf("auth|club", "club|shared"),
                ceiling = 2,
                label = "feature fixture",
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("example|shared")
    }

    private fun boundaryFixtureSeed(): Set<String> =
        sortedSetOf(
            "com/readmates/a/adapter/in/web/A.kt|com.readmates.a.application.service.AService",
            "com/readmates/b/adapter/in/web/B.kt|com.readmates.b.application.service.BService",
        )

    private fun writeInboundAdapterDirectionFixture(root: Path) {
        write(
            root,
            "com/readmates/auth/adapter/in/web/AuthWeb.kt",
            """
            package com.readmates.auth.adapter.`in`.web
            import com.readmates.auth.adapter.`in`.security.AuthSecurityHelper
            import com.readmates.club.adapter.`in`.web.ClubWebHelper
            import com.readmates.shared.adapter.`in`.web.ApiErrorResponse
            import com.readmates.auth.application.service.AuthService
            import com.readmates.auth.adapter.out.persistence.AuthAdapter
            """,
        )
        write(
            root,
            "com/readmates/auth/application/service/AuthService.kt",
            """
            package com.readmates.auth.application.service
            import com.readmates.auth.adapter.out.persistence.AuthAdapter
            """,
        )
        write(
            root,
            "com/readmates/auth/adapter/out/persistence/AuthAdapter.kt",
            """
            package com.readmates.auth.adapter.out.persistence
            import com.readmates.auth.adapter.`in`.web.AuthWeb
            import com.readmates.auth.application.service.AuthService
            """,
        )
        write(
            root,
            "com/readmates/unclassified/adapter/in/web/UnclassifiedSource.kt",
            """
            package com.readmates.unclassified.adapter.`in`.web
            import com.readmates.auth.adapter.`in`.security.AuthSecurityHelper
            """,
        )
        write(
            root,
            "com/readmates/auth/adapter/in/web/UnclassifiedTarget.kt",
            """
            package com.readmates.auth.adapter.`in`.web
            import com.readmates.unclassified.adapter.`in`.web.UnclassifiedWebHelper
            """,
        )
    }

    private fun write(
        root: Path,
        relative: String,
        content: String,
    ) {
        val path = root.resolve(relative)
        Files.createDirectories(path.parent)
        Files.writeString(path, content.trimIndent())
    }

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }
}
