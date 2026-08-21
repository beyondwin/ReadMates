package com.readmates.session.application.model

import java.util.UUID

enum class HostSessionChangeKind { BASIC_INFO, ATTENDANCE, LIFECYCLE }

data class HostSessionChangeReceipt(
    val changeId: UUID,
    val kind: HostSessionChangeKind,
    val undoAvailable: Boolean,
)

data class HostSessionRestorePreview(
    val sessionId: UUID,
    val changeId: UUID,
    val kind: HostSessionChangeKind,
    val items: List<HostSessionRestoreItem>,
    val expectedCurrentHash: String,
    val canRestore: Boolean,
    val blockedReason: String?,
)

data class HostSessionRestoreItem(
    val field: String,
    val subjectId: UUID? = null,
    val currentValue: String?,
    val targetValue: String?,
    val sensitive: Boolean = false,
)
