package com.readmates.archive.application.port.out

import com.readmates.archive.application.model.ArchiveDetailFragments
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface ArchiveDetailBatchReadPort {
    fun loadDetail(
        currentMember: CurrentMember,
        sessionId: UUID,
        sessionNumber: Int,
        myAttendanceStatus: String?,
    ): ArchiveDetailFragments
}
