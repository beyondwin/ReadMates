package com.readmates.auth.infrastructure.security

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

/**
 * Asserts that [SecurityConfig] declares CSRF-ignore regex entries for the new
 * AI-generation host endpoints (Task 2.4). This is a source-level assertion in
 * lieu of a heavyweight MockMvc setup — sufficient for config-only changes.
 */
@Tag("unit")
class AiGenerationSecurityConfigTest {
    private val source: String by lazy {
        val candidates =
            listOf(
                Path.of("src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt"),
                Path.of("server/src/main/kotlin/com/readmates/auth/infrastructure/security/SecurityConfig.kt"),
            )
        val resolved =
            candidates.firstOrNull { Files.exists(it) }
                ?: error("SecurityConfig.kt not found in $candidates (cwd=${Path.of("").toAbsolutePath()})")
        Files.readString(resolved)
    }

    @Test
    fun `csrf ignores POST ai-generate jobs creation`() {
        assertThat(source).contains(
            "methodAndPath(\"POST\", Regex(\"^/api/host/sessions/[^/]+/ai-generate/jobs\$\"))",
        )
    }

    @Test
    fun `csrf ignores POST regenerate and commit on ai-generate job`() {
        // Step 9 extracted the regex into a private top-level `AI_GENERATE_MUTATION_PATH` constant
        // to satisfy MaxLineLength. Assert both: the regex literal is declared exactly once at the
        // constant binding site, and the binding is referenced by methodAndPath("POST", ...).
        assertThat(source).contains(
            "Regex(\"^/api/host/sessions/[^/]+/ai-generate/jobs/[^/]+/(regenerate|commit)\$\")",
        )
        assertThat(source).contains(
            "methodAndPath(\"POST\", AI_GENERATE_MUTATION_PATH)",
        )
    }

    @Test
    fun `csrf ignores DELETE ai-generate job`() {
        assertThat(source).contains(
            "methodAndPath(\"DELETE\", Regex(\"^/api/host/sessions/[^/]+/ai-generate/jobs/[^/]+\$\"))",
        )
    }

    @Test
    fun `csrf ignores PUT club ai-defaults`() {
        assertThat(source).contains(
            "methodAndPath(\"PUT\", Regex(\"^/api/host/clubs/[^/]+/ai-defaults\$\"))",
        )
    }
}
