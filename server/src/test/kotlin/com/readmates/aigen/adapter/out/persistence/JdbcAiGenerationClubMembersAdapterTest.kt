package com.readmates.aigen.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.TestPropertySource
import java.util.UUID

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
class JdbcAiGenerationClubMembersAdapterTest(
    @param:Autowired private val adapter: JdbcAiGenerationClubMembersAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `loads every active same club membership without session participant dependency`() {
        val clubId = insertClub("active")
        val otherClubId = insertClub("other")
        val activeId = insertMember(clubId, "ACTIVE", "가람")
        insertMember(clubId, "INACTIVE", "비활성")
        insertMember(otherClubId, "ACTIVE", "다른클럽")

        val members = adapter.loadActiveMembers(clubId)

        val member = members.single()
        assertThat(member.membershipId).isEqualTo(activeId)
        assertThat(member.displayName).isEqualTo("가람")
    }

    private fun insertClub(label: String): UUID {
        val id = UUID.randomUUID()
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about) values (?, ?, '공개 테스트', '공개 테스트', '공개 테스트')",
            id.toString(),
            "aigen-members-$label-${id.toString().take(8)}",
        )
        return id
    }

    private fun insertMember(
        clubId: UUID,
        status: String,
        displayName: String,
    ): UUID {
        val userId = UUID.randomUUID()
        val membershipId = UUID.randomUUID()
        jdbcTemplate.update(
            "insert into users (id, email, name, short_name, auth_provider) values (?, ?, ?, ?, 'PASSWORD')",
            userId.toString(),
            "${userId.toString().take(12)}@example.com",
            "계정-$displayName",
            displayName,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, short_name, joined_at)
            values (?, ?, ?, 'MEMBER', ?, ?, utc_timestamp(6))
            """.trimIndent(),
            membershipId.toString(),
            clubId.toString(),
            userId.toString(),
            status,
            displayName,
        )
        return membershipId
    }
}
