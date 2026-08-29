package com.readmates.auth.api

import com.readmates.auth.application.port.out.ClubAccessPort
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.put
import java.sql.Timestamp
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(
    statements = [
        "delete from membership_club_access where membership_id in " +
            "('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000206')",
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [
        "delete from membership_club_access where membership_id in " +
            "('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000206')",
    ],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
@Tag("integration")
class ClubAccessDbTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val clubAccessPort: ClubAccessPort,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdSupportGrantIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        createdSupportGrantIds.forEach { id ->
            jdbcTemplate.update("delete from support_access_grants where id = ?", id)
        }
        createdMembershipIds.forEach { id ->
            jdbcTemplate.update("delete from memberships where id = ?", id)
        }
        createdUserIds.forEach { id ->
            jdbcTemplate.update("delete from users where id = ?", id)
        }
    }

    @Test
    fun `active member touch stores only coarse club access without changing membership or schedule seen`() {
        val membershipUpdatedAt = membershipUpdatedAt()
        val scheduleSeenBefore = scheduleSeenSnapshot()

        mockMvc
            .put("/api/me/club-access") {
                with(user("member5@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("X-Readmates-Club-Slug", "reading-sai")
                header("Origin", "http://localhost:3000")
            }.andExpect {
                status { isOk() }
                jsonPath("$.lastClubAccessAt") { isNotEmpty() }
                jsonPath("$.membershipId") { doesNotExist() }
                jsonPath("$.clubId") { doesNotExist() }
                jsonPath("$.route") { doesNotExist() }
                jsonPath("$.action") { doesNotExist() }
            }

        assertNotNull(lastClubAccessAt())
        assertEquals(membershipUpdatedAt, membershipUpdatedAt())
        assertEquals(scheduleSeenBefore, scheduleSeenSnapshot())
    }

    @Test
    fun `active host touch stores the host membership fact`() {
        performTouch("host@example.com").andExpect {
            status { isOk() }
            jsonPath("$.lastClubAccessAt") { isNotEmpty() }
        }

        assertNotNull(lastClubAccessAt("00000000-0000-0000-0000-000000000201"))
    }

    @ParameterizedTest
    @ValueSource(strings = ["VIEWER", "SUSPENDED"])
    fun `member app readable memberships can record coarse access`(status: String) {
        val member = insertMember(status)

        performTouch(member.email).andExpect {
            status { isOk() }
        }

        assertNotNull(lastClubAccessAt(member.membershipId))
    }

    @Test
    fun `cross club identity cannot create an access fact`() {
        mockMvc
            .put("/api/me/club-access") {
                with(user("member5@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("X-Readmates-Club-Slug", "sample-book-club")
                header("Origin", "http://localhost:3000")
            }.andExpect {
                status { is4xxClientError() }
            }

        assertEquals(0, accessRowCount("00000000-0000-0000-0000-000000000206"))
    }

    @Test
    fun `support synthesized host identity cannot create a membership access fact`() {
        val grantId = insertSupportGrant()

        mockMvc
            .put("/api/me/club-access") {
                with(user("admin-support@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
                header("X-Readmates-Club-Slug", "reading-sai")
                header("Origin", "http://localhost:3000")
            }.andExpect {
                status { is4xxClientError() }
            }

        assertEquals(0, accessRowCount(grantId))
    }

    @Test
    fun `touch preserves a stored timestamp within fifteen minutes and advances an older fact`() {
        val recent = Timestamp.valueOf("2026-08-29 01:00:00.123456")
        insertAccess("00000000-0000-0000-0000-000000000206", recent)
        jdbcTemplate.update(
            "update membership_club_access set last_access_at = utc_timestamp(6) - interval 14 minute " +
                "where membership_id = '00000000-0000-0000-0000-000000000206'",
        )
        val throttledAt = requireNotNull(lastClubAccessAt())

        performTouch("member5@example.com").andExpect {
            status { isOk() }
            jsonPath("$.lastClubAccessAt") { isNotEmpty() }
        }
        assertEquals(throttledAt, lastClubAccessAt())

        jdbcTemplate.update(
            "update membership_club_access set last_access_at = utc_timestamp(6) - interval 16 minute " +
                "where membership_id = '00000000-0000-0000-0000-000000000206'",
        )
        val expiredAt = requireNotNull(lastClubAccessAt())

        performTouch("member5@example.com").andExpect { status { isOk() } }
        val advancedAt = requireNotNull(lastClubAccessAt())
        assert(advancedAt.after(expiredAt))
    }

    @Test
    fun `concurrent touches converge on the persisted throttled value`() {
        insertAccess(
            "00000000-0000-0000-0000-000000000206",
            Timestamp.valueOf("2026-08-29 01:00:00.123456"),
        )
        val start = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val futures =
                List(2) {
                    executor.submit<java.time.OffsetDateTime?> {
                        start.await(5, TimeUnit.SECONDS)
                        clubAccessPort.touch(
                            UUID.fromString("00000000-0000-0000-0000-000000000206"),
                            UUID.fromString("00000000-0000-0000-0000-000000000001"),
                        )
                    }
                }
            start.countDown()
            val results = futures.map { future -> requireNotNull(future.get(10, TimeUnit.SECONDS)) }
            val persistedAt = requireNotNull(lastClubAccessAt()).toInstant()

            assertEquals(results[0], results[1])
            assertEquals(persistedAt, results[0].toInstant())
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `inactive membership cannot refresh a retained access row`() {
        val member = insertMember("INACTIVE")
        val retainedAt = Timestamp.valueOf("2026-08-29 01:00:00.123456")
        insertAccess(member.membershipId, retainedAt)

        performTouch(member.email).andExpect {
            status { isForbidden() }
        }

        assertEquals(retainedAt, lastClubAccessAt(member.membershipId))
    }

    @Test
    fun `persistence touch does not return a retained fact for an inactive membership`() {
        val member = insertMember("INACTIVE")
        val retainedAt = Timestamp.valueOf("2026-08-29 01:00:00.123456")
        insertAccess(member.membershipId, retainedAt)

        val result =
            clubAccessPort.touch(
                UUID.fromString(member.membershipId),
                UUID.fromString("00000000-0000-0000-0000-000000000001"),
            )

        assertEquals(null, result)
        assertEquals(retainedAt, lastClubAccessAt(member.membershipId))
    }

    @Test
    fun `membership deletion cascades its coarse access fact`() {
        val member = insertMember("ACTIVE")
        insertAccess(member.membershipId, Timestamp.valueOf("2026-08-29 01:00:00.123456"))

        jdbcTemplate.update("delete from memberships where id = ?", member.membershipId)
        createdMembershipIds.remove(member.membershipId)

        assertEquals(0, accessRowCount(member.membershipId))
    }

    @Test
    fun `club access storage has no page action authentication or device metadata`() {
        val columns =
            jdbcTemplate.queryForList(
                """
                select column_name
                from information_schema.columns
                where table_schema = database() and table_name = 'membership_club_access'
                order by ordinal_position
                """.trimIndent(),
                String::class.java,
            )

        assertEquals(listOf("membership_id", "club_id", "last_access_at"), columns)
    }

    private fun lastClubAccessAt(): Timestamp? = lastClubAccessAt("00000000-0000-0000-0000-000000000206")

    private fun lastClubAccessAt(membershipId: String): Timestamp? =
        jdbcTemplate.queryForObject(
            """
            select last_access_at
            from membership_club_access
            where membership_id = ?
              and club_id = '00000000-0000-0000-0000-000000000001'
            """.trimIndent(),
            Timestamp::class.java,
            membershipId,
        )

    private fun accessRowCount(membershipId: String): Int =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select count(*) from membership_club_access where membership_id = ?",
                Int::class.java,
                membershipId,
            ),
        )

    private fun performTouch(email: String) =
        mockMvc.put("/api/me/club-access") {
            with(user(email))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("X-Readmates-Club-Slug", "reading-sai")
            header("Origin", "http://localhost:3000")
        }

    private fun insertMember(status: String): TestMember {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val email = "club-access-${UUID.randomUUID()}@example.com"
        jdbcTemplate.update(
            "insert into users (id, email, name, short_name) values (?, ?, 'Club Access', 'Access')",
            userId,
            email,
        )
        jdbcTemplate.update(
            """
            insert into memberships (
              id, club_id, user_id, role, status, joined_at, short_name, avatar_key
            ) values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', ?, utc_timestamp(6), 'Access',
                      'mushroom-green-book')
            """.trimIndent(),
            membershipId,
            userId,
            status,
        )
        createdUserIds += userId
        createdMembershipIds += membershipId
        return TestMember(membershipId, email)
    }

    private fun insertAccess(
        membershipId: String,
        lastAccessAt: Timestamp,
    ) {
        jdbcTemplate.update(
            """
            insert into membership_club_access (membership_id, club_id, last_access_at)
            values (?, '00000000-0000-0000-0000-000000000001', ?)
            """.trimIndent(),
            membershipId,
            lastAccessAt,
        )
    }

    private fun insertSupportGrant(): String {
        val grantId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into support_access_grants (
              id, club_id, granted_by_user_id, grantee_user_id, scope, reason,
              expires_at, active_slot, reason_category, note_present, reason_evidence_version
            ) values (?, '00000000-0000-0000-0000-000000000001',
                      '00000000-0000-0000-0000-000000000901',
                      '00000000-0000-0000-0000-000000000903',
                      'HOST_SUPPORT_READ', '[REDACTED]', utc_timestamp(6) + interval 1 hour,
                      1, 'MEMBER_ASSISTANCE', 0, 1)
            """.trimIndent(),
            grantId,
        )
        createdSupportGrantIds += grantId
        return grantId
    }

    private fun membershipUpdatedAt(): Timestamp =
        requireNotNull(
            jdbcTemplate.queryForObject(
                "select updated_at from memberships where id = '00000000-0000-0000-0000-000000000206'",
                Timestamp::class.java,
            ),
        )

    private fun scheduleSeenSnapshot(): List<Map<String, Any?>> =
        jdbcTemplate.queryForList(
            """
            select session_id, seen_schedule_revision, seen_schedule_at
            from session_participants
            where membership_id = '00000000-0000-0000-0000-000000000206'
            order by session_id
            """.trimIndent(),
        )
}

private data class TestMember(
    val membershipId: String,
    val email: String,
)
