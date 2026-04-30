package com.readmates.feedback.application

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class FeedbackDocumentParserTest {
    private val parser = FeedbackDocumentParser()

    @Test
    fun `parses feedback document into typed fields after normalizing CRLF`() {
        val document = parser.parse(validFeedbackMarkdown().replace("\n", "\r\n"))

        assertEquals("독서모임 6차 피드백", document.title)
        assertEquals("투자의 원칙 · 2026.04.15", document.subtitle)
        assertEquals(
            listOf(
                FeedbackMetadataItem("일시", "2026.04.15 (수) · 19:40"),
                FeedbackMetadataItem("소요시간", "2시간 1분"),
                FeedbackMetadataItem("책", "투자의 원칙 · 테스트 저자"),
                FeedbackMetadataItem("참여자", "이멤버5, 김호스트"),
            ),
            document.metadata,
        )
        assertEquals(
            listOf(
                "이번 회차는 판단 기준을 명확히 세우는 연습에 집중했다.",
                "관찰자는 참여자의 기준이 실제 사례로 이어지는지 확인했다.",
            ),
            document.observerNotes,
        )

        assertEquals(2, document.participants.size)
        val first = document.participants[0]
        assertEquals(1, first.number)
        assertEquals("이멤버5", first.name)
        assertEquals("구체적인 사례를 통해 판단 기준을 확인하는 참여자", first.role)
        assertEquals(
            listOf(
                "이멤버5은 질문의 전제를 먼저 확인하고 자기 경험으로 이어 갔다.",
                "다른 사람의 답변을 요약한 뒤 자신의 판단을 덧붙였다.",
            ),
            first.styleParagraphs,
        )
        assertEquals(
            listOf(
                "실패를 피하는 방식으로 의사결정 기준을 설명했다. [10:00]",
                "상대의 사례를 자기 언어로 다시 정리했다. [11:20]",
            ),
            first.contributionBullets,
        )
        assertEquals(
            listOf(
                FeedbackProblem(
                    title = "기준은 제시했지만 적용 범위가 좁았다",
                    core = "판단 기준은 분명했지만 다른 상황으로 확장하지 않았다.",
                    evidence = "\"그 상황에서는 피하는 게 맞다고 봤어요.\" [12:00]",
                    interpretation = "기준을 설명한 뒤 적용 가능한 조건을 함께 말하면 논지가 더 선명해진다.",
                ),
            ),
            first.problems,
        )
        assertEquals(
            listOf(
                "다음 모임에서 판단 기준을 말할 때 적용 조건을 함께 말한다.",
                "상대 사례에 같은 기준을 적용해 본다.",
            ),
            first.actionItems,
        )
        assertEquals(
            FeedbackRevealingQuote(
                quote = "\"그 상황에서는 피하는 게 맞다고 봤어요.\"",
                context = "실패를 피하는 의사결정을 설명하던 장면 · [12:00]",
                note = "이 문장은 판단 기준이 행동으로 이어지는 순간을 보여준다.",
            ),
            first.revealingQuote,
        )

        val second = document.participants[1]
        assertEquals(2, second.number)
        assertEquals("김호스트", second.name)
    }

    @Test
    fun `rejects missing marker with bad request template error`() {
        val exception = assertThrows(FeedbackDocumentException::class.java) {
            parser.parse(validFeedbackMarkdown().replace("<!-- readmates-feedback:v1 -->\n\n", ""))
        }

        assertTemplateError(exception)
    }

    @Test
    fun `rejects missing required heading with bad request template error`() {
        val exception = assertThrows(FeedbackDocumentException::class.java) {
            parser.parse(validFeedbackMarkdown().replace("## 관찰자 노트", "## 관찰 메모"))
        }

        assertTemplateError(exception)
    }

    private fun assertTemplateError(exception: FeedbackDocumentException) {
        assertEquals(FeedbackDocumentError.INVALID_TEMPLATE, exception.error)
        assertEquals("ReadMates 피드백 템플릿 형식이 아닙니다.", exception.message)
    }

    private fun validFeedbackMarkdown(): String =
        """
        <!-- readmates-feedback:v1 -->

        # 독서모임 6차 피드백

        투자의 원칙 · 2026.04.15

        ## 메타

        - 일시: 2026.04.15 (수) · 19:40
        - 소요시간: 2시간 1분
        - 책: 투자의 원칙 · 테스트 저자
        - 참여자: 이멤버5, 김호스트

        ## 관찰자 노트

        이번 회차는 판단 기준을 명확히 세우는 연습에 집중했다.

        관찰자는 참여자의 기준이 실제 사례로 이어지는지 확인했다.

        ## 참여자별 피드백

        ### 01. 이멤버5

        역할: 구체적인 사례를 통해 판단 기준을 확인하는 참여자

        #### 참여 스타일

        이멤버5은 질문의 전제를 먼저 확인하고 자기 경험으로 이어 갔다.

        다른 사람의 답변을 요약한 뒤 자신의 판단을 덧붙였다.

        #### 실질 기여

        - 실패를 피하는 방식으로 의사결정 기준을 설명했다. [10:00]
        - 상대의 사례를 자기 언어로 다시 정리했다. [11:20]

        #### 문제점과 자기모순

        ##### 1. 기준은 제시했지만 적용 범위가 좁았다

        - 핵심: 판단 기준은 분명했지만 다른 상황으로 확장하지 않았다.
        - 근거: "그 상황에서는 피하는 게 맞다고 봤어요." [12:00]
        - 해석: 기준을 설명한 뒤 적용 가능한 조건을 함께 말하면 논지가 더 선명해진다.

        #### 실천 과제

        1. 다음 모임에서 판단 기준을 말할 때 적용 조건을 함께 말한다.
        2. 상대 사례에 같은 기준을 적용해 본다.

        #### 드러난 한 문장

        > "그 상황에서는 피하는 게 맞다고 봤어요."

        맥락: 실패를 피하는 의사결정을 설명하던 장면 · [12:00]

        주석: 이 문장은 판단 기준이 행동으로 이어지는 순간을 보여준다.

        ### 02. 김호스트

        역할: 논의를 구조화해 기준을 비교하는 참여자

        #### 참여 스타일

        김호스트은 발언의 공통점을 묶어 질문을 다시 만들었다.

        #### 실질 기여

        - 투자 원칙을 시간 범위에 따라 구분했다. [22:00]

        #### 문제점과 자기모순

        ##### 1. 비교 기준을 열었지만 결론을 유보했다

        - 핵심: 기준을 나눴지만 어떤 선택이 더 적절한지 말하지 않았다.
        - 근거: "둘 다 장단점은 있는 것 같아요." [23:00]
        - 해석: 비교 뒤 선택 조건을 붙이면 논의가 판단으로 이어진다.

        #### 실천 과제

        1. 비교 발언 뒤에는 선택 조건을 하나 이상 덧붙인다.

        #### 드러난 한 문장

        > "둘 다 장단점은 있는 것 같아요."

        맥락: 투자 원칙의 차이를 비교하던 장면 · [23:00]

        주석: 이 문장은 비교가 판단으로 이어지기 전 멈추는 패턴을 보여준다.
        """.trimIndent()
}
