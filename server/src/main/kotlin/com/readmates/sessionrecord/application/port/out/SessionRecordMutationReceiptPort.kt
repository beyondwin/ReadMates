package com.readmates.sessionrecord.application.port.out

import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface SessionRecordMutationReceiptPort {
    fun recordCommitted(
        host: CurrentMember,
        sessionId: UUID,
        receiptId: UUID,
    )

    fun matchesCommitted(
        host: CurrentMember,
        sessionId: UUID,
        receiptId: UUID,
    ): Boolean

    data object Noop : SessionRecordMutationReceiptPort {
        override fun recordCommitted(
            host: CurrentMember,
            sessionId: UUID,
            receiptId: UUID,
        ) = Unit

        override fun matchesCommitted(
            host: CurrentMember,
            sessionId: UUID,
            receiptId: UUID,
        ): Boolean = true
    }
}
