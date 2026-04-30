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
    val allowedAccessTypes = setOf(
        "const",
        "eq_ref",
        "index_merge",
        "index_subquery",
        "range",
        "ref",
        "ref_or_null",
        "system",
        "unique_subquery",
    )
    val invalidAccessRows = candidates.filter { row ->
        row.accessType?.lowercase() !in allowedAccessTypes
    }
    assertThat(invalidAccessRows)
        .describedAs(
            "EXPLAIN plan should use targeted indexed access for $tableName ($reason), " +
                "not full table or full index scans. Plan: $this",
        )
        .isEmpty()
    val missingKeyRows = candidates.filter { row ->
        row.accessType?.lowercase() != "system" && row.key.isNullOrBlank()
    }
    assertThat(missingKeyRows)
        .describedAs("EXPLAIN key should be present for $tableName ($reason). Plan: $this")
        .isEmpty()
}
