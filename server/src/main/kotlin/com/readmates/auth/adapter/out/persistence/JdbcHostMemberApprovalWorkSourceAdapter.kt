package com.readmates.auth.adapter.out.persistence

import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQuery
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQueryPort
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceQueryResult
import com.readmates.auth.application.port.out.HostMemberApprovalWorkSourceRow
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class JdbcHostMemberApprovalWorkSourceAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostMemberApprovalWorkSourceQueryPort {
    override fun load(query: HostMemberApprovalWorkSourceQuery): HostMemberApprovalWorkSourceQueryResult =
        HostMemberApprovalWorkSourceQueryResult.Available(
            jdbcTemplate.query(
                """
                select id, created_at, status, updated_at,
                       case when status = 'ACTIVE' then 'APPROVED' else 'REJECTED' end receipt_action
                from memberships
                where club_id = ? and role = 'MEMBER'
                  and (status = 'VIEWER' or (status in ('ACTIVE', 'INACTIVE', 'LEFT') and updated_at >= ? and joined_at is not null))
                order by created_at, id
                """.trimIndent(),
                { rs, _ ->
                    val status = rs.getString("status")
                    HostMemberApprovalWorkSourceRow(
                        rs.uuid("id"),
                        rs.utcOffsetDateTime("created_at"),
                        status,
                        if (status == "VIEWER") null else rs.utcOffsetDateTime("updated_at"),
                        if (status == "VIEWER") null else rs.getString("receipt_action"),
                    )
                },
                query.clubId.dbString(),
                query.completedSince.toUtcLocalDateTime(),
            ),
        )
}
