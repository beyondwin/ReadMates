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
            """
            <?xml version="1.0"?>
            <SmellBaseline><CurrentIssues><ID>one</ID><ID>two</ID></CurrentIssues></SmellBaseline>
            """.trimIndent(),
        )
        Files.writeString(
            ktlint,
            """
            <?xml version="1.0"?>
            <baseline>
                <file name="A.kt"><error line="1"/><error line="2"/></file>
                <file name="B.kt"><error line="3"/></file>
            </baseline>
            """.trimIndent(),
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

    @Test
    fun `jacoco line floor stays at approved phase zero minimum`() {
        val buildScript = projectRoot().resolve("server/build.gradle.kts").toFile().readText()

        assertApprovedJacocoLineCoverageFloor(buildScript)
    }

    @Test
    fun `jacoco line floor contract rejects an approved literal outside effective limit`() {
        val misleadingBuildScript =
            """
            tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification") {
                violationRules {
                    rule {
                        limit {
                            counter = "METHOD"
                            value = "COVEREDRATIO"
                            minimum = "0.43".toBigDecimal()
                        }
                        limit {
                            counter = "LINE"
                            value = "COVEREDRATIO"
                            minimum = "0.23".toBigDecimal()
                        }
                    }
                }
            }
            """.trimIndent()

        assertThat(misleadingBuildScript).contains("""minimum = "0.43".toBigDecimal()""")

        assertThatThrownBy { assertApprovedJacocoLineCoverageFloor(misleadingBuildScript) }
            .isInstanceOf(AssertionError::class.java)
    }

    @Test
    fun `jacoco line floor contract requires one effective minimum`() {
        val duplicateMinimumBuildScript =
            """
            tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification") {
                violationRules {
                    rule {
                        limit {
                            counter = "LINE"
                            value = "COVEREDRATIO"
                            minimum = "0.43".toBigDecimal()
                            minimum = "0.43".toBigDecimal()
                        }
                    }
                }
            }
            """.trimIndent()

        assertThatThrownBy { assertApprovedJacocoLineCoverageFloor(duplicateMinimumBuildScript) }
            .isInstanceOf(AssertionError::class.java)
    }

    private fun assertApprovedJacocoLineCoverageFloor(buildScript: String) {
        val verificationTask =
            blockAfter(
                buildScript,
                """tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification")""",
            ) ?: throw AssertionError("jacocoTestCoverageVerification task block is missing")
        val lineCoverageMinimums =
            blocksNamed(verificationTask, "limit")
                .filter { limit ->
                    LINE_COUNTER.containsMatchIn(limit) && COVERED_RATIO_VALUE.containsMatchIn(limit)
                }.flatMap { limit -> MINIMUM.findAll(limit).map { match -> match.groupValues[1] }.toList() }

        assertThat(lineCoverageMinimums)
            .describedAs("LINE COVEREDRATIO minimums in jacocoTestCoverageVerification")
            .containsExactly("0.43")
    }

    private fun blocksNamed(source: String, name: String): List<String> =
        Regex("""\b${Regex.escape(name)}\s*\{""")
            .findAll(source)
            .mapNotNull { match -> blockAt(source, match.range.last) }
            .toList()

    private fun blockAfter(source: String, anchor: String): String? {
        val anchorIndex = source.indexOf(anchor)
        if (anchorIndex < 0) {
            return null
        }
        return blockAt(source, source.indexOf('{', anchorIndex + anchor.length))
    }

    private fun blockAt(source: String, openingBraceIndex: Int): String? {
        if (openingBraceIndex < 0) {
            return null
        }

        var depth = 0
        var closingBraceIndex: Int? = null
        for (index in openingBraceIndex until source.length) {
            when (source[index]) {
                '{' -> depth++
                '}' -> {
                    depth--
                    if (depth == 0) {
                        closingBraceIndex = index
                        break
                    }
                }
            }
        }
        return closingBraceIndex?.let { index -> source.substring(openingBraceIndex + 1, index) }
    }

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }

    private companion object {
        val LINE_COUNTER = Regex("""(?m)^\s*counter\s*=\s*"LINE"\s*$""")
        val COVERED_RATIO_VALUE = Regex("""(?m)^\s*value\s*=\s*"COVEREDRATIO"\s*$""")
        val MINIMUM = Regex("""(?m)^\s*minimum\s*=\s*"([^"]+)"\.toBigDecimal\(\)\s*$""")
        const val MAX_DETEKT_BASELINE_ISSUES = 461
        const val MAX_KTLINT_BASELINE_ERRORS = 171
    }
}
