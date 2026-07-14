@file:Suppress("MaxLineLength")

package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationCommitReceipt
import com.readmates.aigen.application.port.out.AiGenerationMembershipChangedException
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

@SpringBootTest
@TestPropertySource(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Tag("integration")
class JdbcAiGenerationCommitPersistenceAdapterTest(
    @param:Autowired private val adapter: JdbcAiGenerationCommitPersistenceAdapter,
    @param:Autowired private val jdbc: JdbcTemplate,
    @param:Autowired private val transactions: TransactionTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `upsert inserts missing participant and reactivates an existing removed participant`() {
        val fixture = fixture()
        val first = adapter.upsertTranscriptSpeakersAsParticipants(fixture.clubId, fixture.sessionId, listOf(fixture.turn))

        assertThat(first).isEqualTo(1)
        assertParticipant(fixture, 1)
        jdbc.update(
            "update session_participants set rsvp_status='DECLINED', attendance_status='ABSENT', participation_status='REMOVED' where session_id=?",
            fixture.sessionId.toString(),
        )

        val second = adapter.upsertTranscriptSpeakersAsParticipants(fixture.clubId, fixture.sessionId, listOf(fixture.turn))

        assertThat(second).isEqualTo(1)
        assertParticipant(fixture, 1)
    }

    @Test
    fun `upsert rejects inactive renamed and other club membership without participant writes`() {
        listOf("inactive", "renamed", "other-club").forEach { mode ->
            val fixture = fixture()
            when (mode) {
                "inactive" -> jdbc.update("update memberships set status='INACTIVE' where id=?", fixture.membershipId.toString())
                "renamed" -> jdbc.update("update memberships set short_name='바뀐이름' where id=?", fixture.membershipId.toString())
                else -> {
                    val otherClub = insertClub("other")
                    jdbc.update("update memberships set club_id=? where id=?", otherClub.toString(), fixture.membershipId.toString())
                }
            }

            assertThatThrownBy {
                adapter.upsertTranscriptSpeakersAsParticipants(fixture.clubId, fixture.sessionId, listOf(fixture.turn))
            }.isInstanceOf(AiGenerationMembershipChangedException::class.java)
            assertThat(countParticipants(fixture.sessionId)).isZero()
        }
    }

    @Test
    fun `upsert rejects forged distinct names for the same membership`() {
        val fixture = fixture()
        val forged = fixture.turn.copy(turnId = "turn-0002", speakerName = "다른이름")

        assertThatThrownBy {
            adapter.upsertTranscriptSpeakersAsParticipants(fixture.clubId, fixture.sessionId, listOf(fixture.turn, forged))
        }.isInstanceOf(AiGenerationMembershipChangedException::class.java)
        assertThat(countParticipants(fixture.sessionId)).isZero()
    }

    @Test
    fun `upsert ignores duplicate active display names that are not transcript speakers`() {
        val fixture = fixture()
        repeat(2) { index ->
            val userId = UUID.randomUUID()
            val membershipId = UUID.randomUUID()
            val rawName = if (index == 0) "무관동명이인" else " 무관동명이인"
            jdbc.update(
                "insert into users (id,email,name,short_name,auth_provider) values (?,?,?,?,'PASSWORD')",
                userId.toString(),
                "unrelated-$index-${userId.toString().take(8)}@example.com",
                rawName,
                rawName,
            )
            jdbc.update(
                "insert into memberships (id,club_id,user_id,role,status,short_name,joined_at) values (?,?,?,'MEMBER','ACTIVE',?,utc_timestamp(6))",
                membershipId.toString(),
                fixture.clubId.toString(),
                userId.toString(),
                rawName,
            )
        }

        assertThat(
            adapter.upsertTranscriptSpeakersAsParticipants(fixture.clubId, fixture.sessionId, listOf(fixture.turn)),
        ).isEqualTo(1)
        assertParticipant(fixture, 1)
    }

    @Test
    fun `receipt is content free and duplicate job revision is detectable`() {
        val fixture = fixture()
        val receipt =
            AiGenerationCommitReceipt(
                UUID.randomUUID(),
                7,
                fixture.sessionId,
                fixture.clubId,
                Instant.parse("2026-07-14T00:00:00Z"),
            )

        assertThat(adapter.insertReceipt(receipt)).isTrue()
        assertThat(adapter.insertReceipt(receipt)).isFalse()
        assertThat(adapter.findReceipt(receipt.jobId, receipt.revision)).isEqualTo(receipt)
        val columns =
            jdbc.queryForList(
                "select column_name from information_schema.columns where table_schema=database() and table_name='ai_generation_commit_receipts'",
                String::class.java,
            )
        assertThat(columns).containsExactlyInAnyOrder("id", "job_id", "revision", "session_id", "club_id", "committed_at")
    }

    @Test
    fun `transaction failure rolls back participant and receipt together`() {
        val fixture = fixture()
        val receipt =
            AiGenerationCommitReceipt(
                UUID.randomUUID(),
                9,
                fixture.sessionId,
                fixture.clubId,
                Instant.parse("2026-07-14T00:00:00Z"),
            )

        assertThatThrownBy {
            transactions.executeWithoutResult {
                adapter.upsertTranscriptSpeakersAsParticipants(
                    fixture.clubId,
                    fixture.sessionId,
                    listOf(fixture.turn),
                )
                check(adapter.insertReceipt(receipt))
                error("synthetic import failure")
            }
        }.isInstanceOf(IllegalStateException::class.java)

        assertThat(countParticipants(fixture.sessionId)).isZero()
        assertThat(adapter.findReceipt(receipt.jobId, receipt.revision)).isNull()
    }

    private fun assertParticipant(
        fixture: Fixture,
        expectedCount: Int,
    ) {
        assertThat(countParticipants(fixture.sessionId)).isEqualTo(expectedCount)
        val row = jdbc.queryForMap("select * from session_participants where session_id=?", fixture.sessionId.toString())
        assertThat(row["rsvp_status"]).isEqualTo("GOING")
        assertThat(row["attendance_status"]).isEqualTo("ATTENDED")
        assertThat(row["participation_status"]).isEqualTo("ACTIVE")
    }

    private fun countParticipants(sessionId: UUID): Int =
        jdbc.queryForObject("select count(*) from session_participants where session_id=?", Int::class.java, sessionId.toString()) ?: 0

    private fun fixture(): Fixture {
        val clubId = insertClub("club")
        val sessionId = UUID.randomUUID()
        jdbc.update(
            """
            insert into sessions (id, club_id, number, title, book_title, book_author, session_date, start_time, end_time,
              location_label, question_deadline_at, state)
            values (?, ?, 1, '공개 테스트', '공개 테스트', '공개 테스트', '2026-07-14', '19:00:00', '21:00:00',
              '공개 테스트', '2026-07-13 00:00:00', 'CLOSED')
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
        )
        val userId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        jdbc.update(
            "insert into users (id,email,name,short_name,auth_provider) values (?,?,?,?,'PASSWORD')",
            userId.toString(),
            "${userId.toString().take(10)}@example.com",
            "테스트회원",
            "테스트회원",
        )
        jdbc.update(
            "insert into memberships (id,club_id,user_id,role,status,short_name,joined_at) values (?,?,?,'MEMBER','ACTIVE',?,utc_timestamp(6))",
            membershipId.toString(),
            clubId.toString(),
            userId.toString(),
            "테스트회원",
        )
        return Fixture(
            clubId,
            sessionId,
            membershipId,
            ValidatedTranscriptTurn("turn-0001", "테스트회원", membershipId, 0, "공개 테스트 발언"),
        )
    }

    private fun insertClub(label: String): UUID {
        val id = UUID.randomUUID()
        jdbc.update(
            "insert into clubs (id,slug,name,tagline,about) values (?,?,'공개 테스트','공개 테스트','공개 테스트')",
            id.toString(),
            "aigen-commit-$label-${id.toString().take(8)}",
        )
        return id
    }

    private data class Fixture(
        val clubId: UUID,
        val sessionId: UUID,
        val membershipId: UUID,
        val turn: ValidatedTranscriptTurn,
    )
}
