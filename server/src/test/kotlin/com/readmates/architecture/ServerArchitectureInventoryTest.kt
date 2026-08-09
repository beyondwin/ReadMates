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

        assertThat(actual).isEqualTo(baseline)
        requireApprovedIdentitySubset(baseline, approvedSeed, ceiling = 39, label = "boundary import baseline")
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
        val components = cyclicFeatureComponents(actual)
        val knownComponent = setOf("auth", "club", "notification", "session", "sessionimport", "sessionrecord")

        assertThat(actual).isEqualTo(baseline)
        requireApprovedIdentitySubset(baseline, approvedSeed, ceiling = 41, label = "feature dependency baseline")
        assertThat(components).allMatch { component -> knownComponent.containsAll(component) }
    }

    @Test
    fun `boundary ratchet rejects a same size identity substitution`() {
        val approvedSeed =
            setOf(
                "com/readmates/a/adapter/in/web/A.kt|com.readmates.a.application.service.AService",
                "com/readmates/b/adapter/in/web/B.kt|com.readmates.b.application.service.BService",
            )
        val substituted =
            setOf(
                "com/readmates/a/adapter/in/web/A.kt|com.readmates.a.application.service.AService",
                "com/readmates/c/adapter/in/web/C.kt|com.readmates.c.application.service.CService",
            )

        assertThatThrownBy {
            requireApprovedIdentitySubset(substituted, approvedSeed, ceiling = 2, label = "boundary fixture")
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("com/readmates/c/adapter/in/web/C.kt")
    }

    @Test
    fun `feature ratchet rejects a same size identity substitution`() {
        val approvedSeed = setOf("auth|club", "club|shared")
        val substituted = setOf("auth|club", "example|shared")

        assertThatThrownBy {
            requireApprovedIdentitySubset(substituted, approvedSeed, ceiling = 2, label = "feature fixture")
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
