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
    fun `baseline reader retains normalized detekt and ktlint identities`(
        @TempDir tempDir: Path,
    ) {
        val detekt = tempDir.resolve("detekt.xml")
        val ktlint = tempDir.resolve("ktlint.xml")
        Files.writeString(
            detekt,
            """
            <?xml version="1.0"?>
            <SmellBaseline>
                <CurrentIssues><ID>Rule:A.kt:one</ID><ID>Rule:B.kt:two</ID></CurrentIssues>
            </SmellBaseline>
            """.trimIndent(),
        )
        Files.writeString(
            ktlint,
            """
            <?xml version="1.0"?>
            <baseline>
                <file name="./A.kt">
                    <error line="1" column="2" source="standard:first-rule"/>
                    <error line="2" column="3" source="standard:second-rule"/>
                </file>
                <file name="B.kt"><error line="3" column="4" source="standard:third-rule"/></file>
            </baseline>
            """.trimIndent(),
        )

        val identities = ServerQualityBaselineReader.read(detekt, ktlint)

        assertThat(identities.detektIssues).containsExactlyInAnyOrder("Rule:A.kt:one", "Rule:B.kt:two")
        assertThat(identities.ktlintErrors).containsExactlyInAnyOrder(
            "A.kt|standard:first-rule|1|2",
            "A.kt|standard:second-rule|2|3",
            "B.kt|standard:third-rule|3|4",
        )
    }

    @Test
    fun `baseline reader fails closed for malformed xml`(
        @TempDir tempDir: Path,
    ) {
        val detekt = tempDir.resolve("detekt.xml")
        val ktlint = tempDir.resolve("ktlint.xml")
        Files.writeString(detekt, "<SmellBaseline><ID>broken")
        Files.writeString(ktlint, "<baseline/>")

        assertThatThrownBy { ServerQualityBaselineReader.read(detekt, ktlint) }
            .isInstanceOf(Exception::class.java)
    }

    @Test
    fun `baseline reader fails closed for duplicate identities`(
        @TempDir tempDir: Path,
    ) {
        val detekt = tempDir.resolve("detekt.xml")
        val ktlint = tempDir.resolve("ktlint.xml")
        Files.writeString(
            detekt,
            """
            <?xml version="1.0"?>
            <SmellBaseline><CurrentIssues><ID>Rule:A.kt:item</ID><ID>Rule:A.kt:item</ID></CurrentIssues></SmellBaseline>
            """.trimIndent(),
        )
        Files.writeString(
            ktlint,
            """
            <?xml version="1.0"?>
            <baseline>
                <file name="A.kt">
                    <error line="1" column="2" source="standard:rule"/>
                </file>
            </baseline>
            """.trimIndent(),
        )

        assertThatThrownBy { ServerQualityBaselineReader.read(detekt, ktlint) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Duplicate")
    }

    @Test
    fun `static analysis baselines never grow`() {
        val root = projectRoot()
        val identities =
            ServerQualityBaselineReader.read(
                root.resolve("server/config/detekt/baseline.xml"),
                root.resolve("server/config/ktlint/baseline.xml"),
            )
        val approvedDetektSeed =
            readDetektIdentitySeed(root.resolve("server/config/detekt/phase-0-approved-identities.txt"))
        val approvedKtlintSeed =
            readKtlintIdentitySeed(root.resolve("server/config/ktlint/phase-0-approved-identities.txt"))

        requireApprovedIdentitySubset(
            current = identities.detektIssues,
            approvedSeed = approvedDetektSeed,
            ceiling = MAX_DETEKT_BASELINE_ISSUES,
            label = "Detekt baseline",
        )
        requireApprovedIdentitySubset(
            current = identities.ktlintErrors,
            approvedSeed = approvedKtlintSeed,
            ceiling = MAX_KTLINT_BASELINE_ERRORS,
            label = "ktlint baseline",
        )
    }

    @Test
    fun `detekt ratchet rejects a same size identity substitution`() {
        val approvedSeed = setOf("Rule:A.kt:first", "Rule:B.kt:second")
        val substituted = setOf("Rule:A.kt:first", "Rule:C.kt:replacement")

        assertThatThrownBy {
            requireApprovedIdentitySubset(substituted, approvedSeed, ceiling = 2, label = "Detekt fixture")
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Rule:C.kt:replacement")
    }

    @Test
    fun `ktlint ratchet rejects a same size identity substitution`() {
        val approvedSeed = setOf("A.kt|standard:first|1|2", "B.kt|standard:second|3|4")
        val substituted = setOf("A.kt|standard:first|1|2", "C.kt|standard:replacement|5|6")

        assertThatThrownBy {
            requireApprovedIdentitySubset(substituted, approvedSeed, ceiling = 2, label = "ktlint fixture")
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("C.kt|standard:replacement|5|6")
    }

    @Test
    fun `quality identity seeds fail closed for duplicate or malformed rows`(
        @TempDir tempDir: Path,
    ) {
        val duplicateDetektSeed = tempDir.resolve("detekt-seed.txt")
        val malformedKtlintSeed = tempDir.resolve("ktlint-seed.txt")
        Files.writeString(duplicateDetektSeed, "Rule:A.kt:item\nRule:A.kt:item\n")
        Files.writeString(malformedKtlintSeed, "A.kt|standard:rule|not-a-line|2\n")

        assertThatThrownBy { readDetektIdentitySeed(duplicateDetektSeed) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Duplicate")
        assertThatThrownBy { readKtlintIdentitySeed(malformedKtlintSeed) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("Malformed")
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

    private fun blocksNamed(
        source: String,
        name: String,
    ): List<String> =
        Regex("""\b${Regex.escape(name)}\s*\{""")
            .findAll(source)
            .mapNotNull { match -> blockAt(source, match.range.last) }
            .toList()

    private fun blockAfter(
        source: String,
        anchor: String,
    ): String? {
        val anchorIndex = source.indexOf(anchor)
        if (anchorIndex < 0) {
            return null
        }
        return blockAt(source, source.indexOf('{', anchorIndex + anchor.length))
    }

    private fun blockAt(
        source: String,
        openingBraceIndex: Int,
    ): String? {
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
