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
                with first_transition as (
                  select receipts.subject_membership_id_snapshot,
                         receipts.operation,
                         receipts.created_at,
                         row_number() over (
                           partition by receipts.subject_membership_id_snapshot
                           order by receipts.created_at, receipts.id
                         ) transition_ordinal
                  from auth_public_projection_mutation_receipts receipts
                  where receipts.club_id_snapshot = ?
                    and receipts.operation in ('VIEWER_ACTIVATED', 'VIEWER_REJECTED')
                )
                select memberships.id,
                       memberships.created_at,
                       'VIEWER' status,
                       null transitioned_at,
                       null receipt_action
                from memberships
                where memberships.club_id = ?
                  and memberships.role = 'MEMBER'
                  and memberships.status = 'VIEWER'
                union all
                select memberships.id,
                       memberships.created_at,
                       case when first_transition.operation = 'VIEWER_ACTIVATED' then 'ACTIVE' else 'INACTIVE' end status,
                       first_transition.created_at transitioned_at,
                       case when first_transition.operation = 'VIEWER_ACTIVATED' then 'APPROVED' else 'REJECTED' end receipt_action
                from first_transition
                join memberships
                  on memberships.id = first_transition.subject_membership_id_snapshot
                 and memberships.club_id = ?
                where first_transition.transition_ordinal = 1
                  and first_transition.created_at >= ?
                order by created_at, id
                """.trimIndent(),
                { rs, _ ->
                    val status = rs.getString("status")
                    HostMemberApprovalWorkSourceRow(
                        rs.uuid("id"),
                        rs.utcOffsetDateTime("created_at"),
                        status,
                        if (status == "VIEWER") null else rs.utcOffsetDateTime("transitioned_at"),
                        if (status == "VIEWER") null else rs.getString("receipt_action"),
                    )
                },
                query.clubId.dbString(),
                query.clubId.dbString(),
                query.clubId.dbString(),
                query.completedSince.toUtcLocalDateTime(),
            ),
        )
}
