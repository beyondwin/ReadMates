package com.readmates.support

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
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
class MySqlFlywayMigrationTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    @Test
    fun `mysql baseline creates auth session and feedback document tables`() {
        val tableCount = jdbcTemplate.queryForObject(
            """
            select count(*)
            from information_schema.tables
            where table_schema = database()
              and table_name in ('users', 'auth_sessions', 'session_feedback_documents')
            """.trimIndent(),
            Int::class.java,
        )

        assertEquals(3, tableCount)
        assertEquals("YES", columnValue("users", "password_hash", "is_nullable"))
        assertEquals("NO", columnValue("users", "short_name", "is_nullable"))
        assertEquals("NO", columnValue("invitations", "invited_name", "is_nullable"))
        assertEquals("longtext", columnValue("session_feedback_documents", "source_text", "data_type"))
        assertEquals(1, uniqueIndexCount("auth_sessions", "session_token_hash"))
        assertEquals("invited_by_membership_id,club_id", foreignKeyColumns("invitations", "invitations_inviter_fk"))
        assertEquals("memberships:id,club_id", foreignKeyReference("invitations", "invitations_inviter_fk"))

        val membershipStatuses = jdbcTemplate.queryForList(
            """
            select constraint_name, check_clause
            from information_schema.check_constraints
            where constraint_schema = database()
              and constraint_name = 'memberships_status_check'
            """.trimIndent(),
        )
        assertTrue(membershipStatuses.any { row ->
            row["CHECK_CLAUSE"].toString().contains("SUSPENDED") &&
                row["CHECK_CLAUSE"].toString().contains("LEFT")
        })

        val participantColumns = jdbcTemplate.queryForList(
            """
            select column_name
            from information_schema.columns
            where table_schema = database()
              and table_name = 'session_participants'
              and column_name = 'participation_status'
            """.trimIndent(),
        )
        assertEquals(1, participantColumns.size)
    }

    private fun columnValue(
        tableName: String,
        columnName: String,
        metadataColumn: String,
    ): String = jdbcTemplate.queryForObject(
        """
        select $metadataColumn
        from information_schema.columns
        where table_schema = database()
          and table_name = ?
          and column_name = ?
        """.trimIndent(),
        String::class.java,
        tableName,
        columnName,
    ) ?: error("Column $tableName.$columnName does not exist")

    private fun uniqueIndexCount(
        tableName: String,
        columnName: String,
    ): Int = jdbcTemplate.queryForObject(
        """
        select count(*)
        from information_schema.statistics
        where table_schema = database()
          and table_name = ?
          and column_name = ?
          and non_unique = 0
        """.trimIndent(),
        Int::class.java,
        tableName,
        columnName,
    ) ?: 0

    private fun foreignKeyColumns(
        tableName: String,
        constraintName: String,
    ): String = jdbcTemplate.queryForObject(
        """
        select group_concat(column_name order by ordinal_position separator ',')
        from information_schema.key_column_usage
        where constraint_schema = database()
          and table_name = ?
          and constraint_name = ?
        """.trimIndent(),
        String::class.java,
        tableName,
        constraintName,
    ) ?: error("Foreign key $tableName.$constraintName does not exist")

    private fun foreignKeyReference(
        tableName: String,
        constraintName: String,
    ): String = jdbcTemplate.queryForObject(
        """
        select concat(referenced_table_name, ':', group_concat(referenced_column_name order by ordinal_position separator ','))
        from information_schema.key_column_usage
        where constraint_schema = database()
          and table_name = ?
          and constraint_name = ?
        group by referenced_table_name
        """.trimIndent(),
        String::class.java,
        tableName,
        constraintName,
    ) ?: error("Foreign key $tableName.$constraintName does not exist")

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
