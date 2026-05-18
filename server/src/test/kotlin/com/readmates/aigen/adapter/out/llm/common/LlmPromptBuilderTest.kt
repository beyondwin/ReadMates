package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class LlmPromptBuilderTest {
    private val meta =
        SessionMeta(
            sessionId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
            sessionNumber = 7,
            bookTitle = "데미안",
            bookAuthor = "헤르만 헤세",
            meetingDate = LocalDate.of(2026, 5, 16),
            expectedAuthorNames = listOf("김우승", "박지민", "이서연"),
            authorNameMode = AuthorNameMode.REAL,
        )

    private val snapshot =
        SessionImportV1Snapshot(
            format = "readmates-session-import:v1",
            sessionNumber = 7,
            bookTitle = "데미안",
            meetingDate = LocalDate.of(2026, 5, 16),
            summary = "기존 summary 내용",
            highlights = emptyList(),
            oneLineReviews = emptyList(),
            feedbackDocumentFileName = "feedback.md",
            feedbackDocumentMarkdown = "<!-- readmates-feedback:v1 -->\n# 독서모임 7차 피드백",
        )

    @Test
    fun `full system prompt contains all 5 hallucination prevention rules verbatim`() {
        val prompt = LlmPromptBuilder.buildFullSystemPrompt(meta, instructions = null)
        assertTrue(prompt.contains("녹취록에 없는 사실"), "rule 1 must be present")
        assertTrue(prompt.contains("참석자 이름은 정확히 다음 목록에서만 선택"), "rule 2 must be present")
        assertTrue(prompt.contains("공개 요약·하이라이트에 이메일·연락처·주소·사적 관계·의료·재정 정보 포함 금지"), "rule 3 must be present")
        assertTrue(prompt.contains("회차 번호·책 제목·날짜는 다음 값을 그대로 사용"), "rule 4 must be present")
        assertTrue(prompt.contains("<!-- readmates-feedback:v1 -->"), "rule 5 must mention feedback marker")
        assertTrue(prompt.contains("# 독서모임"), "rule 5 must mention feedback header")
    }

    @Test
    fun `full system prompt contains all expected author names`() {
        val prompt = LlmPromptBuilder.buildFullSystemPrompt(meta, instructions = null)
        assertTrue(prompt.contains("김우승"))
        assertTrue(prompt.contains("박지민"))
        assertTrue(prompt.contains("이서연"))
    }

    @Test
    fun `full system prompt hard-bakes session number book title and meeting date`() {
        val prompt = LlmPromptBuilder.buildFullSystemPrompt(meta, instructions = null)
        assertTrue(prompt.contains("회차 7"), "session number")
        assertTrue(prompt.contains("\"데미안\""), "book title in quotes")
        assertTrue(prompt.contains("2026-05-16"), "meeting date yyyy-MM-dd")
    }

    @Test
    fun `full system prompt mentions emit_session_import_v1 tool name`() {
        val prompt = LlmPromptBuilder.buildFullSystemPrompt(meta, instructions = null)
        assertTrue(prompt.contains("emit_session_import_v1"))
    }

    @Test
    fun `full system prompt includes optional instructions when provided`() {
        val prompt = LlmPromptBuilder.buildFullSystemPrompt(meta, instructions = "감정선을 강조해주세요.")
        assertTrue(prompt.contains("감정선을 강조해주세요."))
    }

    @Test
    fun `regen prompt for SUMMARY mentions only summary field`() {
        val prompt =
            LlmPromptBuilder.buildRegenSystemPrompt(
                meta = meta,
                item = GenerationItem.SUMMARY,
                instructions = null,
                currentSnapshot = snapshot,
            )
        assertTrue(prompt.contains("summary"), "must direct summary regen")
        assertTrue(prompt.contains("다른 필드는 출력하지 말 것"), "must restrict output to summary")
        assertFalse(prompt.contains("다음 항목만 다시 생성: highlights"))
    }

    @Test
    fun `regen prompt for HIGHLIGHTS mentions only highlights field`() {
        val prompt =
            LlmPromptBuilder.buildRegenSystemPrompt(
                meta = meta,
                item = GenerationItem.HIGHLIGHTS,
                instructions = null,
                currentSnapshot = snapshot,
            )
        assertTrue(prompt.contains("highlights"))
        assertTrue(prompt.contains("다른 필드는 출력하지 말 것"))
    }

    @Test
    fun `regen prompt for ONE_LINE_REVIEWS mentions only oneLineReviews field`() {
        val prompt =
            LlmPromptBuilder.buildRegenSystemPrompt(
                meta = meta,
                item = GenerationItem.ONE_LINE_REVIEWS,
                instructions = null,
                currentSnapshot = snapshot,
            )
        assertTrue(prompt.contains("oneLineReviews"))
    }

    @Test
    fun `regen prompt for FEEDBACK_DOCUMENT mentions feedback marker`() {
        val prompt =
            LlmPromptBuilder.buildRegenSystemPrompt(
                meta = meta,
                item = GenerationItem.FEEDBACK_DOCUMENT,
                instructions = null,
                currentSnapshot = snapshot,
            )
        assertTrue(prompt.contains("feedbackDocumentMarkdown") || prompt.contains("feedback"))
        assertTrue(prompt.contains("<!-- readmates-feedback:v1 -->"))
    }

    @Test
    fun `regen prompt still includes hallucination prevention rules 1 through 4`() {
        val prompt =
            LlmPromptBuilder.buildRegenSystemPrompt(
                meta = meta,
                item = GenerationItem.SUMMARY,
                instructions = null,
                currentSnapshot = snapshot,
            )
        assertTrue(prompt.contains("녹취록에 없는 사실"))
        assertTrue(prompt.contains("참석자 이름은 정확히 다음 목록에서만 선택"))
        assertTrue(prompt.contains("공개 요약·하이라이트에 이메일·연락처·주소·사적 관계·의료·재정 정보 포함 금지"))
        assertTrue(prompt.contains("회차 번호·책 제목·날짜는 다음 값을 그대로 사용"))
    }
}
