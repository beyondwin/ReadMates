package com.readmates.aigen.support

import com.readmates.aigen.application.model.GenerationInput
import com.readmates.aigen.application.model.GenerationOutput
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.SessionContentGenerator
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Deterministic in-process stub payload shared by every provider-specific
 * stub generator. The shape satisfies [DefaultSessionImportV1Validator]:
 *  - format constant
 *  - session metadata mirrors the input.sessionMeta
 *  - non-blank summary
 *  - exactly 3 highlights (within the 3..10 range)
 *  - oneLineReviews use [expectedAuthorNames] with no duplicates
 *  - feedback markdown starts with `<!-- readmates-feedback:v1 -->` and includes
 *    the `# 독서모임 {sessionNumber}차 피드백` header.
 *
 * Extracted from [StubSessionContentGenerator] for task 4.3 so additional
 * provider-specific stub Components (e.g. OPENAI in
 * [StubOpenAiSessionContentGenerator]) can share identical content while
 * advertising a different [Provider] value to
 * `AiGenerationBeansConfig.sessionContentGeneratorsByProvider`.
 */
internal object StubGenerationPayload {
    @Suppress("LongMethod")
    fun buildOutput(input: GenerationInput): GenerationOutput {
        val meta = input.sessionMeta
        val author = meta.expectedAuthorNames.firstOrNull() ?: "Host"
        val highlights = listOf(
            SessionImportV1Snapshot.AuthoredText(author, "Stub highlight #1 for ${meta.bookTitle}"),
            SessionImportV1Snapshot.AuthoredText(author, "Stub highlight #2 for ${meta.bookTitle}"),
            SessionImportV1Snapshot.AuthoredText(author, "Stub highlight #3 for ${meta.bookTitle}"),
        )
        val reviews = meta.expectedAuthorNames
            .distinct()
            .map { name ->
                SessionImportV1Snapshot.AuthoredText(name, "Stub one-line review by $name")
            }
        val firstParticipant = meta.expectedAuthorNames.firstOrNull() ?: "Host"
        val feedbackMarkdown = buildString {
            appendLine("<!-- readmates-feedback:v1 -->")
            appendLine()
            appendLine("# 독서모임 ${meta.sessionNumber}차 피드백")
            appendLine()
            appendLine("${meta.bookTitle} · ${meta.meetingDate}")
            appendLine()
            appendLine("## 메타")
            appendLine()
            appendLine("- 일시: ${meta.meetingDate} 20:00")
            appendLine("- 책: ${meta.bookTitle}")
            appendLine()
            appendLine("## 관찰자 노트")
            appendLine()
            appendLine("Stub observer notes.")
            appendLine()
            appendLine("## 참여자별 피드백")
            appendLine()
            appendLine("### 01. $firstParticipant")
            appendLine()
            appendLine("역할: 진행자")
            appendLine()
            appendLine("#### 참여 스타일")
            appendLine()
            appendLine("Stub participation style.")
            appendLine()
            appendLine("#### 실질 기여")
            appendLine()
            appendLine("- Stub contribution.")
            appendLine()
            appendLine("#### 문제점과 자기모순")
            appendLine()
            appendLine("##### 1. Stub issue")
            appendLine()
            appendLine("- 핵심: Stub core.")
            appendLine("- 근거: Stub evidence.")
            appendLine("- 해석: Stub interpretation.")
            appendLine()
            appendLine("#### 실천 과제")
            appendLine()
            appendLine("1. Stub action.")
            appendLine()
            appendLine("#### 드러난 한 문장")
            appendLine()
            appendLine("> Stub quote.")
            appendLine()
            appendLine("맥락: Stub context")
            appendLine()
            appendLine("주석: Stub note.")
        }
        val snapshot = SessionImportV1Snapshot(
            format = "readmates-session-import:v1",
            sessionNumber = meta.sessionNumber,
            bookTitle = meta.bookTitle,
            meetingDate = meta.meetingDate,
            summary = "Stub summary for ${meta.bookTitle} (session ${meta.sessionNumber}).",
            highlights = highlights,
            oneLineReviews = reviews,
            feedbackDocumentFileName = "session-${meta.sessionNumber}-feedback.md",
            feedbackDocumentMarkdown = feedbackMarkdown,
        )
        return GenerationOutput(snapshot, TokenUsage(inputTokens = 100, cachedInputTokens = 0, outputTokens = 200))
    }
}

/**
 * Deterministic in-process stub that satisfies [SessionContentGenerator] without
 * calling out to a real LLM provider. Active only when both `readmates.aigen.enabled`
 * and `readmates.aigen.mock` are `true` — used by the AI generation API integration
 * test (Phase 2 task 2.5) to exercise the full HTTP→Kafka→worker→Redis→commit lifecycle
 * with predictable content.
 *
 * Targets [Provider.CLAUDE]. Companion [StubOpenAiSessionContentGenerator] targets
 * [Provider.OPENAI] (task 4.3 provider-matrix integration test).
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled", "mock"], havingValue = "true")
class StubSessionContentGenerator : SessionContentGenerator {
    override val provider: Provider = Provider.CLAUDE
    override fun generateFull(input: GenerationInput): GenerationOutput =
        StubGenerationPayload.buildOutput(input)
}

/**
 * Mirror of [StubSessionContentGenerator] for [Provider.OPENAI]. Added in
 * task 4.3 so `AiGenerateApiIntegrationTest`'s parameterized OPENAI rows can
 * exercise the same lifecycle without a real OpenAI SDK call.
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled", "mock"], havingValue = "true")
class StubOpenAiSessionContentGenerator : SessionContentGenerator {
    override val provider: Provider = Provider.OPENAI
    override fun generateFull(input: GenerationInput): GenerationOutput =
        StubGenerationPayload.buildOutput(input)
}
