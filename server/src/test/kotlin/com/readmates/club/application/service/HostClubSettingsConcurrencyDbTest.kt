package com.readmates.club.application.service

import com.readmates.club.application.model.HostClubSettingsException
import com.readmates.club.application.port.out.HostClubSettingsStorePort
import com.readmates.club.application.port.out.StoredHostClubClosePreview
import com.readmates.club.application.port.out.StoredHostClubSettings
import com.readmates.shared.security.ClubActor
import com.readmates.shared.security.ClubCapability
import com.readmates.support.ReadmatesDbIntegrationTest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@ReadmatesDbIntegrationTest
class HostClubSettingsConcurrencyDbTest(
    @param:Autowired private val jdbc: JdbcTemplate,
    @param:Autowired private val store: HostClubSettingsStorePort,
    @param:Autowired private val transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val actor =
        ClubActor(
            USER_ID,
            HOST_MEMBERSHIP_ID,
            CLUB_ID,
            CLUB_SLUG,
            setOf(ClubCapability.MANAGE_MEMBERS),
        )
    private val clock = Clock.fixed(Instant.parse("2026-08-30T00:00:00Z"), ZoneOffset.UTC)
    private val transaction = TransactionTemplate(transactionManager)

    @BeforeEach
    fun setUp() {
        cleanUp()
        jdbc.update(
            """
            insert into clubs (id, slug, name, tagline, about, status)
            values (?, ?, '동시성 독서방', '테스트', '테스트', 'ACTIVE')
            """.trimIndent(),
            CLUB_ID.toString(),
            CLUB_SLUG,
        )
        jdbc.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), '호스트', 'mushroom-green-book'),
                   (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), '멤버', 'lemon-green-book')
            """.trimIndent(),
            HOST_MEMBERSHIP_ID.toString(),
            CLUB_ID.toString(),
            USER_ID.toString(),
            MEMBER_MEMBERSHIP_ID.toString(),
            CLUB_ID.toString(),
            MEMBER_USER_ID.toString(),
        )
    }

    @AfterEach
    fun tearDown() = cleanUp()

    @Test
    fun `concurrent identical cohost command mutates once and replays the same receipt`() {
        val service = HostClubSettingsService(GatedLockStore(store, clubLocks = 2), clock)

        val results =
            runConcurrently {
                inTransaction {
                    service.promoteCoHost(actor, MEMBER_MEMBERSHIP_ID, 0, "cohost-concurrent")
                }
            }

        assertThat(results.map { it.receipt.receiptId }.distinct()).hasSize(1)
        assertThat(results.map { it.receipt.replayed }.sorted()).containsExactly(false, true)
        assertThat(results.map { it.revision }.distinct()).containsExactly(1)
        assertThat(role(MEMBER_MEMBERSHIP_ID)).isEqualTo("HOST")
        assertThat(count("host_club_settings_history")).isEqualTo(1)
        assertThat(count("host_club_command_receipts")).isEqualTo(1)

        assertThatThrownBy {
            inTransaction {
                service.demoteCoHost(actor, MEMBER_MEMBERSHIP_ID, 1, "cohost-concurrent")
            }
        }.isInstanceOf(HostClubSettingsException::class.java)
            .extracting("code")
            .isEqualTo("HOST_SETTINGS_IDEMPOTENCY_CONFLICT")
        assertThat(role(MEMBER_MEMBERSHIP_ID)).isEqualTo("HOST")
        assertThat(count("host_club_settings_history")).isEqualTo(1)
    }

    @Test
    fun `concurrent identical club end confirmation archives once and replays the same receipt`() {
        val regularService = HostClubSettingsService(store, clock)
        val preview = inTransaction { regularService.previewClubEnd(actor) }
        val service = HostClubSettingsService(GatedLockStore(store, previewLocks = 2), clock)

        val results =
            runConcurrently {
                inTransaction {
                    service.confirmClubEnd(actor, preview.previewId, preview.effectHash, "close-concurrent")
                }
            }

        assertThat(results.map { it.receiptId }.distinct()).hasSize(1)
        assertThat(results.map { it.replayed }.sorted()).containsExactly(false, true)
        assertThat(results.map { it.revision }.distinct()).containsExactly(1)
        assertThat(status()).isEqualTo("ARCHIVED")
        assertThat(count("host_club_settings_history")).isEqualTo(1)
        assertThat(count("host_club_command_receipts")).isEqualTo(1)
    }

    private fun <T> runConcurrently(action: () -> T): List<T> {
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        return try {
            val futures =
                (1..2).map {
                    executor.submit<T> {
                        ready.countDown()
                        check(start.await(5, TimeUnit.SECONDS)) { "Timed out waiting to start commands" }
                        action()
                    }
                }
            check(ready.await(5, TimeUnit.SECONDS)) { "Timed out waiting for command workers" }
            start.countDown()
            futures.map { it.get(10, TimeUnit.SECONDS) }
        } finally {
            executor.shutdownNow()
        }
    }

    private fun <T> inTransaction(action: () -> T): T = requireNotNull(transaction.execute { action() })

    private fun role(membershipId: UUID): String =
        requireNotNull(
            jdbc.queryForObject(
                "select role from memberships where id = ?",
                String::class.java,
                membershipId.toString(),
            ),
        )

    private fun status(): String =
        requireNotNull(
            jdbc.queryForObject(
                "select status from clubs where id = ?",
                String::class.java,
                CLUB_ID.toString(),
            ),
        )

    private fun count(table: String): Int =
        requireNotNull(
            jdbc.queryForObject(
                "select count(*) from $table where club_id = ?",
                Int::class.java,
                CLUB_ID.toString(),
            ),
        )

    private fun cleanUp() {
        jdbc.update("delete from host_club_close_previews where club_id = ?", CLUB_ID.toString())
        jdbc.update("delete from host_club_command_receipts where club_id = ?", CLUB_ID.toString())
        jdbc.update("delete from host_club_settings_history where club_id = ?", CLUB_ID.toString())
        jdbc.update("delete from memberships where club_id = ?", CLUB_ID.toString())
        jdbc.update("delete from clubs where id = ?", CLUB_ID.toString())
    }

    private class GatedLockStore(
        private val delegate: HostClubSettingsStorePort,
        clubLocks: Int = 0,
        previewLocks: Int = 0,
    ) : HostClubSettingsStorePort by delegate {
        private val clubGate = LockGate(clubLocks)
        private val previewGate = LockGate(previewLocks)

        override fun load(
            clubId: UUID,
            forUpdate: Boolean,
        ): StoredHostClubSettings? {
            if (forUpdate) clubGate.await()
            return delegate.load(clubId, forUpdate)
        }

        override fun loadClosePreview(
            previewId: UUID,
            forUpdate: Boolean,
        ): StoredHostClubClosePreview? {
            if (forUpdate) previewGate.await()
            return delegate.loadClosePreview(previewId, forUpdate)
        }
    }

    private class LockGate(
        parties: Int,
    ) {
        private val arrivals = CountDownLatch(parties)
        private val release = CountDownLatch(if (parties == 0) 0 else 1)

        fun await() {
            if (arrivals.count == 0L) return
            arrivals.countDown()
            if (arrivals.count == 0L) release.countDown()
            check(release.await(5, TimeUnit.SECONDS)) { "Timed out waiting before database lock" }
        }
    }

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("98000000-0000-0000-0000-000000000001")
        val USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        val MEMBER_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000102")
        val HOST_MEMBERSHIP_ID: UUID = UUID.fromString("98000000-0000-0000-0000-000000000201")
        val MEMBER_MEMBERSHIP_ID: UUID = UUID.fromString("98000000-0000-0000-0000-000000000202")
        const val CLUB_SLUG = "host-settings-concurrency"
    }
}
