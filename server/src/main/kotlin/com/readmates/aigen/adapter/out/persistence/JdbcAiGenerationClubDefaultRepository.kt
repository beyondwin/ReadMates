package com.readmates.aigen.adapter.out.persistence

import com.readmates.aigen.application.port.out.AiGenerationClubDefaultPort
import com.readmates.aigen.application.port.out.ClubDefault
import com.readmates.shared.db.dbString
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@Repository
class JdbcAiGenerationClubDefaultRepository(
    private val jdbcTemplate: JdbcTemplate,
) : AiGenerationClubDefaultPort {
    override fun load(clubId: UUID): ClubDefault? =
        jdbcTemplate
            .query(
                """
                select club_id, default_model, updated_at, updated_by
                from ai_generation_club_defaults
                where club_id = ?
                """.trimIndent(),
                clubDefaultRowMapper,
                clubId.dbString(),
            ).firstOrNull()

    override fun upsert(
        clubId: UUID,
        defaultModel: String,
        updatedBy: UUID,
    ) {
        val now = Timestamp.from(Instant.now())
        jdbcTemplate.update(
            """
            insert into ai_generation_club_defaults (club_id, default_model, updated_at, updated_by)
            values (?, ?, ?, ?)
            on duplicate key update
              default_model = values(default_model),
              updated_at    = values(updated_at),
              updated_by    = values(updated_by)
            """.trimIndent(),
            clubId.dbString(),
            defaultModel,
            now,
            updatedBy.dbString(),
        )
    }

    companion object {
        private val clubDefaultRowMapper =
            RowMapper { rs, _ ->
                ClubDefault(
                    clubId = UUID.fromString(rs.getString("club_id")),
                    defaultModel = rs.getString("default_model"),
                    updatedAt = rs.getTimestamp("updated_at").toInstant(),
                    updatedBy = UUID.fromString(rs.getString("updated_by")),
                )
            }
    }
}
