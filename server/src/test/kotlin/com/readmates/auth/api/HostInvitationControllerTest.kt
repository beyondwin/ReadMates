package com.readmates.auth.api

import com.readmates.support.MySqlTestContainer
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.concurrent.Callable
import java.util.concurrent.CyclicBarrier
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.app-base-url=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [HostInvitationControllerTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class HostInvitationControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `host creates a pending member invitation with a one time accept url`() {
        mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":" New.Member@Example.com ","name":"새멤버"}"""
        }
            .andExpect {
                status { isCreated() }
                jsonPath("$.email") { value("new.member@example.com") }
                jsonPath("$.name") { value("새멤버") }
                jsonPath("$.role") { value("MEMBER") }
                jsonPath("$.status") { value("PENDING") }
                jsonPath("$.effectiveStatus") { value("PENDING") }
                jsonPath("$.applyToCurrentSession") { value(true) }
                jsonPath("$.acceptUrl", startsWith("http://localhost:3000/invite/"))
                jsonPath("$.canRevoke") { value(true) }
                jsonPath("$.canReissue") { value(true) }
            }

        val row = jdbcTemplate.queryForMap(
            """
            select invited_email, invited_name, role, status, length(token_hash) as token_hash_length
            from invitations
            where invited_email = 'new.member@example.com'
            """.trimIndent(),
        )
        assertEquals("new.member@example.com", row["invited_email"])
        assertEquals("새멤버", row["invited_name"])
        assertEquals("MEMBER", row["role"])
        assertEquals("PENDING", row["status"])
        assertEquals(64, numberValue(row["token_hash_length"]).toInt())
    }

    @Test
    fun `host creates invitation with current session intent disabled`() {
        mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"invite.apply@example.com","name":"초대 적용","applyToCurrentSession":false}"""
        }
            .andExpect {
                status { isCreated() }
                jsonPath("$.email") { value("invite.apply@example.com") }
                jsonPath("$.name") { value("초대 적용") }
                jsonPath("$.applyToCurrentSession") { value(false) }
            }

        mockMvc.get("/api/host/invitations") {
            with(user("host@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].email") { value("invite.apply@example.com") }
                jsonPath("$[0].applyToCurrentSession") { value(false) }
            }
    }

    @Test
    fun `member cannot create invitations`() {
        mockMvc.post("/api/host/invitations") {
            with(user("member5@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"blocked@example.com","name":"차단멤버"}"""
        }
            .andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `creating another live pending invitation revokes the previous one and returns a new token`() {
        val firstUrl = createInvitation("repeat@example.com")
        val secondUrl = createInvitation("repeat@example.com")

        assertNotEquals(firstUrl, secondUrl)

        val counts = jdbcTemplate.queryForMap(
            """
            select
              count(*) as total_count,
              sum(case when status = 'PENDING' then 1 else 0 end) as pending_count,
              sum(case when status = 'REVOKED' then 1 else 0 end) as revoked_count,
              sum(case when status = 'PENDING' and expires_at >= utc_timestamp(6) then 1 else 0 end) as live_pending_count
            from invitations
            where invited_email = 'repeat@example.com'
            """.trimIndent(),
        )
        assertEquals(2L, numberValue(counts["total_count"]).toLong())
        assertEquals(1L, numberValue(counts["pending_count"]).toLong())
        assertEquals(1L, numberValue(counts["revoked_count"]).toLong())
        assertEquals(1L, numberValue(counts["live_pending_count"]).toLong())
    }

    @Test
    fun `concurrent creates leave only one live pending invitation for an email`() {
        installInvitationInsertDelay("race@example.com")
        try {
            val barrier = CyclicBarrier(2)
            val executor = Executors.newFixedThreadPool(2)
            val results = executor.invokeAll(
                List(2) {
                    Callable {
                        barrier.await(5, TimeUnit.SECONDS)
                        createInvitation("race@example.com")
                    }
                },
            )
            executor.shutdown()
            assertEquals(true, executor.awaitTermination(5, TimeUnit.SECONDS))
            results.forEach { it.get() }

            val counts = jdbcTemplate.queryForMap(
                """
                select
                  count(*) as total_count,
                  sum(case when status = 'PENDING' then 1 else 0 end) as pending_count,
                  sum(case when status = 'REVOKED' then 1 else 0 end) as revoked_count,
                  sum(case when status = 'PENDING' and expires_at >= utc_timestamp(6) then 1 else 0 end) as live_pending_count
                from invitations
                where invited_email = 'race@example.com'
                """.trimIndent(),
            )
            assertEquals(2L, numberValue(counts["total_count"]).toLong())
            assertEquals(1L, numberValue(counts["pending_count"]).toLong())
            assertEquals(1L, numberValue(counts["revoked_count"]).toLong())
            assertEquals(1L, numberValue(counts["live_pending_count"]).toLong())
        } finally {
            uninstallInvitationInsertDelay()
        }
    }

    @Test
    fun `host lists and revokes invitations`() {
        createInvitation("list.member@example.com")

        val invitationId = mockMvc.get("/api/host/invitations") {
            with(user("host@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].email") { value("list.member@example.com") }
                jsonPath("$[0].effectiveStatus") { value("PENDING") }
                jsonPath("$[0].canRevoke") { value(true) }
                jsonPath("$[0].canReissue") { value(true) }
            }
            .andReturn()
            .response
            .contentAsString
            .substringAfter("\"invitationId\":\"")
            .substringBefore("\"")

        mockMvc.post("/api/host/invitations/$invitationId/revoke") {
            with(user("host@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.effectiveStatus") { value("REVOKED") }
                jsonPath("$.canRevoke") { value(false) }
            }
    }

    @Test
    fun `host cannot reissue accepted invitation rows for active members`() {
        createInvitation("accepted.list.member@example.com")
        acceptInvitationInDatabase("accepted.list.member@example.com")

        mockMvc.get("/api/host/invitations") {
            with(user("host@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$[0].email") { value("accepted.list.member@example.com") }
                jsonPath("$[0].effectiveStatus") { value("ACCEPTED") }
                jsonPath("$[0].canRevoke") { value(false) }
                jsonPath("$[0].canReissue") { value(false) }
            }
    }

    @Test
    fun `host cannot invite an already active member`() {
        mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"member5@example.com","name":"이멤버5"}"""
        }
            .andExpect {
                status { isConflict() }
                jsonPath("$.code") { value("MEMBER_ALREADY_ACTIVE") }
            }
    }

    private fun createInvitation(email: String): String {
        return mockMvc.post("/api/host/invitations") {
            with(user("host@example.com"))
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email","name":"초대 멤버"}"""
        }
            .andExpect { status { isCreated() } }
            .andReturn()
            .response
            .contentAsString
            .substringAfter("\"acceptUrl\":\"")
            .substringBefore("\"")
    }

    private fun numberValue(value: Any?): Number =
        value as? Number ?: error("Expected numeric value but was $value")

    private fun acceptInvitationInDatabase(email: String) {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url)
            values (uuid(), ?, ?, 'Accepted Member', 'Accepted Member', null)
            on duplicate key update
              google_subject_id = values(google_subject_id),
              email = values(email),
              name = values(name),
              short_name = values(short_name),
              profile_image_url = values(profile_image_url),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            "accepted-member-$email",
            email,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            select
              uuid(),
              '00000000-0000-0000-0000-000000000001',
              users.id,
              'MEMBER',
              'ACTIVE',
              utc_timestamp(6),
              users.short_name
            from users
            where users.email = ?
            on duplicate key update
              role = 'MEMBER',
              status = 'ACTIVE',
              joined_at = coalesce(memberships.joined_at, utc_timestamp(6)),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            email,
        )
        jdbcTemplate.update(
            """
            update invitations
            set status = 'ACCEPTED',
                accepted_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where invited_email = ?
            """.trimIndent(),
            email,
        )
    }

    private fun installInvitationInsertDelay(email: String) {
        uninstallInvitationInsertDelay()
        jdbcTemplate.execute(
            """
            create trigger test_invitation_insert_delay
            before insert on invitations
            for each row
            begin
              if NEW.invited_email = '$email' then
                do sleep(0.2);
              end if;
            end
            """.trimIndent(),
        )
    }

    private fun uninstallInvitationInsertDelay() {
        jdbcTemplate.execute("drop trigger if exists test_invitation_insert_delay")
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from invitations
            where invited_email in (
              'new.member@example.com',
              'invite.apply@example.com',
              'blocked@example.com',
              'repeat@example.com',
              'list.member@example.com',
              'accepted.list.member@example.com',
              'race@example.com'
            );
            delete memberships
            from memberships
            join users on memberships.user_id = users.id
            where users.email in (
                'accepted.list.member@example.com'
              );
            delete from users
            where email in (
              'accepted.list.member@example.com'
            );
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
