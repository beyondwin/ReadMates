@file:Suppress("ktlint:standard:package-name")

package com.readmates.session.application.port.`in`

import com.readmates.session.application.model.HostSessionChangeReceipt
import com.readmates.session.application.model.HostSessionRestorePreview
import com.readmates.shared.security.CurrentMember
import java.util.UUID

data class PreviewHostSessionRestoreCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val changeId: UUID,
)

data class RestoreHostSessionCommand(
    val host: CurrentMember,
    val sessionId: UUID,
    val changeId: UUID,
    val expectedCurrentHash: String,
    val expectedSessionRevision: com.readmates.session.application.model.ExpectedSessionRevision? = null,
    val expectedAttendanceRevision: Long? = null,
    val membershipId: UUID? = null,
    val idempotencyKey: String? = null,
)

interface PreviewHostSessionRestoreUseCase {
    fun preview(command: PreviewHostSessionRestoreCommand): HostSessionRestorePreview
}

interface RestoreHostSessionUseCase {
    fun restore(command: RestoreHostSessionCommand): HostSessionChangeReceipt
}
