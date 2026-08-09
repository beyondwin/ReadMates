package com.readmates.architecture

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

@Tag("architecture")
class ServerQualityRatchetTest {
    @Test
    fun `baseline reader counts detekt ids and ktlint errors`(@TempDir tempDir: Path) {
        val detekt = tempDir.resolve("detekt.xml")
        val ktlint = tempDir.resolve("ktlint.xml")
        Files.writeString(
            detekt,
            """<?xml version="1.0"?><SmellBaseline><CurrentIssues><ID>one</ID><ID>two</ID></CurrentIssues></SmellBaseline>""",
        )
        Files.writeString(
            ktlint,
            """<?xml version="1.0"?><baseline><file name="A.kt"><error line="1"/><error line="2"/></file><file name="B.kt"><error line="3"/></file></baseline>""",
        )

        val counts = ServerQualityBaselineReader.read(detekt, ktlint)

        assertThat(counts).isEqualTo(ServerQualityBaselineCounts(detektIssues = 2, ktlintErrors = 3))
    }

    @Test
    fun `baseline reader fails closed for malformed xml`(@TempDir tempDir: Path) {
        val detekt = tempDir.resolve("detekt.xml")
        val ktlint = tempDir.resolve("ktlint.xml")
        Files.writeString(detekt, "<SmellBaseline><ID>broken")
        Files.writeString(ktlint, "<baseline/>")

        assertThatThrownBy { ServerQualityBaselineReader.read(detekt, ktlint) }
            .isInstanceOf(Exception::class.java)
    }

    @Test
    fun `static analysis baselines never grow`() {
        val root = projectRoot()
        val counts =
            ServerQualityBaselineReader.read(
                root.resolve("server/config/detekt/baseline.xml"),
                root.resolve("server/config/ktlint/baseline.xml"),
            )

        assertThat(counts.detektIssues).isLessThanOrEqualTo(MAX_DETEKT_BASELINE_ISSUES)
        assertThat(counts.ktlintErrors).isLessThanOrEqualTo(MAX_KTLINT_BASELINE_ERRORS)
    }

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }

    private companion object {
        const val MAX_DETEKT_BASELINE_ISSUES = 461
        const val MAX_KTLINT_BASELINE_ERRORS = 171
    }
}
