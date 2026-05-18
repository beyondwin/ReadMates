package com.readmates.aigen.support

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.RegenerationInput
import com.readmates.aigen.application.model.RegenerationOutput
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.SessionContentRegenerator
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Deterministic in-process payload shared by every provider-specific stub
 * regenerator. Extracted in task 4.3 so additional provider-specific stub
 * Components (e.g. OPENAI in [StubOpenAiSessionContentRegenerator]) can
 * share identical content while advertising a different [Provider] to
 * `AiGenerationBeansConfig.sessionContentRegeneratorsByProvider`.
 *
 * The patched value is a typed per-item replacement that the regeneration
 * service merges into the full snapshot and validates before persisting.
 */
internal object StubRegenerationPayload {
    @Suppress("LongMethod")
    fun buildOutput(input: RegenerationInput): RegenerationOutput {
        val author = input.sessionMeta.expectedAuthorNames.firstOrNull() ?: "Host"
        val value: Any =
            when (input.item) {
                GenerationItem.SUMMARY ->
                    "Regenerated summary for ${input.sessionMeta.bookTitle}."
                GenerationItem.HIGHLIGHTS ->
                    listOf(
                        SessionImportV1Snapshot.AuthoredText(author, "Regenerated highlight #1"),
                        SessionImportV1Snapshot.AuthoredText(author, "Regenerated highlight #2"),
                        SessionImportV1Snapshot.AuthoredText(author, "Regenerated highlight #3"),
                    )
                GenerationItem.ONE_LINE_REVIEWS ->
                    input.sessionMeta.expectedAuthorNames.distinct().map { name ->
                        SessionImportV1Snapshot.AuthoredText(name, "Regenerated one-liner by $name")
                    }
                GenerationItem.FEEDBACK_DOCUMENT ->
                    buildString {
                        val firstParticipant = input.sessionMeta.expectedAuthorNames.firstOrNull() ?: "Host"
                        appendLine("<!-- readmates-feedback:v1 -->")
                        appendLine()
                        appendLine("# 독서모임 ${input.sessionMeta.sessionNumber}차 피드백")
                        appendLine()
                        appendLine("${input.sessionMeta.bookTitle} · regenerated")
                        appendLine()
                        appendLine("## 메타")
                        appendLine()
                        appendLine("- 일시: ${input.sessionMeta.meetingDate} 20:00")
                        appendLine()
                        appendLine("## 관찰자 노트")
                        appendLine()
                        appendLine("Regenerated observer notes.")
                        appendLine()
                        appendLine("## 참여자별 피드백")
                        appendLine()
                        appendLine("### 01. $firstParticipant")
                        appendLine()
                        appendLine("역할: 진행자")
                        appendLine()
                        appendLine("#### 참여 스타일")
                        appendLine()
                        appendLine("Regenerated style.")
                        appendLine()
                        appendLine("#### 실질 기여")
                        appendLine()
                        appendLine("- Regenerated contribution.")
                        appendLine()
                        appendLine("#### 문제점과 자기모순")
                        appendLine()
                        appendLine("##### 1. Stub issue")
                        appendLine()
                        appendLine("- 핵심: Regen core.")
                        appendLine("- 근거: Regen evidence.")
                        appendLine("- 해석: Regen interpretation.")
                        appendLine()
                        appendLine("#### 실천 과제")
                        appendLine()
                        appendLine("1. Regen action.")
                        appendLine()
                        appendLine("#### 드러난 한 문장")
                        appendLine()
                        appendLine("> Regen quote.")
                        appendLine()
                        appendLine("맥락: Regen context")
                        appendLine()
                        appendLine("주석: Regen note.")
                    }
            }
        return RegenerationOutput(
            patchedItem = input.item,
            patchedValue = value,
            usage = TokenUsage(inputTokens = 30, cachedInputTokens = 0, outputTokens = 60),
        )
    }
}

/**
 * Deterministic in-process stub for [SessionContentRegenerator]. Active only
 * when both `readmates.aigen.enabled` and `readmates.aigen.mock` are `true`.
 *
 * Targets [Provider.CLAUDE]. Companion [StubOpenAiSessionContentRegenerator]
 * targets [Provider.OPENAI] (task 4.3 provider-matrix integration test).
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled", "mock"], havingValue = "true")
class StubSessionContentRegenerator : SessionContentRegenerator {
    override val provider: Provider = Provider.CLAUDE

    override fun regenerateItem(input: RegenerationInput): RegenerationOutput = stubRegeneration(input)
}

/**
 * Mirror of [StubSessionContentRegenerator] for [Provider.OPENAI]. Added in
 * task 4.3 so `AiGenerateApiIntegrationTest`'s parameterized OPENAI rows can
 * exercise the regenerate flow without a real OpenAI SDK call.
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled", "mock"], havingValue = "true")
class StubOpenAiSessionContentRegenerator : SessionContentRegenerator {
    override val provider: Provider = Provider.OPENAI

    override fun regenerateItem(input: RegenerationInput): RegenerationOutput = stubRegeneration(input)
}

private fun stubRegeneration(input: RegenerationInput): RegenerationOutput = StubRegenerationPayload.buildOutput(input)
