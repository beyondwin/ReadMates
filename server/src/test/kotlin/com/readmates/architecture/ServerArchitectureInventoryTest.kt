package com.readmates.architecture

import org.assertj.core.api.Assertions.assertThat
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
        val baseline = readArchitectureBaseline(root.resolve("server/config/architecture/boundary-import-baseline.txt"))

        assertThat(baseline).hasSizeLessThanOrEqualTo(39)
        assertThat(actual).isEqualTo(baseline)
    }

    @Test
    fun `repository feature dependency baseline exactly matches source and cycles do not grow`() {
        val root = projectRoot()
        val actual = applicationFeatureEdges(root.resolve("server/src/main/kotlin"))
        val baseline =
            readArchitectureBaseline(root.resolve("server/config/architecture/feature-dependency-baseline.txt"))
        val components = cyclicFeatureComponents(actual)
        val knownComponent = setOf("auth", "club", "notification", "session", "sessionimport", "sessionrecord")

        assertThat(baseline).hasSizeLessThanOrEqualTo(41)
        assertThat(actual).isEqualTo(baseline)
        assertThat(components).allMatch { component -> knownComponent.containsAll(component) }
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
