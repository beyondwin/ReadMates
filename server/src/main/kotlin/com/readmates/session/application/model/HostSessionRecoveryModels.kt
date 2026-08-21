package com.readmates.session.application.model

import java.util.UUID

enum class HostSessionChangeKind { BASIC_INFO, ATTENDANCE, LIFECYCLE }

data class HostSessionChangeReceipt(
    val changeId: UUID,
    val kind: HostSessionChangeKind,
    val undoAvailable: Boolean,
)
