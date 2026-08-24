package com.readmates.shared.listing.adapter.out.persistence

import com.readmates.shared.db.dbString
import com.readmates.shared.listing.application.model.HostListEpoch
import com.readmates.shared.listing.application.model.HostListEpochKind
import com.readmates.shared.listing.application.port.out.HostListEpochPort
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcHostListEpochAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostListEpochPort {
    override fun load(clubId: UUID): HostListEpoch =
        jdbcTemplate
            .query(
                """
                select club_id, meeting_epoch, record_epoch
                from club_host_list_epochs
                where club_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    HostListEpoch(
                        clubId = clubId,
                        meetingEpoch = resultSet.getLong("meeting_epoch"),
                        recordEpoch = resultSet.getLong("record_epoch"),
                    )
                },
                clubId.dbString(),
            ).firstOrNull() ?: HostListEpoch(clubId, 0, 0)

    override fun bump(
        clubId: UUID,
        kinds: Set<HostListEpochKind>,
    ) {
        if (kinds.isEmpty()) return
        ensureRow(clubId)
        val meetingDelta = if (HostListEpochKind.MEETING in kinds) 1 else 0
        val recordDelta = if (HostListEpochKind.RECORD in kinds) 1 else 0
        jdbcTemplate.update(
            """
            update club_host_list_epochs
            set meeting_epoch = meeting_epoch + ?,
                record_epoch = record_epoch + ?
            where club_id = ?
            """.trimIndent(),
            meetingDelta,
            recordDelta,
            clubId.dbString(),
        )
    }

    private fun ensureRow(clubId: UUID) {
        jdbcTemplate.update(
            """
            insert ignore into club_host_list_epochs (club_id, meeting_epoch, record_epoch)
            values (?, 0, 0)
            """.trimIndent(),
            clubId.dbString(),
        )
    }
}
