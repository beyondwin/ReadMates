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
        val exception =
            assertThrows(FeedbackDocumentException::class.java) {
                parser.parse(validFeedbackMarkdown().replace("<!-- readmates-feedback:v1 -->\n\n", ""))
            }

        assertTemplateError(exception)
    }

    @Test
    fun `rejects missing required heading with bad request template error`() {
        val exception =
            assertThrows(FeedbackDocumentException::class.java) {
                parser.parse(validFeedbackMarkdown().replace("## 관찰자 노트", "## 관찰 메모"))
            }

        assertTemplateError(exception)
    }

    @Test
    fun `parses v1 document with template version 1 and empty v2 sections`() {
        val document = parser.parse(validFeedbackMarkdown())

        assertEquals(1, document.templateVersion)
        assertEquals(emptyList<FeedbackMetadataItem>(), document.overview)
        assertEquals(emptyList<FeedbackHighlight>(), document.highlights)
        assertEquals(null, document.groupFeedback)
        assertEquals(null, document.trend)
        assertEquals(emptyList<String>(), document.followUpQuestions)
        assertEquals(emptyList<String>(), document.participants[0].badges)
        assertEquals(emptyList<FeedbackSessionQuote>(), document.participants[0].sessionQuotes)
    }

    @Test
    fun `parses v2 group sections`() {
        val document = parser.parse(validV2FeedbackMarkdown())

        assertEquals(2, document.templateVersion)
        assertEquals(
            listOf(
                FeedbackMetadataItem("무엇을", "판단 기준을 사례로 확인했다."),
                FeedbackMetadataItem("가장 좋았던 순간", "기준이라는 단어를 함께 다듬었다."),
            ),
            document.overview,
        )
        assertEquals(
            listOf("이번 회차는 판단 기준을 명확히 세우는 연습에 집중했다."),
            document.observerNotes,
        )
        assertEquals(
            listOf(
                FeedbackHighlight(
                    title = "기준이 두 번 다듬어졌다",
                    lines =
                        listOf(
                            FeedbackHighlightLine("이멤버5", "10:00", "피하는 게 맞다고 봤어요."),
                            FeedbackHighlightLine("김호스트", "1:02:30", "시간 범위로 나눠 보면 어때요?"),
                        ),
                    why = "한 사람의 결론 대신 두 사람의 설명이 쌓였다.",
                ),
            ),
            document.highlights,
        )
        val group = requireNotNull(document.groupFeedback)
        assertEquals(
            listOf(FeedbackGroupPoint("말뜻부터 맞췄다", "기준(10분~22분)", "애매한 말을 확인하고 넘어갔다.")),
            group.strengths,
        )
        assertEquals(
            listOf(FeedbackGroupPoint("결론이 늦게 나온다", "두 사람에게 같은 지적", "결론을 먼저 말하면 좋다.")),
            group.improvements,
        )
        assertEquals(
            listOf(FeedbackSpeakingShare("이멤버5", 55), FeedbackSpeakingShare("김호스트", 45)),
            group.speakingShares,
        )
        assertEquals("녹음이 온전한 구간 기준", group.speakingNote)
        assertEquals(listOf("꼭 다룰 질문을 미리 표시한다."), group.nextSteps)

        val trend = requireNotNull(document.trend)
        assertEquals(
            listOf(FeedbackAttendancePoint("1차", 3), FeedbackAttendancePoint("2차", 2)),
            trend.attendance,
        )
        assertEquals(listOf(FeedbackTrendPhase("1차", "일반화 지적이 많았다")), trend.phases)
        assertEquals(
            listOf(FeedbackRepeatedTask("결론부터 말하기", "이멤버5 1·2차", "진행 중")),
            trend.repeatedTasks,
        )
        assertEquals(listOf("기준은 누가 정하는가?"), document.followUpQuestions)
    }

    @Test
    fun `parses v2 participant sections`() {
        val document = parser.parse(validV2FeedbackMarkdown())

        val first = document.participants[0]
        assertEquals(listOf("2회 참여", "발언 55%"), first.badges)
        assertEquals(
            listOf(FeedbackJourneyStep("1차", "사례가 길었다"), FeedbackJourneyStep("2차", "결론을 먼저 말했다")),
            first.journey,
        )
        assertEquals(listOf("1차 과제를 2차에 실천했다 (10:00)"), first.achievements)
        assertEquals(emptyList<String>(), first.baseline)
        assertEquals(
            listOf(FeedbackSessionQuote("10:00", "피하는 게 맞다고 봤어요.", "기준을 행동으로 옮긴 첫 발언이다.")),
            first.sessionQuotes,
        )
        assertEquals(listOf("실패를 피하는 방식으로 의사결정 기준을 설명했다. [10:00]"), first.contributionBullets)

        val second = document.participants[1]
        assertEquals(listOf("첫 기록"), second.badges)
        assertEquals(listOf("결론으로 시작하는지"), second.baseline)
        assertEquals(emptyList<FeedbackJourneyStep>(), second.journey)
    }

    @Test
    fun `rejects v2 sections under v1 marker`() {
        val exception =
            assertThrows(FeedbackDocumentException::class.java) {
                parser.parse(validV2FeedbackMarkdown().replace("readmates-feedback:v2", "readmates-feedback:v1"))
            }

        assertTemplateError(exception)
    }

    @Test
    fun `parses v2 highlight and session quote lines without time`() {
        val document =
            parser.parse(
                validV2FeedbackMarkdown()
                    .replace("- 김호스트 [1:02:30]: 시간 범위로 나눠 보면 어때요?", "- 김호스트: 시간 범위로 나눠 보면 어때요?")
                    .replace("- [10:00] 피하는 게 맞다고 봤어요. | 기준을", "- 피하는 게 맞다고 봤어요. | 기준을"),
            )

        assertEquals(FeedbackHighlightLine("김호스트", null, "시간 범위로 나눠 보면 어때요?"), document.highlights[0].lines[1])
        assertEquals(null, document.participants[0].sessionQuotes[0].time)
    }

    @Test
    fun `rejects malformed v2 highlight line`() {
        val exception =
            assertThrows(FeedbackDocumentException::class.java) {
                parser.parse(validV2FeedbackMarkdown().replace("- 이멤버5 [10:00]: 피하는 게 맞다고 봤어요.", "- 이멤버5 피하는 게 맞다고 봤어요."))
            }

        assertTemplateError(exception)
    }

    @Test
    fun `rejects v2 group point without evidence`() {
        val exception =
            assertThrows(FeedbackDocumentException::class.java) {
                parser.parse(validV2FeedbackMarkdown().replace("- 근거: 기준(10분~22분)\n", ""))
            }

        assertTemplateError(exception)
    }

    @Test
    fun `rejects unknown top level heading in v2`() {
        val exception =
            assertThrows(FeedbackDocumentException::class.java) {
                parser.parse(validV2FeedbackMarkdown().replace("## 이어갈 질문", "## 기타"))
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

    private fun validV2FeedbackMarkdown(): String =
        """
        <!-- readmates-feedback:v2 -->

        # 독서모임 2차 피드백

        투자의 원칙 · 2026.04.15

        ## 메타

        - 일시: 2026.04.15 (수) · 19:40
        - 참여자: 이멤버5, 김호스트

        ## 한눈에 보기

        - 무엇을: 판단 기준을 사례로 확인했다.
        - 가장 좋았던 순간: 기준이라는 단어를 함께 다듬었다.

        ## 관찰자 노트

        이번 회차는 판단 기준을 명확히 세우는 연습에 집중했다.

        ## 오늘의 하이라이트

        ### 1. 기준이 두 번 다듬어졌다

        - 이멤버5 [10:00]: 피하는 게 맞다고 봤어요.
        - 김호스트 [1:02:30]: 시간 범위로 나눠 보면 어때요?

        왜 좋았나: 한 사람의 결론 대신 두 사람의 설명이 쌓였다.

        ## 모임 피드백

        ### 잘된 점

        #### 1. 말뜻부터 맞췄다

        - 근거: 기준(10분~22분)
        - 해석: 애매한 말을 확인하고 넘어갔다.

        ### 아쉬운 점

        #### 1. 결론이 늦게 나온다

        - 근거: 두 사람에게 같은 지적
        - 해석: 결론을 먼저 말하면 좋다.

        ### 발언 분량

        - 이멤버5: 55
        - 김호스트: 45

        주석: 녹음이 온전한 구간 기준

        ### 다음 모임 제안

        1. 꼭 다룰 질문을 미리 표시한다.

        ## 모임의 흐름

        ### 회차별 참석

        - 1차: 3
        - 2차: 2

        ### 단계

        - 1차: 일반화 지적이 많았다

        ### 반복 과제

        - 결론부터 말하기 | 이멤버5 1·2차 | 진행 중

        ## 이어갈 질문

        1. 기준은 누가 정하는가?

        ## 참여자별 피드백

        ### 01. 이멤버5

        역할: 구체적인 사례를 통해 판단 기준을 확인하는 참여자
        배지: 2회 참여, 발언 55%

        #### 변화 흐름

        - 1차: 사례가 길었다
        - 2차: 결론을 먼저 말했다

        #### 지난 과제에서 해낸 것

        - 1차 과제를 2차에 실천했다 (10:00)

        #### 참여 스타일

        이멤버5은 질문의 전제를 먼저 확인하고 자기 경험으로 이어 갔다.

        #### 실질 기여

        - 실패를 피하는 방식으로 의사결정 기준을 설명했다. [10:00]

        #### 이번 모임의 발언

        - [10:00] 피하는 게 맞다고 봤어요. | 기준을 행동으로 옮긴 첫 발언이다.

        #### 문제점과 자기모순

        ##### 1. 기준은 제시했지만 적용 범위가 좁았다

        - 핵심: 판단 기준은 분명했지만 다른 상황으로 확장하지 않았다.
        - 근거: "그 상황에서는 피하는 게 맞다고 봤어요." [12:00]
        - 해석: 적용 가능한 조건을 함께 말하면 논지가 더 선명해진다.

        #### 실천 과제

        1. 판단 기준을 말할 때 적용 조건을 함께 말한다.

        #### 드러난 한 문장

        > 피하는 게 맞다고 봤어요.

        맥락: 실패를 피하는 의사결정을 설명하던 장면 · [12:00]

        주석: 판단 기준이 행동으로 이어지는 순간이다.

        ### 02. 김호스트

        역할: 논의를 구조화해 기준을 비교하는 참여자
        배지: 첫 기록

        #### 첫 기록 기준점

        - 결론으로 시작하는지

        #### 참여 스타일

        김호스트은 발언의 공통점을 묶어 질문을 다시 만들었다.

        #### 실질 기여

        - 투자 원칙을 시간 범위에 따라 구분했다. [22:00]

        #### 문제점과 자기모순

        ##### 1. 비교 기준을 열었지만 결론을 유보했다

        - 핵심: 어떤 선택이 더 적절한지 말하지 않았다.
        - 근거: "둘 다 장단점은 있는 것 같아요." [23:00]
        - 해석: 비교 뒤 선택 조건을 붙이면 논의가 판단으로 이어진다.

        #### 실천 과제

        1. 비교 발언 뒤에는 선택 조건을 하나 이상 덧붙인다.

        #### 드러난 한 문장

        > 둘 다 장단점은 있는 것 같아요.

        맥락: 투자 원칙의 차이를 비교하던 장면 · [23:00]

        주석: 비교가 판단으로 이어지기 전 멈추는 패턴이다.
        """.trimIndent()
}
