package com.readmates.publication.api

import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class PublicProjectionGenerationIntegrationTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `authoritative generation row records current origin state`() {
        val sessionId = UUID.randomUUID()
        val publicationId = UUID.randomUUID()
        try {
            insertSyntheticPublishedSession(sessionId, publicationId)
            jdbcTemplate.update(
                """
                insert into public_projection_generations (
                  publication_id, club_id, session_id, generation, live_record_revision, origin_readable
                ) values (?, ?, ?, 2, 1, true)
                """.trimIndent(),
                publicationId.toString(),
                BASELINE_CLUB_ID.toString(),
                sessionId.toString(),
            )

            val row =
                jdbcTemplate.queryForMap(
                    """
                    select generation, live_record_revision, origin_readable
                    from public_projection_generations
                    where session_id = ?
                    """.trimIndent(),
                    sessionId.toString(),
                )

            assertThat((row["generation"] as Number).toLong()).isEqualTo(2L)
            assertThat((row["live_record_revision"] as Number).toLong()).isEqualTo(1L)
            assertThat(row["origin_readable"]).isEqualTo(true)
        } finally {
            jdbcTemplate.update("delete from public_session_publications where id = ?", publicationId.toString())
            jdbcTemplate.update("delete from session_publication_versions where session_id = ?", sessionId.toString())
            jdbcTemplate.update("delete from sessions where id = ?", sessionId.toString())
        }
    }

    @Test
    fun `receipt and provider attempt events are append only and current status uses deterministic event order`() {
        val publicationId = publicationId(BASELINE_SESSION_ID)
        val receiptId = UUID.randomUUID()
        val convergenceId = UUID.randomUUID()
        insertReceipt(receiptId, convergenceId, publicationId, BASELINE_SESSION_ID, 2)
        insertWork(convergenceId)

        insertEvent(convergenceId, publicationId, BASELINE_SESSION_ID, 1, 0, "PENDING", null)
        insertEvent(convergenceId, publicationId, BASELINE_SESSION_ID, 1, 1, "FAILED", "TRANSIENT")
        insertEvent(convergenceId, publicationId, BASELINE_SESSION_ID, 2, 0, "PENDING", null)
        insertEvent(convergenceId, publicationId, BASELINE_SESSION_ID, 2, 1, "SUCCEEDED", "PURGED")

        val current =
            jdbcTemplate.queryForMap(
                """
                select attempt_no, event_seq, status, result_category
                from public_convergence_current
                where convergence_id = ?
                """.trimIndent(),
                convergenceId.toString(),
            )
        assertThat(current).containsEntry("attempt_no", 2).containsEntry("event_seq", 1)
        assertThat(current).containsEntry("status", "SUCCEEDED").containsEntry("result_category", "PURGED")

        assertThat(PublicConvergencePort::class.java.methods.map { it.name })
            .noneMatch { it.contains("update", ignoreCase = true) || it.contains("delete", ignoreCase = true) }
        assertThatThrownBy {
            insertReceipt(receiptId, UUID.randomUUID(), publicationId, BASELINE_SESSION_ID, 3)
        }.isInstanceOf(DataAccessException::class.java)
        assertThatThrownBy {
            insertEvent(convergenceId, publicationId, BASELINE_SESSION_ID, 2, 1, "SUCCEEDED", "PURGED")
        }.isInstanceOf(DataAccessException::class.java)
        assertThatThrownBy {
            insertEvent(convergenceId, publicationId, BASELINE_SESSION_ID, 3, 1, "PENDING", null)
        }.isInstanceOf(DataAccessException::class.java)
    }

    @Test
    fun `hard delete removes operational projection rows while redacted immutable evidence remains`() {
        val sessionId = UUID.randomUUID()
        val publicationId = UUID.randomUUID()
        val receiptId = UUID.randomUUID()
        val convergenceId = UUID.randomUUID()
        insertSyntheticPublishedSession(sessionId, publicationId)
        jdbcTemplate.update(
            """
            insert into public_projection_generations (
              publication_id, club_id, session_id, generation, live_record_revision, origin_readable
            ) values (?, ?, ?, 1, 1, true)
            """.trimIndent(),
            publicationId.toString(),
            BASELINE_CLUB_ID.toString(),
            sessionId.toString(),
        )
        insertReceipt(receiptId, convergenceId, publicationId, sessionId, 1)
        insertWork(convergenceId)
        insertEvent(convergenceId, publicationId, sessionId, 1, 0, "PENDING", null)
        insertEvent(convergenceId, publicationId, sessionId, 1, 1, "SUCCEEDED", "PURGED")

        jdbcTemplate.update("delete from public_session_publications where id = ?", publicationId.toString())
        jdbcTemplate.update("delete from session_publication_versions where session_id = ?", sessionId.toString())
        jdbcTemplate.update("delete from sessions where id = ?", sessionId.toString())

        assertThat(count("public_projection_generations", "publication_id", publicationId)).isZero()
        assertThat(count("public_convergence_work", "convergence_id", convergenceId)).isOne()
        assertThat(count("public_mutation_convergence_receipts", "mutation_receipt_id", receiptId)).isOne()
        assertThat(count("public_convergence_events", "convergence_id", convergenceId)).isEqualTo(2)
        assertThat(
            jdbcTemplate.queryForObject(
                """
                select publication_id_snapshot
                from public_mutation_convergence_receipts
                where mutation_receipt_id = ?
                """.trimIndent(),
                String::class.java,
                receiptId.toString(),
            ),
        ).isEqualTo(publicationId.toString())
    }

    private fun publicationId(sessionId: UUID): UUID =
        UUID.fromString(
            jdbcTemplate.queryForObject(
                "select id from public_session_publications where session_id = ?",
                String::class.java,
                sessionId.toString(),
            ),
        )

    private fun insertReceipt(
        receiptId: UUID,
        convergenceId: UUID,
        publicationId: UUID,
        sessionId: UUID,
        generation: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_receipts (
              mutation_receipt_id, convergence_id, publication_id_snapshot,
              session_id_snapshot, committed_generation, origin_readable
            ) values (?, ?, ?, ?, ?, true)
            """.trimIndent(),
            receiptId.toString(),
            convergenceId.toString(),
            publicationId.toString(),
            sessionId.toString(),
            generation,
        )
    }

    private fun insertWork(convergenceId: UUID) {
        jdbcTemplate.update(
            """
            insert into public_convergence_work (convergence_id, next_attempt_no, available_at)
            values (?, 1, utc_timestamp(6))
            """.trimIndent(),
            convergenceId.toString(),
        )
    }

    private fun insertEvent(
        convergenceId: UUID,
        publicationId: UUID,
        sessionId: UUID,
        attemptNo: Int,
        eventSeq: Int,
        status: String,
        category: String?,
    ) {
        jdbcTemplate.update(
            """
            insert into public_convergence_events (
              convergence_id, publication_id_snapshot, session_id_snapshot,
              attempt_no, event_seq, status, observed_at, result_category
            ) values (?, ?, ?, ?, ?, ?, '2026-08-22 12:00:00.000000', ?)
            """.trimIndent(),
            convergenceId.toString(),
            publicationId.toString(),
            sessionId.toString(),
            attemptNo,
            eventSeq,
            status,
            category,
        )
    }

    private fun insertSyntheticPublishedSession(
        sessionId: UUID,
        publicationId: UUID,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility, access_scope
            ) values (?, ?, 9951, 'Synthetic expired meeting', 'Synthetic book', 'Example Author',
                      '2026-08-01', '20:00:00', '22:00:00', '온라인', '2026-07-31 12:00:00.000000',
                      'PUBLISHED', 'PUBLIC', 'GUEST_READABLE')
            """.trimIndent(),
            sessionId.toString(),
            BASELINE_CLUB_ID.toString(),
        )
        jdbcTemplate.update(
            "insert into session_publication_versions (session_id, publication_revision) values (?, 1)",
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, published_at,
              visibility, site_visibility
            ) values (?, ?, ?, 'Synthetic public summary', true, utc_timestamp(6), 'PUBLIC', 'PUBLIC_RECORD')
            """.trimIndent(),
            publicationId.toString(),
            BASELINE_CLUB_ID.toString(),
            sessionId.toString(),
        )
    }

    private fun count(
        table: String,
        column: String,
        value: UUID,
    ): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from $table where $column = ?",
            Int::class.java,
            value.toString(),
        ) ?: 0

    companion object {
        private val BASELINE_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        private val BASELINE_SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000306")
    }
}
