package com.readmates.support

import org.assertj.core.api.Assertions.assertThat
import org.springframework.jdbc.core.JdbcTemplate

data class MySqlExplainRow(
    val id: Long?,
    val selectType: String?,
    val table: String?,
    val accessType: String?,
    val possibleKeys: String?,
    val key: String?,
    val rows: Long?,
    val extra: String?,
)

fun JdbcTemplate.explain(sql: String, vararg args: Any?): List<MySqlExplainRow> =
    query(
        "explain $sql",
        { resultSet, _ ->
            MySqlExplainRow(
                id = resultSet.getLong("id").takeUnless { resultSet.wasNull() },
                selectType = resultSet.getString("select_type"),
                table = resultSet.getString("table"),
                accessType = resultSet.getString("type"),
                possibleKeys = resultSet.getString("possible_keys"),
                key = resultSet.getString("key"),
                rows = resultSet.getLong("rows").takeUnless { resultSet.wasNull() },
                extra = resultSet.getString("Extra"),
            )
        },
        *args,
    )

fun List<MySqlExplainRow>.assertUsesIndexFor(tableName: String, reason: String) {
    val candidates = filter { it.table == tableName }
    assertThat(candidates)
        .describedAs("EXPLAIN plan should include table $tableName for $reason. Plan: $this")
        .isNotEmpty
    assertThat(candidates)
        .describedAs("EXPLAIN plan should use an index for $tableName ($reason). Plan: $this")
        .anySatisfy { row ->
            assertThat(row.key)
                .describedAs("EXPLAIN key for $tableName ($reason). Row: $row")
                .isNotBlank()
        }
}
