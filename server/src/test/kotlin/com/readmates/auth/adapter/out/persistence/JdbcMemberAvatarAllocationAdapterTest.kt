package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberAvatarRandomIndexPort
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
import org.mockito.ArgumentMatchers.anyInt
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import org.mockito.Mockito.`when` as whenever

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcMemberAvatarAllocationAdapterTest(
    @Autowired private val adapter: JdbcMemberAvatarAllocationAdapter,
    @Autowired private val jdbcTemplate: JdbcTemplate,
    @Autowired transactionManager: PlatformTransactionManager,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val transactionTemplate = TransactionTemplate(transactionManager)
    private lateinit var executor: ExecutorService

    @MockitoBean
    private lateinit var randomIndex: MemberAvatarRandomIndexPort

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
        whenever(randomIndex.nextIndex(anyInt())).thenReturn(0)
    }

    @AfterEach
    fun tearDown() {
        executor.shutdownNow()
        cleanup()
    }

    @Test
    fun `allocates randomized unused avatar keys`() {
        whenever(randomIndex.nextIndex(anyInt())).thenReturn(1, 0, 0)

        val first = adapter.allocate(CLUB_ID)
        persistMembership(userId = userId(0), status = MembershipStatus.ACTIVE, avatarKey = first)
        val second = adapter.allocate(CLUB_ID)

        assertThat(first).isEqualTo(BookClubAvatarKey.SQUIRREL_ACORN)
        assertThat(second).isEqualTo(BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)
        assertThat(second).isNotEqualTo(first)
    }

    @Test
    fun `first forty visible memberships receive every avatar key regardless of selection order`() {
        whenever(randomIndex.nextIndex(anyInt())).thenAnswer { invocation -> invocation.getArgument<Int>(0) - 1 }

        val assigned =
            (0 until 40).map { index ->
                val key = adapter.allocate(CLUB_ID)
                persistMembership(userId = userId(index), status = MembershipStatus.ACTIVE, avatarKey = key)
                key
            }

        assertThat(assigned).containsExactlyInAnyOrderElementsOf(BookClubAvatarKey.ordered)
        assertThat(assigned.distinct()).hasSize(BookClubAvatarKey.ordered.size)
    }

    @Test
    fun `exhaustion selects from all forty avatar keys`() {
        val assigned =
            (0 until AVATAR_KEY_COUNT).map { index ->
                val key = adapter.allocate(CLUB_ID)
                persistMembership(userId = userId(index), status = MembershipStatus.ACTIVE, avatarKey = key)
                key
            }

        val fortyFirst = adapter.allocate(CLUB_ID)

        assertThat(assigned).containsExactlyInAnyOrderElementsOf(BookClubAvatarKey.ordered)
        verify(randomIndex, times(2)).nextIndex(AVATAR_KEY_COUNT)
        assertThat(fortyFirst).isEqualTo(BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)
    }

    @Test
    fun `left and inactive memberships do not reserve their keys`() {
        listOf(
            MembershipStatus.INVITED,
            MembershipStatus.VIEWER,
            MembershipStatus.ACTIVE,
            MembershipStatus.SUSPENDED,
        ).forEachIndexed { index, status ->
            persistMembership(userId(index), status, BookClubAvatarKey.ordered[index])
        }
        persistMembership(userId(10), MembershipStatus.LEFT, BookClubAvatarKey.POLAR_BEAR_SNOWFLAKE_MUG)
        persistMembership(userId(11), MembershipStatus.INACTIVE, BookClubAvatarKey.PENGUIN_BERET_BOOK)
        whenever(randomIndex.nextIndex(anyInt())).thenReturn(2)

        assertThat(adapter.allocate(CLUB_ID)).isEqualTo(BookClubAvatarKey.PENGUIN_BERET_BOOK)
    }

    @Test
    fun `left membership frees its key and rejoin retains a free previous key`() {
        persistMembership(REJOINING_USER_ID, MembershipStatus.LEFT, BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)

        assertThat(adapter.allocate(CLUB_ID, REJOINING_USER_ID)).isEqualTo(BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)
    }

    @Test
    fun `rejoining member retains a valid previous key even when it is already used`() {
        persistMembership(REJOINING_USER_ID, MembershipStatus.LEFT, BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)
        persistMembership(OTHER_USER_ID, MembershipStatus.ACTIVE, BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)

        assertThat(adapter.allocate(CLUB_ID, REJOINING_USER_ID)).isEqualTo(BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)
        verifyNoInteractions(randomIndex)
    }

    @Test
    fun `club slug allocation resolves the exact club and missing clubs fail`() {
        assertThat(adapter.allocateForClubSlug(CLUB_SLUG)).isEqualTo(BookClubAvatarKey.HEDGEHOG_GREEN_BOOK)
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

        assertThat(results).hasSize(2).doesNotHaveDuplicates()
        assertThat(results).allMatch { it in BookClubAvatarKey.ordered }
    }

    @Test
    fun `parallel allocations read current memberships after repeatable read snapshots exist`() {
        val snapshotsReady = CountDownLatch(2)
        val startAllocations = CountDownLatch(1)
        val results = ConcurrentLinkedQueue<BookClubAvatarKey>()
        val futures =
            listOf(FIRST_USER_ID, SECOND_USER_ID).map { userId ->
                executor.submit {
                    transactionTemplate.executeWithoutResult {
                        jdbcTemplate.queryForObject(
                            "select count(*) from memberships where club_id = ?",
                            Int::class.java,
                            CLUB_ID.dbString(),
                        )
                        snapshotsReady.countDown()
                        check(startAllocations.await(5, TimeUnit.SECONDS))

                        val key = adapter.allocate(CLUB_ID, userId)
                        persistMembership(userId, MembershipStatus.ACTIVE, key)
                        results += key
                    }
                }
            }

        check(snapshotsReady.await(5, TimeUnit.SECONDS))
        startAllocations.countDown()
        futures.forEach { it.get(10, TimeUnit.SECONDS) }

        assertThat(results).hasSize(2).doesNotHaveDuplicates()
        assertThat(results).allMatch { it in BookClubAvatarKey.ordered }
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
        const val AVATAR_KEY_COUNT = 40
        val CLUB_ID: UUID = UUID.fromString("10000000-0000-0000-0000-000000000001")
        const val CLUB_SLUG = "avatar-allocation-test"
        val REJOINING_USER_ID: UUID = UUID(0, 1_001)
        val OTHER_USER_ID: UUID = UUID(0, 1_002)
        val FIRST_USER_ID: UUID = UUID(0, 2_001)
        val SECOND_USER_ID: UUID = UUID(0, 2_002)
    }
}
