package com.readmates.session.api

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.session.application.CurrentSessionNotOpenException
import com.readmates.session.application.model.ExpectedSessionRevision
import com.readmates.session.application.model.HostSessionCommand
import com.readmates.session.application.model.HostSessionIdCommand
import com.readmates.session.application.model.SaveCheckinCommand
import com.readmates.session.application.model.SaveLongReviewCommand
import com.readmates.session.application.model.SaveOneLineReviewCommand
import com.readmates.session.application.model.SaveQuestionCommand
import com.readmates.session.application.model.UpdateRsvpCommand
import com.readmates.session.application.service.HostSessionDraftCommandService
import com.readmates.session.application.service.HostSessionLifecycleService
import com.readmates.session.application.service.SessionMemberWriteService
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class HostSessionCloseMemberWriteRaceDbTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val transactionManager: PlatformTransactionManager,
    @param:Autowired private val draftService: HostSessionDraftCommandService,
    @param:Autowired private val lifecycleService: HostSessionLifecycleService,
    @param:Autowired private val memberWriteService: SessionMemberWriteService,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionIds = linkedSetOf<String>()
    private val transactionTemplate = TransactionTemplate(transactionManager)

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("reading_checkins", "session_id", createdSessionIds)
            deleteWhereIn("questions", "session_id", createdSessionIds)
            deleteWhereIn("one_line_reviews", "session_id", createdSessionIds)
            deleteWhereIn("long_reviews", "session_id", createdSessionIds)
            deleteWhereIn("session_participants", "session_id", createdSessionIds)
            deleteWhereIn("host_session_lifecycle_audit", "session_id", createdSessionIds)
            deleteWhereIn("host_session_change_audit", "session_id", createdSessionIds)
            deleteWhereIn("session_publication_versions", "session_id", createdSessionIds)
            deleteWhereIn("sessions", "id", createdSessionIds)
        } finally {
            createdSessionIds.clear()
        }
    }

    @Test
    @Timeout(30)
    fun `rsvp before close is preserved and close waits on the session lock`() {
        assertWriteBeforeClose(
            write = { memberWriteService.updateRsvp(UpdateRsvpCommand(member, "GOING")) },
            preserved = { assertThat(rsvpStatus(it)).isEqualTo("GOING") },
        )
    }

    @Test
    @Timeout(30)
    fun `close before rsvp returns a lifecycle conflict without changing rsvp`() {
        assertCloseBeforeWrite(
            write = { memberWriteService.updateRsvp(UpdateRsvpCommand(member, "GOING")) },
            unchanged = { assertThat(rsvpStatus(it)).isEqualTo("NO_RESPONSE") },
        )
    }

    @Test
    @Timeout(30)
    fun `check-in before close is preserved and close waits on the session lock`() {
        assertWriteBeforeClose(
            write = { memberWriteService.saveCheckin(SaveCheckinCommand(member, 40)) },
            preserved = { assertThat(checkinProgress(it)).isEqualTo(40) },
        )
    }

    @Test
    @Timeout(30)
    fun `close before check-in returns a lifecycle conflict without a ghost row`() {
        assertCloseBeforeWrite(
            write = { memberWriteService.saveCheckin(SaveCheckinCommand(member, 40)) },
            unchanged = { assertThat(checkinCount(it)).isZero() },
        )
    }

    @Test
    @Timeout(30)
    fun `question before close is preserved and close waits on the session lock`() {
        assertWriteBeforeClose(
            write = {
                memberWriteService.saveQuestion(SaveQuestionCommand(member, 1, "마감 전에 남긴 질문", null))
            },
            preserved = { assertThat(questionCount(it)).isEqualTo(1) },
        )
    }

    @Test
    @Timeout(30)
    fun `close before question returns a lifecycle conflict without a ghost row`() {
        assertCloseBeforeWrite(
            write = {
                memberWriteService.saveQuestion(SaveQuestionCommand(member, 1, "마감 뒤 질문", null))
            },
            unchanged = { assertThat(questionCount(it)).isZero() },
        )
    }

    @Test
    @Timeout(30)
    fun `one-line review before close is preserved and close waits on the session lock`() {
        assertWriteBeforeClose(
            write = { memberWriteService.saveOneLineReview(SaveOneLineReviewCommand(member, "한 줄")) },
            preserved = { assertThat(oneLineCount(it)).isEqualTo(1) },
        )
    }

    @Test
    @Timeout(30)
    fun `close before one-line review returns a lifecycle conflict without a ghost row`() {
        assertCloseBeforeWrite(
            write = { memberWriteService.saveOneLineReview(SaveOneLineReviewCommand(member, "한 줄")) },
            unchanged = { assertThat(oneLineCount(it)).isZero() },
        )
    }

    @Test
    @Timeout(30)
    fun `long review before close is preserved and close waits on the session lock`() {
        assertWriteBeforeClose(
            write = { memberWriteService.saveLongReview(SaveLongReviewCommand(member, "긴 서평")) },
            preserved = { assertThat(longReviewCount(it)).isEqualTo(1) },
        )
    }

    @Test
    @Timeout(30)
    fun `close before long review returns a lifecycle conflict without a ghost row`() {
        assertCloseBeforeWrite(
            write = { memberWriteService.saveLongReview(SaveLongReviewCommand(member, "긴 서평")) },
            unchanged = { assertThat(longReviewCount(it)).isZero() },
        )
    }

    private fun assertWriteBeforeClose(
        write: () -> Unit,
        preserved: (String) -> Unit,
    ) {
        val sessionId = openSession()
        val writeApplied = CountDownLatch(1)
        val releaseWrite = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val writeFuture =
                executor.submit {
                    transactionTemplate.executeWithoutResult {
                        write()
                        writeApplied.countDown()
                        check(releaseWrite.await(10, TimeUnit.SECONDS))
                    }
                }
            check(writeApplied.await(10, TimeUnit.SECONDS))
            val closeFuture =
                executor.submit {
                    lifecycleService.close(closeCommand(sessionId))
                }
            assertThatThrownBy { closeFuture.get(250, TimeUnit.MILLISECONDS) }
                .isInstanceOf(TimeoutException::class.java)
            releaseWrite.countDown()
            writeFuture.get(10, TimeUnit.SECONDS)
            closeFuture.get(10, TimeUnit.SECONDS)
            assertThat(sessionState(sessionId)).isEqualTo("CLOSED")
            preserved(sessionId)
        } finally {
            releaseWrite.countDown()
            executor.shutdownNow()
        }
    }

    private fun assertCloseBeforeWrite(
        write: () -> Unit,
        unchanged: (String) -> Unit,
    ) {
        val sessionId = openSession()
        val closeApplied = CountDownLatch(1)
        val releaseClose = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val closeFuture =
                executor.submit {
                    transactionTemplate.executeWithoutResult {
                        lifecycleService.close(closeCommand(sessionId))
                        closeApplied.countDown()
                        check(releaseClose.await(10, TimeUnit.SECONDS))
                    }
                }
            check(closeApplied.await(10, TimeUnit.SECONDS))
            val writeFuture =
                executor.submit<Throwable?> {
                    runCatching { write() }.exceptionOrNull()
                }
            assertThatThrownBy { writeFuture.get(250, TimeUnit.MILLISECONDS) }
                .isInstanceOf(TimeoutException::class.java)
            releaseClose.countDown()
            closeFuture.get(10, TimeUnit.SECONDS)
            assertThat(writeFuture.get(10, TimeUnit.SECONDS))
                .isInstanceOf(CurrentSessionNotOpenException::class.java)
            assertThat(sessionState(sessionId)).isEqualTo("CLOSED")
            unchanged(sessionId)
        } finally {
            releaseClose.countDown()
            executor.shutdownNow()
        }
    }

    private fun openSession(): String {
        val created =
            draftService.create(
                HostSessionCommand(
                    host = host,
                    title = "경합 초안 ${UUID.randomUUID()}",
                    bookTitle = "경합 책",
                    bookAuthor = "경합 저자",
                    bookLink = null,
                    bookImageUrl = null,
                    date = "2026-09-11",
                    startTime = "20:00",
                    endTime = "22:00",
                    questionDeadlineAt = null,
                    locationLabel = "온라인",
                    meetingUrl = null,
                    meetingPasscode = null,
                ),
            )
        createdSessionIds += created.sessionId
        lifecycleService.open(
            HostSessionIdCommand(
                host = host,
                sessionId = UUID.fromString(created.sessionId),
                expectedSessionRevision = ExpectedSessionRevision(0),
            ),
        )
        return created.sessionId
    }

    private fun closeCommand(sessionId: String) =
        HostSessionIdCommand(
            host = host,
            sessionId = UUID.fromString(sessionId),
            expectedSessionRevision = ExpectedSessionRevision(sessionRevision(sessionId)),
        )

    private fun sessionRevision(sessionId: String): Long =
        jdbcTemplate.queryForObject(
            "select session_revision from sessions where id = ?",
            Long::class.java,
            sessionId,
        ) ?: error("missing session revision")

    private fun sessionState(sessionId: String): String =
        jdbcTemplate.queryForObject("select state from sessions where id = ?", String::class.java, sessionId)
            ?: error("missing state")

    private fun rsvpStatus(sessionId: String): String =
        jdbcTemplate.queryForObject(
            """
            select rsvp_status
            from session_participants
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            String::class.java,
            sessionId,
            MEMBER5_MEMBERSHIP_ID,
        ) ?: error("missing rsvp")

    private fun checkinProgress(sessionId: String): Int =
        jdbcTemplate.queryForObject(
            """
            select reading_progress
            from reading_checkins
            where session_id = ? and membership_id = ?
            """.trimIndent(),
            Int::class.java,
            sessionId,
            MEMBER5_MEMBERSHIP_ID,
        ) ?: error("missing check-in")

    private fun checkinCount(sessionId: String): Int = countRows("reading_checkins", sessionId)

    private fun questionCount(sessionId: String): Int = countRows("questions", sessionId)

    private fun oneLineCount(sessionId: String): Int = countRows("one_line_reviews", sessionId)

    private fun longReviewCount(sessionId: String): Int = countRows("long_reviews", sessionId)

    private fun countRows(
        table: String,
        sessionId: String,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $table where session_id = ? and membership_id = ?",
            Int::class.java,
            sessionId,
            MEMBER5_MEMBERSHIP_ID,
        ) ?: 0

    private fun deleteWhereIn(
        table: String,
        column: String,
        ids: Set<String>,
    ) {
        if (ids.isEmpty()) return
        val placeholders = ids.joinToString(",") { "?" }
        jdbcTemplate.update("delete from $table where $column in ($placeholders)", *ids.toTypedArray())
    }

    private val host =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = UUID.fromString(CLUB_ID),
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "김호스트",
            accountName = "김호스트",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private val member =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000106"),
            membershipId = UUID.fromString(MEMBER5_MEMBERSHIP_ID),
            clubId = UUID.fromString(CLUB_ID),
            clubSlug = "reading-sai",
            email = "member5@example.com",
            displayName = "이멤버5",
            accountName = "이멤버5",
            role = MembershipRole.MEMBER,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private companion object {
        const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        const val MEMBER5_MEMBERSHIP_ID = "00000000-0000-0000-0000-000000000206"
    }
}
