package com.readmates.architecture

import com.tngtech.archunit.core.importer.ClassFileImporter
import com.tngtech.archunit.core.importer.ImportOption
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.readLines
import kotlin.io.path.readText

@Tag("architecture")
class AiGenerationArchitectureBoundaryTest {
    private val importedClasses =
        ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("com.readmates.aigen")

    @Test
    fun `legacy provider types and runtime selector are absent`() {
        val forbiddenSimpleNames =
            setOf(
                "AiGeneration" + "PipelineMode",
                "SessionContent" + "Generator",
                "SessionContent" + "Regenerator",
                "OpenAiApiPort",
                "OpenAiApiClient",
                "ClaudeApiPort",
                "ClaudeApiClient",
                "GeminiApiPort",
                "GeminiApiClient",
                "OpenAiWholeTranscriptGroundedGenerator",
                "ClaudeWholeTranscriptGroundedGenerator",
                "GeminiWholeTranscriptGroundedGenerator",
            )
        val bytecodeViolations =
            importedClasses
                .filter { javaClass -> javaClass.simpleName in forbiddenSimpleNames }
                .map { javaClass -> javaClass.name }
                .sorted()
        val sourceMarkers =
            listOf(
                "AiGeneration" + "PipelineMode",
                "pipeline" + "Mode",
                "pipeline" + "-mode",
                "READMATES_AIGEN_" + "PIPELINE_MODE",
            )
        val sourceViolations =
            aigenProductionFiles()
                .flatMap { sourceFile ->
                    sourceFile.readLines().mapIndexedNotNull { index, line ->
                        sourceMarkers.firstOrNull(line::contains)?.let {
                            val relative = projectRoot().relativize(sourceFile.toAbsolutePath())
                            "$relative:${index + 1}: ${line.trim()}"
                        }
                    }
                }.sorted()

        assertTrue(
            bytecodeViolations.isEmpty() && sourceViolations.isEmpty(),
            "Aigen legacy provider types and runtime selectors must be absent:\n" +
                (bytecodeViolations + sourceViolations).joinToString("\n"),
        )
    }

    @Test
    fun `application is independent of provider and resilience libraries`() {
        val forbiddenImportPrefixes =
            listOf(
                "org.springframework.ai.",
                "com.openai.",
                "com.anthropic.",
                "com.google.genai.",
                "io.github.resilience4j.",
            )
        val violations =
            sourceFilesUnder(sourceRoot().resolve("com/readmates/aigen/application"))
                .flatMap { sourceFile ->
                    sourceFile.readLines().mapIndexedNotNull { index, line ->
                        val imported = line.trim().removePrefix("import ")
                        forbiddenImportPrefixes.firstOrNull(imported::startsWith)?.let {
                            val relative = projectRoot().relativize(sourceFile.toAbsolutePath())
                            "$relative:${index + 1}: ${line.trim()}"
                        }
                    }
                }.sorted()

        assertTrue(
            violations.isEmpty(),
            "Aigen application code must not import provider, Spring AI, or resilience libraries:\n" +
                violations.joinToString("\n"),
        )
    }

    @Test
    fun `one Spring AI grounded generator remains without direct provider dependencies`() {
        val generatorImplementations =
            importedClasses
                .filter { javaClass ->
                    javaClass.interfaces.any { implemented ->
                        implemented.name == GROUNDED_GENERATOR_INTERFACE
                    }
                }.map { javaClass -> javaClass.name }
                .sorted()
        val buildFile = projectRoot().resolve("server/build.gradle.kts").readText()
        val directDependencyMarkers =
            listOf(
                "com.openai:openai-java",
                "com.anthropic:anthropic-java",
                "com.google.genai:google-genai",
            )
        val dependencyViolations = directDependencyMarkers.filter(buildFile::contains)

        assertTrue(
            generatorImplementations == listOf(SPRING_AI_GROUNDED_GENERATOR),
            "Exactly one Spring AI grounded generator implementation must remain:\n" +
                generatorImplementations.joinToString("\n"),
        )
        assertTrue(
            dependencyViolations.isEmpty(),
            "Direct provider SDK dependencies must be absent: ${dependencyViolations.joinToString()}",
        )
    }

    private fun aigenProductionFiles(): List<Path> =
        sourceFilesUnder(sourceRoot().resolve("com/readmates/aigen")) +
            listOf(projectRoot().resolve("server/src/main/resources/application.yml"))

    private fun sourceFilesUnder(root: Path): List<Path> =
        if (!Files.exists(root)) {
            emptyList()
        } else {
            Files.walk(root).use { paths -> paths.filter(Files::isRegularFile).toList() }
        }

    private fun projectRoot(): Path =
        listOf(Path.of("."), Path.of(".."))
            .map { candidate -> candidate.toAbsolutePath().normalize() }
            .first { candidate -> Files.exists(candidate.resolve("server/build.gradle.kts")) }

    private fun sourceRoot(): Path =
        listOf(Path.of("src/main/kotlin"), Path.of("server/src/main/kotlin"))
            .first(Files::exists)

    private companion object {
        const val GROUNDED_GENERATOR_INTERFACE =
            "com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator"
        const val SPRING_AI_GROUNDED_GENERATOR =
            "com.readmates.aigen.adapter.out.llm.springai.SpringAiWholeTranscriptGroundedGenerator"
    }
}
