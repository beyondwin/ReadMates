package com.readmates.publication.api

import com.readmates.auth.adapter.out.persistence.JdbcAuthPublicProjectionMutationAdapter
import com.readmates.auth.application.port.out.AuthPublicProjectionLock
import com.readmates.auth.application.port.out.AuthPublicProjectionMutation
import com.readmates.club.adapter.out.persistence.JdbcClubPublicProjectionMutationAdapter
import com.readmates.club.application.port.out.ClubPublicProjectionLock
import com.readmates.club.application.port.out.ClubPublicProjectionMutation
import com.readmates.support.ReadmatesDbIntegrationTest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

@ReadmatesDbIntegrationTest
class PublicProjectionLockCapabilityIntegrationTest(
    @Autowired private val authProjection: JdbcAuthPublicProjectionMutationAdapter,
    @Autowired private val clubProjection: JdbcClubPublicProjectionMutationAdapter,
    @Autowired private val jdbcTemplate: JdbcTemplate,
    @Autowired transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val transactions = TransactionTemplate(transactionManager)
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")
    private val subjectMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000202")

    @Test
    fun `jdbc adapters reject forged public lock handles`() {
        transactions.executeWithoutResult {
            assertThatThrownBy {
                authProjection.record(ForgedAuthLock, noSessionAuthMutation())
            }.isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("not issued by JDBC")
            assertThatThrownBy {
                clubProjection.record(exposureMutation(ForgedClubLock))
            }.isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("not issued by JDBC")
            it.setRollbackOnly()
        }
    }

    @Test
    fun `auth lock rejects wrong club cross transaction and double use`() {
        transactions.executeWithoutResult {
            val wrongClubLock = authProjection.lockPotentiallyAffectedSessions(clubId)
            assertThatThrownBy {
                authProjection.record(
                    wrongClubLock,
                    noSessionAuthMutation().copy(clubId = UUID.fromString("00000000-0000-0000-0000-000000000002")),
                )
            }.hasMessageContaining("another club")

            val usedLock = authProjection.lockPotentiallyAffectedSessions(clubId)
            assertThat(authProjection.record(usedLock, noSessionAuthMutation())).isZero()
            assertThatThrownBy {
                authProjection.record(usedLock, noSessionAuthMutation())
            }.hasMessageContaining("already consumed")
            it.setRollbackOnly()
        }

        lateinit var priorTransactionLock: AuthPublicProjectionLock
        transactions.executeWithoutResult {
            priorTransactionLock = authProjection.lockPotentiallyAffectedSessions(clubId)
        }
        transactions.executeWithoutResult {
            assertThatThrownBy {
                authProjection.record(priorTransactionLock, noSessionAuthMutation())
            }.hasMessageContaining("another transaction")
            it.setRollbackOnly()
        }
    }

    @Test
    fun `club lock rejects public target added after lock and remains one shot transaction bound`() {
        val driftSessionId = UUID.randomUUID()
        lateinit var priorTransactionLock: ClubPublicProjectionLock
        transactions.executeWithoutResult { status ->
            val linkCountBefore = publicLinkCount()
            val lock = clubProjection.lockForExposure(clubId)
            insertPublicSession(driftSessionId)

            assertThatThrownBy {
                clubProjection.record(exposureMutation(lock))
            }.isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("target set changed")
            assertThat(
                jdbcTemplate.queryForObject(
                    "select count(*) from public_projection_current where session_id = ?",
                    Int::class.java,
                    driftSessionId.toString(),
                ),
            ).isZero()
            assertThat(publicLinkCount()).isEqualTo(linkCountBefore)
            assertThatThrownBy {
                clubProjection.record(exposureMutation(lock))
            }.hasMessageContaining("already consumed")
            status.setRollbackOnly()
        }

        transactions.executeWithoutResult {
            priorTransactionLock = clubProjection.lockForExposure(clubId)
        }
        transactions.executeWithoutResult {
            assertThatThrownBy {
                clubProjection.record(exposureMutation(priorTransactionLock))
            }.hasMessageContaining("another transaction")
            it.setRollbackOnly()
        }
    }

    @Test
    fun `auth lock rejects public target added after lock without convergence writes`() {
        val driftSessionId = UUID.randomUUID()
        transactions.executeWithoutResult { status ->
            val linkCountBefore = publicLinkCount()
            val lock = authProjection.lockPotentiallyAffectedSessions(clubId)
            insertPublicSession(driftSessionId)

            assertThatThrownBy {
                authProjection.record(lock, noSessionAuthMutation())
            }.isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("target set changed")
            assertThat(publicLinkCount()).isEqualTo(linkCountBefore)
            assertThatThrownBy {
                authProjection.record(lock, noSessionAuthMutation())
            }.hasMessageContaining("already consumed")
            status.setRollbackOnly()
        }
    }

    @Test
    fun `club lock rejects projection identity drift after lock`() {
        transactions.executeWithoutResult { status ->
            val linkCountBefore = publicLinkCount()
            val sessionId =
                checkNotNull(
                    jdbcTemplate.queryForObject(
                        """
                        select sessions.id
                        from sessions
                        join public_session_publications publications
                          on publications.club_id = sessions.club_id and publications.session_id = sessions.id
                        where sessions.club_id = ? and publications.site_visibility = 'PUBLIC_RECORD'
                        order by sessions.id
                        limit 1
                        """.trimIndent(),
                        String::class.java,
                        clubId.toString(),
                    ),
                )
            val lock = clubProjection.lockForExposure(clubId)
            jdbcTemplate.update(
                "delete from public_projection_generations where session_id = ?",
                sessionId,
            )
            jdbcTemplate.update(
                "update public_session_publications set id = ? where session_id = ?",
                UUID.randomUUID().toString(),
                sessionId,
            )

            assertThatThrownBy {
                clubProjection.record(exposureMutation(lock))
            }.isInstanceOf(IllegalArgumentException::class.java)
                .hasMessageContaining("target identity changed")
            assertThat(publicLinkCount()).isEqualTo(linkCountBefore)
            status.setRollbackOnly()
        }
    }

    @Test
    fun `club lock consumes the exact unchanged target once`() {
        transactions.executeWithoutResult { status ->
            val linkCountBefore = publicLinkCount()
            val lock = clubProjection.lockForExposure(clubId)

            val recorded = clubProjection.record(exposureMutation(lock))

            assertThat(recorded).isGreaterThan(0)
            assertThat(publicLinkCount() - linkCountBefore).isEqualTo(recorded)
            assertThatThrownBy {
                clubProjection.record(exposureMutation(lock))
            }.hasMessageContaining("already consumed")
            status.setRollbackOnly()
        }
    }

    @Test
    fun `application lock contracts expose no forgeable state`() {
        assertThat(AuthPublicProjectionLock::class.java.declaredMethods).isEmpty()
        assertThat(ClubPublicProjectionLock::class.java.declaredMethods).isEmpty()
        assertThat(AuthPublicProjectionLock::class.java.isInterface).isTrue()
        assertThat(ClubPublicProjectionLock::class.java.isInterface).isTrue()
    }

    private fun noSessionAuthMutation() =
        AuthPublicProjectionMutation(
            clubId = clubId,
            actorMembershipId = null,
            subjectMembershipId = subjectMembershipId,
            operation = "TEST_NO_PUBLIC_EFFECT",
            includeSubjectPublicContent = false,
        )

    private fun exposureMutation(lock: ClubPublicProjectionLock) =
        ClubPublicProjectionMutation(
            clubId = clubId,
            actorUserId = null,
            operation = "TEST_EXPOSURE_EFFECT",
            exposureChanged = true,
            exposureLock = lock,
        )

    private fun insertPublicSession(sessionId: UUID) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at,
              state, visibility, access_scope
            ) values (?, ?, 987654, 'Drift session', 'Drift book', 'Example Author', '2026-10-01',
                      '19:00:00', '21:00:00', 'Online', '2026-09-30 14:59:00',
                      'PUBLISHED', 'PUBLIC', 'GUEST_READABLE')
            """.trimIndent(),
            sessionId.toString(),
            clubId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, published_at, visibility, site_visibility
            ) values (?, ?, ?, 'Drift-safe summary', true, utc_timestamp(6), 'PUBLIC', 'PUBLIC_RECORD')
            """.trimIndent(),
            UUID.randomUUID().toString(),
            clubId.toString(),
            sessionId.toString(),
        )
    }

    private fun publicLinkCount(): Int =
        checkNotNull(
            jdbcTemplate.queryForObject(
                "select count(*) from public_mutation_convergence_links where club_id_snapshot = ?",
                Int::class.java,
                clubId.toString(),
            ),
        )

    private data object ForgedAuthLock : AuthPublicProjectionLock

    private data object ForgedClubLock : ClubPublicProjectionLock
}
