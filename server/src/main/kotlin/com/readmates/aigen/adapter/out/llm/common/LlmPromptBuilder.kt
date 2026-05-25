package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import java.time.format.DateTimeFormatter

/**
 * Deterministic, pure system-prompt assembler for LLM session-import generation.
 *
 * Embeds the spec §9.3 hallucination-prevention rules verbatim (Korean) plus a
 * schema-enforcement directive instructing the model to emit the
 * `emit_session_import_v1` tool call with all required JSON Schema fields.
 *
 * Pure / stateless: same inputs always produce the same String. No I/O, no clocks.
 */
object LlmPromptBuilder {
    private const val TOOL_NAME = "emit_session_import_v1"
    private const val FEEDBACK_MARKER = "<!-- readmates-feedback:v1 -->"
    private val DATE_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    fun buildFullSystemPrompt(
        meta: SessionMeta,
        instructions: String?,
    ): String {
        val sb = StringBuilder()
        sb.append("당신은 ReadMates 독서모임 회차 콘텐츠 생성 어시스턴트입니다.\n")
        sb.append("녹취록을 분석하여 readmates-session-import:v1 JSON 형식을 생성해야 합니다.\n\n")
        appendCoreRules(sb, meta)
        sb.append("5. Feedback markdown은 `")
        sb.append(FEEDBACK_MARKER)
        sb.append("` 로 시작하고 `# 독서모임 ")
        sb.append(meta.sessionNumber)
        sb.append("차 피드백` 헤더를 포함할 것.\n\n")
        appendSchemaDirective(sb)
        appendInstructions(sb, instructions)
        return sb.toString()
    }

    fun buildRegenSystemPrompt(
        meta: SessionMeta,
        item: GenerationItem,
        instructions: String?,
        currentSnapshot: SessionImportV1Snapshot,
    ): String {
        val sb = StringBuilder()
        sb.append("당신은 ReadMates 독서모임 회차 콘텐츠 부분 재생성 어시스턴트입니다.\n")
        sb.append("기존 결과의 특정 항목만 재생성합니다. 다른 필드는 출력하지 말 것.\n\n")
        appendCoreRules(sb, meta)
        sb.append(itemSpecificDirective(item))
        sb.append("\n\n")
        appendCurrentSnapshotContext(sb, currentSnapshot)
        appendInstructions(sb, instructions)
        return sb.toString()
    }

    private fun appendCoreRules(
        sb: StringBuilder,
        meta: SessionMeta,
    ) {
        sb.append("[Hallucination 방지 규칙]\n")
        sb.append("1. 녹취록에 없는 사실·평가·배경을 만들지 말 것.\n")
        sb.append("2. 참석자 이름은 정확히 다음 목록에서만 선택할 것: ")
        sb.append(meta.expectedAuthorNames.joinToString(", "))
        sb.append("\n")
        sb.append("3. 공개 요약·하이라이트에 이메일·연락처·주소·사적 관계·의료·재정 정보 포함 금지.\n")
        sb.append("4. 회차 번호·책 제목·날짜는 다음 값을 그대로 사용할 것: 회차 ")
        sb.append(meta.sessionNumber)
        sb.append(", 책 \"")
        sb.append(meta.bookTitle)
        sb.append("\", 날짜 ")
        sb.append(meta.meetingDate.format(DATE_FORMAT))
        sb.append("\n")
    }

    private fun appendSchemaDirective(sb: StringBuilder) {
        sb.append("[Schema 강제 지시]\n")
        sb.append("응답은 반드시 ")
        sb.append(TOOL_NAME)
        sb.append(" tool 호출 형식으로만 출력하고, JSON Schema의 모든 필수 필드를 채워라.\n")
    }

    private fun itemSpecificDirective(item: GenerationItem): String =
        when (item) {
            GenerationItem.SUMMARY ->
                "[재생성 항목]\n다음 항목만 다시 생성: summary (한 문단). 다른 필드는 출력하지 말 것."
            GenerationItem.HIGHLIGHTS ->
                "[재생성 항목]\n다음 항목만 다시 생성: highlights (1~6개). 다른 필드는 출력하지 말 것."
            GenerationItem.ONE_LINE_REVIEWS ->
                "[재생성 항목]\n다음 항목만 다시 생성: oneLineReviews (참석자별 1줄, 중복 금지). 다른 필드는 출력하지 말 것."
            GenerationItem.FEEDBACK_DOCUMENT ->
                "[재생성 항목]\n다음 항목만 다시 생성: feedbackDocumentMarkdown " +
                    "($FEEDBACK_MARKER 로 시작, `# 독서모임 N차 피드백` 헤더 포함). " +
                    "다른 필드는 출력하지 말 것."
        }

    private fun appendCurrentSnapshotContext(
        sb: StringBuilder,
        snapshot: SessionImportV1Snapshot,
    ) {
        sb.append("[현재 결과 컨텍스트]\n")
        sb.append("회차: ").append(snapshot.sessionNumber).append("\n")
        sb.append("책 제목: ").append(snapshot.bookTitle).append("\n")
        sb.append("날짜: ").append(snapshot.meetingDate.format(DATE_FORMAT)).append("\n\n")
    }

    private fun appendInstructions(
        sb: StringBuilder,
        instructions: String?,
    ) {
        if (!instructions.isNullOrBlank()) {
            sb.append("\n[추가 지시]\n")
            sb.append(instructions)
            sb.append("\n")
        }
    }
}
