package com.readmates.support

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
