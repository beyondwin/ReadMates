package com.readmates.club.adapter.out.persistence

import com.readmates.auth.application.port.out.MemberAvatarRandomIndexPort
import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.shared.db.dbString
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.bean.override.mockito.MockitoBean
import java.util.UUID
import org.mockito.Mockito.`when` as whenever

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcPlatformAdminClubAvatarAllocationTest(
    @Autowired private val adapter: JdbcPlatformAdminClubAdapter,
    @Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @MockitoBean
    private lateinit var randomIndex: MemberAvatarRandomIndexPort

    @BeforeEach
    fun setUp() {
        cleanup()
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, 'platform-avatar-test', 'Platform Avatar Test', '', '', 'SETUP_REQUIRED', 'PRIVATE')
            """.trimIndent(),
            CLUB_ID.dbString(),
        )
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, 'platform-avatar-user', 'platform-avatar@example.com', 'Assigned Host', 'Assigned Host', 'GOOGLE')
            """.trimIndent(),
            USER_ID.dbString(),
        )
        whenever(randomIndex.nextIndex(BookClubAvatarKey.ordered.size)).thenReturn(7)
    }

    @AfterEach
    fun tearDown() {
        cleanup()
    }

    @Test
    fun `new existing-user host membership persists the randomized allocator result`() {
        val membershipId = adapter.upsertHostMembership(CLUB_ID, USER_ID, "Assigned Host")

        val persistedAvatarKey =
            jdbcTemplate.queryForObject(
                "select avatar_key from memberships where id = ?",
                String::class.java,
                membershipId.dbString(),
            )
        assertThat(persistedAvatarKey).isEqualTo(BookClubAvatarKey.SAILBOAT_GREEN_BOOK.wireValue)
    }

    private fun cleanup() {
        jdbcTemplate.update("delete from memberships where club_id = ?", CLUB_ID.dbString())
        jdbcTemplate.update("delete from users where id = ?", USER_ID.dbString())
        jdbcTemplate.update("delete from clubs where id = ?", CLUB_ID.dbString())
    }

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("20000000-0000-0000-0000-000000000001")
        val USER_ID: UUID = UUID.fromString("20000000-0000-0000-0000-000000000002")
    }
}
