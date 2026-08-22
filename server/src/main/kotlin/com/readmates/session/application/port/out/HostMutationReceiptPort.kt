package com.readmates.session.application.port.out

import com.readmates.session.application.model.HostMutationReceiptRecord
import java.util.UUID

interface HostMutationReceiptPort {
    fun insert(record: HostMutationReceiptRecord)

    fun find(
        clubId: UUID,
        receiptId: UUID,
    ): HostMutationReceiptRecord?
}
