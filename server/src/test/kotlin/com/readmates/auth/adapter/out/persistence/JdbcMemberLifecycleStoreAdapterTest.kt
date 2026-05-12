package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.domain.IllegalMemberStateTransitionException
import com.readmates.auth.domain.MemberLifecycleStatus
import com.readmates.shared.db.dbString
import com.readmates.support.MySqlTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

private const val CLEANUP_LIFECYCLE_ADAPTER_SQL = """
    delete memberships from memberships
    join users on users.id = memberships.user_id
    where users.email like 'lifecycle.adapter.test.%@example.com';
    delete from users where email like 'lifecycle.adapter.test.%@example.com';
"""

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Sql(
    statements = [CLEANUP_LIFECYCLE_ADAPTER_SQL],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_LIFECYCLE_ADAPTER_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class JdbcMemberLifecycleStoreAdapterTest(
    @param:Autowired private val adapter: JdbcMemberLifecycleStoreAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val clubId = UUID.fromString("00000000-0000-0000-0000-000000000001")

    // ---- invalid transition: LEFT → restore ----

    @Test
    fun `restoreSuspendedMember on LEFT member throws IllegalMemberStateTransitionException`() {
        val membershipId = insertMember(status = "LEFT")

        assertThatThrownBy {
            adapter.restoreSuspendedMember(clubId, membershipId)
        }
            .isInstanceOf(IllegalMemberStateTransitionException::class.java)
            .satisfies({ ex ->
                val t = ex as IllegalMemberStateTransitionException
                assertThat(t.from).isEqualTo(MemberLifecycleStatus.LEFT)
                assertThat(t.to).isEqualTo(MemberLifecycleStatus.ACTIVE)
            })
    }

    // ---- invalid transitions: INACTIVE → all host-driven methods ----

    @Test
    fun `suspendActiveMember on INACTIVE member throws IllegalMemberStateTransitionException`() {
        val membershipId = insertMember(status = "INACTIVE")

        assertThatThrownBy {
            adapter.suspendActiveMember(clubId, membershipId)
        }
            .isInstanceOf(IllegalMemberStateTransitionException::class.java)
            .satisfies({ ex ->
                val t = ex as IllegalMemberStateTransitionException
                assertThat(t.from).isEqualTo(MemberLifecycleStatus.INACTIVE)
                assertThat(t.to).isEqualTo(MemberLifecycleStatus.SUSPENDED)
            })
    }

    @Test
    fun `restoreSuspendedMember on INACTIVE member throws IllegalMemberStateTransitionException`() {
        val membershipId = insertMember(status = "INACTIVE")

        assertThatThrownBy {
            adapter.restoreSuspendedMember(clubId, membershipId)
        }
            .isInstanceOf(IllegalMemberStateTransitionException::class.java)
            .satisfies({ ex ->
                val t = ex as IllegalMemberStateTransitionException
                assertThat(t.from).isEqualTo(MemberLifecycleStatus.INACTIVE)
                assertThat(t.to).isEqualTo(MemberLifecycleStatus.ACTIVE)
            })
    }

    @Test
    fun `markMemberLeftByHost on INACTIVE member throws IllegalMemberStateTransitionException`() {
        val membershipId = insertMember(status = "INACTIVE")

        assertThatThrownBy {
            adapter.markMemberLeftByHost(clubId, membershipId)
        }
            .isInstanceOf(IllegalMemberStateTransitionException::class.java)
            .satisfies({ ex ->
                val t = ex as IllegalMemberStateTransitionException
                assertThat(t.from).isEqualTo(MemberLifecycleStatus.INACTIVE)
                assertThat(t.to).isEqualTo(MemberLifecycleStatus.LEFT)
            })
    }

    // ---- happy-path transitions ----

    @Test
    fun `suspendActiveMember transitions ACTIVE to SUSPENDED`() {
        val membershipId = insertMember(status = "ACTIVE")

        val result = adapter.suspendActiveMember(clubId, membershipId)

        assertThat(result).isTrue()
        assertThat(fetchStatus(membershipId)).isEqualTo("SUSPENDED")
    }

    @Test
    fun `restoreSuspendedMember transitions SUSPENDED to ACTIVE`() {
        val membershipId = insertMember(status = "SUSPENDED")

        val result = adapter.restoreSuspendedMember(clubId, membershipId)

        assertThat(result).isTrue()
        assertThat(fetchStatus(membershipId)).isEqualTo("ACTIVE")
    }

    @Test
    fun `markMemberLeftByHost transitions ACTIVE to LEFT`() {
        val membershipId = insertMember(status = "ACTIVE")

        val result = adapter.markMemberLeftByHost(clubId, membershipId)

        assertThat(result).isTrue()
        assertThat(fetchStatus(membershipId)).isEqualTo("LEFT")
    }

    @Test
    fun `markMemberLeftByHost transitions SUSPENDED to LEFT`() {
        val membershipId = insertMember(status = "SUSPENDED")

        val result = adapter.markMemberLeftByHost(clubId, membershipId)

        assertThat(result).isTrue()
        assertThat(fetchStatus(membershipId)).isEqualTo("LEFT")
    }

    @Test
    fun `markMemberLeftByHost transitions VIEWER to LEFT`() {
        val membershipId = insertMember(status = "VIEWER")

        val result = adapter.markMemberLeftByHost(clubId, membershipId)

        assertThat(result).isTrue()
        assertThat(fetchStatus(membershipId)).isEqualTo("LEFT")
    }

    @Test
    fun `markMemberLeftByHost transitions INVITED to LEFT`() {
        val membershipId = insertMember(status = "INVITED")

        val result = adapter.markMemberLeftByHost(clubId, membershipId)

        assertThat(result).isTrue()
        assertThat(fetchStatus(membershipId)).isEqualTo("LEFT")
    }

    private fun insertMember(status: String): UUID {
        val idSuffix = UUID.randomUUID().toString()
        val userId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        val email = "lifecycle.adapter.test.$idSuffix@example.com"
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, ?, ?, 'Test Member', ?, 'GOOGLE')
            """.trimIndent(),
            userId.dbString(),
            "google-lifecycle-test-$idSuffix",
            email,
            "test-${idSuffix.take(8)}",
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'MEMBER', ?, utc_timestamp(6), ?)
            """.trimIndent(),
            membershipId.dbString(),
            clubId.dbString(),
            userId.dbString(),
            status,
            "test-${idSuffix.take(8)}",
        )
        return membershipId
    }

    private fun fetchStatus(membershipId: UUID): String =
        jdbcTemplate.queryForObject(
            "select status from memberships where id = ?",
            String::class.java,
            membershipId.dbString(),
        )!!

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
