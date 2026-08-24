package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.AdminSupportGrantLedgerCursor
import com.readmates.club.application.model.AdminSupportGrantLedgerPage
import com.readmates.club.application.model.AdminSupportSearchResult
import com.readmates.club.application.port.`in`.AdminSupportWorkbenchUseCase
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.AdminSupportSearchPort
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.InvalidCursorEncodingException
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import java.time.OffsetDateTime
import java.util.UUID

@Service
class AdminSupportWorkbenchService(
    private val searchPort: AdminSupportSearchPort,
    private val grantLedgerPort: AdminSupportGrantLedgerPort,
) : AdminSupportWorkbenchUseCase {
    override fun search(
        admin: CurrentPlatformAdmin,
        query: String,
        clubId: UUID?,
    ): List<AdminSupportSearchResult> {
        val trimmed = normalizeSearchQuery(query)
        requireOwner(admin, "Platform admin cannot search support subjects")
        return searchPort.search(trimmed, clubId, SUPPORT_SEARCH_LIMIT)
    }

    override fun listGrantLedger(
        admin: CurrentPlatformAdmin,
        clubId: UUID?,
        status: String?,
        cursor: String?,
    ): AdminSupportGrantLedgerPage {
        requireOwner(admin, "Platform admin cannot read support grants")
        val normalizedStatus =
            status?.uppercase()?.also {
                if (it !in SUPPORT_GRANT_STATUSES) {
                    throw PlatformAdminException(PlatformAdminError.INVALID_CURSOR, "Invalid grant status")
                }
            }
        val decodedCursor = decodeCursor(cursor)
        val rows =
            grantLedgerPort.listLedger(
                clubId = clubId,
                status = normalizedStatus,
                cursor = decodedCursor,
                limit = GRANT_LEDGER_LIMIT + 1,
            )
        val items = rows.take(GRANT_LEDGER_LIMIT)
        val nextCursor =
            if (rows.size > GRANT_LEDGER_LIMIT) {
                items.lastOrNull()?.let {
                    CursorCodec.encode(
                        mapOf(
                            "createdAt" to it.createdAt.toInstant().toString(),
                            "grantId" to it.grantId.toString(),
                        ),
                    )
                }
            } else {
                null
            }
        return AdminSupportGrantLedgerPage(items, nextCursor)
    }

    private fun decodeCursor(raw: String?): AdminSupportGrantLedgerCursor? {
        val decoded =
            try {
                CursorCodec.decodeStrict(raw)
            } catch (_: InvalidCursorEncodingException) {
                invalidGrantCursor()
            } ?: return null
        if (decoded.keys != setOf("createdAt", "grantId")) {
            invalidGrantCursor()
        }
        return runCatching {
            AdminSupportGrantLedgerCursor(
                createdAt = OffsetDateTime.parse(decoded.getValue("createdAt")),
                grantId = UUID.fromString(decoded.getValue("grantId")),
            )
        }.getOrElse { invalidGrantCursor() }
    }

    private fun normalizeSearchQuery(query: String): String {
        val trimmed = query.trim()
        if (trimmed.isBlank()) {
            throw PlatformAdminException(PlatformAdminError.SUPPORT_TARGET_NOT_FOUND, "Search query is required")
        }
        if (trimmed.length > MAX_SUPPORT_QUERY_LENGTH || trimmed.any { it in SUPPORT_WILDCARDS }) {
            throw PlatformAdminException(PlatformAdminError.SUPPORT_TARGET_NOT_FOUND, "Search query is invalid")
        }
        return trimmed
    }

    private fun requireOwner(
        admin: CurrentPlatformAdmin,
        message: String,
    ) {
        if (admin.role != PlatformAdminRole.OWNER) throw AccessDeniedException(message)
    }

    private fun invalidGrantCursor(): Nothing =
        throw PlatformAdminException(PlatformAdminError.INVALID_CURSOR, "Invalid support grant cursor")
}

private const val SUPPORT_SEARCH_LIMIT = 10
private const val GRANT_LEDGER_LIMIT = 50
private const val MAX_SUPPORT_QUERY_LENGTH = 120
private val SUPPORT_WILDCARDS = setOf('%', '_', '\\')
private val SUPPORT_GRANT_STATUSES = setOf("ACTIVE", "EXPIRING", "EXPIRED", "REVOKED")
