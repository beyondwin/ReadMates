package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.db.dbString
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcMemberAvatarAllocationAdapterTest(
    @param:Autowired private val adapter: JdbcMemberAvatarAllocationAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val transactionTemplate = TransactionTemplate(transactionManager)
    private lateinit var executor: ExecutorService

    @BeforeEach
    fun setUp() {
        cleanup()
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about)
            values (?, ?, 'Avatar allocation test club', 'Allocator', 'Stable avatar allocation tests')
            """.trimIndent(),
            CLUB_ID.dbString(),
            CLUB_SLUG,
        )
        executor = Executors.newFixedThreadPool(2)
    }

    @AfterEach
    fun tearDown() {
        executor.shutdownNow()
        cleanup()
    }

    @Test
    fun `first twenty visible memberships receive distinct ordered keys then cycle`() {
        val assigned =
            (0 until 21).map { index ->
                val key = adapter.allocate(CLUB_ID)
                persistMembership(userId = userId(index), status = MembershipStatus.ACTIVE, avatarKey = key)
                key
            }

        assertThat(assigned.take(20)).containsExactlyElementsOf(BookClubAvatarKey.ordered)
        assertThat(assigned.take(20).distinct()).hasSize(20)
        assertThat(assigned[20]).isEqualTo(BookClubAvatarKey.READING_LAMP)
    }

    @Test
    fun `invited viewer active and suspended memberships reserve their keys`() {
        listOf(
            MembershipStatus.INVITED,
            MembershipStatus.VIEWER,
            MembershipStatus.ACTIVE,
            MembershipStatus.SUSPENDED,
        ).forEachIndexed { index, status ->
            persistMembership(userId(index), status, BookClubAvatarKey.ordered[index])
        }
        persistMembership(userId(10), MembershipStatus.LEFT, BookClubAvatarKey.NOTEBOOK_PEN)
        persistMembership(userId(11), MembershipStatus.INACTIVE, BookClubAvatarKey.LIBRARY_STAMP)

        assertThat(adapter.allocate(CLUB_ID)).isEqualTo(BookClubAvatarKey.NOTEBOOK_PEN)
    }

    @Test
    fun `left membership frees its key and rejoin retains a free previous key`() {
        persistMembership(REJOINING_USER_ID, MembershipStatus.LEFT, BookClubAvatarKey.READING_LAMP)

        assertThat(adapter.allocate(CLUB_ID, REJOINING_USER_ID)).isEqualTo(BookClubAvatarKey.READING_LAMP)
    }

    @Test
    fun `rejoin chooses first unused key when previous key is occupied`() {
        persistMembership(REJOINING_USER_ID, MembershipStatus.LEFT, BookClubAvatarKey.READING_LAMP)
        persistMembership(OTHER_USER_ID, MembershipStatus.ACTIVE, BookClubAvatarKey.READING_LAMP)

        assertThat(adapter.allocate(CLUB_ID, REJOINING_USER_ID)).isEqualTo(BookClubAvatarKey.OPEN_BOOK_PENCIL)
    }

    @Test
    fun `club slug allocation resolves the exact club and missing clubs fail`() {
        assertThat(adapter.allocateForClubSlug(CLUB_SLUG)).isEqualTo(BookClubAvatarKey.READING_LAMP)
        assertThatThrownBy { adapter.allocateForClubSlug("missing-avatar-club") }
            .isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `parallel allocations serialize on the club row`() {
        val start = CountDownLatch(1)
        val results = ConcurrentLinkedQueue<BookClubAvatarKey>()
        val futures =
            listOf(FIRST_USER_ID, SECOND_USER_ID).map { userId ->
                executor.submit {
                    start.await(5, TimeUnit.SECONDS)
                    transactionTemplate.executeWithoutResult {
                        val key = adapter.allocate(CLUB_ID, userId)
                        persistMembership(userId, MembershipStatus.ACTIVE, key)
                        results += key
                    }
                }
            }

        start.countDown()
        futures.forEach { it.get(10, TimeUnit.SECONDS) }

        assertThat(results).containsExactlyInAnyOrder(
            BookClubAvatarKey.READING_LAMP,
            BookClubAvatarKey.OPEN_BOOK_PENCIL,
        )
    }

    private fun persistMembership(
        userId: UUID,
        status: MembershipStatus,
        avatarKey: BookClubAvatarKey,
    ) {
        val shortName = "Avatar-${userId.toString().takeLast(8)}"
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, ?, ?, 'Avatar test member', ?, 'GOOGLE')
            """.trimIndent(),
            userId.dbString(),
            "avatar-allocation-$userId",
            "avatar-allocation-$userId@example.com",
            shortName,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, ?, ?, 'MEMBER', ?, utc_timestamp(6), ?, ?)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            CLUB_ID.dbString(),
            userId.dbString(),
            status.name,
            shortName,
            avatarKey.wireValue,
        )
    }

    private fun cleanup() {
        jdbcTemplate.update("delete from memberships where club_id = ?", CLUB_ID.dbString())
        jdbcTemplate.update("delete from users where email like 'avatar-allocation-%@example.com'")
        jdbcTemplate.update("delete from clubs where id = ?", CLUB_ID.dbString())
    }

    private fun userId(index: Int): UUID = UUID(0, (index + 1).toLong())

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("10000000-0000-0000-0000-000000000001")
        const val CLUB_SLUG = "avatar-allocation-test"
        val REJOINING_USER_ID: UUID = UUID(0, 1_001)
        val OTHER_USER_ID: UUID = UUID(0, 1_002)
        val FIRST_USER_ID: UUID = UUID(0, 2_001)
        val SECOND_USER_ID: UUID = UUID(0, 2_002)
    }
}
