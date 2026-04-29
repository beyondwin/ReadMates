package com.readmates.support

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.TestPropertySource

@SpringBootTest
@TestPropertySource(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "spring.jpa.hibernate.ddl-auto=validate",
    ],
)
class ReadmatesMySqlSeedTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `seed has baseline multi club metadata`() {
        val club = jdbcTemplate.queryForMap(
            """
            select id, slug, status
            from clubs
            where slug = 'reading-sai'
            """.trimIndent(),
        )

        assertThat(club["slug"]).isEqualTo("reading-sai")
        assertThat(club["status"]).isEqualTo("ACTIVE")

        val domainCount = jdbcTemplate.queryForObject(
            """
            select count(*)
            from club_domains
            where club_id = ?
              and status in ('ACTION_REQUIRED', 'ACTIVE')
            """.trimIndent(),
            Int::class.java,
            club["id"],
        )
        assertThat(domainCount).isGreaterThanOrEqualTo(0)

        assertEquals(
            0,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from platform_admins
                where role = 'OWNER'
                """.trimIndent(),
                Int::class.java,
            ),
        )
    }

    @Test
    fun `dev seed contains second club for cross club tests`() {
        val clubs = jdbcTemplate.queryForList(
            """
            select slug, status
            from clubs
            where slug in ('reading-sai', 'sample-book-club')
            order by slug
            """.trimIndent(),
        )

        assertThat(clubs).hasSize(2)
        assertThat(clubs).extracting<String> { row -> row["slug"].toString() }
            .containsExactly("reading-sai", "sample-book-club")
        assertThat(clubs).allSatisfy { row ->
            assertThat(row["status"]).isEqualTo("ACTIVE")
        }
    }

    @Test
    fun `mysql dev seed creates readmates club host and six archived sessions`() {
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from clubs where slug = 'reading-sai'", Int::class.java))
        assertEquals(1, jdbcTemplate.queryForObject("select count(*) from memberships where role = 'HOST' and status = 'ACTIVE'", Int::class.java))
        assertEquals(6, jdbcTemplate.queryForObject("select count(*) from sessions where state = 'PUBLISHED'", Int::class.java))
        assertEquals(
            6,
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from public_session_publications
                join sessions on sessions.id = public_session_publications.session_id
                  and sessions.club_id = public_session_publications.club_id
                join clubs on clubs.id = sessions.club_id
                where clubs.slug = 'reading-sai'
                  and sessions.number in (1, 2, 3, 4, 5, 6)
                  and public_session_publications.visibility = 'PUBLIC'
                """.trimIndent(),
                Int::class.java,
            ),
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
