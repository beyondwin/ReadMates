package com.readmates.session.application

import com.readmates.shared.listing.application.model.HostListEpochKind

object HostListEpochInventory {
    enum class Mode {
        MEETING,
        RECORD,
    }

    data class Source(
        val sqlToken: String,
        val modes: Set<Mode>,
        val kinds: Set<HostListEpochKind>,
        val mutationOwners: Set<String>,
    )

    private const val DRAFT =
        "server/src/main/kotlin/com/readmates/session/application/service/HostSessionDraftCommandService.kt"
    private const val LIFECYCLE =
        "server/src/main/kotlin/com/readmates/session/application/service/HostSessionLifecycleService.kt"
    private const val TRASH =
        "server/src/main/kotlin/com/readmates/session/application/service/HostSessionTrashService.kt"
    private const val DELETION =
        "server/src/main/kotlin/com/readmates/session/application/service/HostSessionDeletionTransaction.kt"
    private const val MEMBER =
        "server/src/main/kotlin/com/readmates/session/application/service/SessionMemberWriteService.kt"
    private const val AUTH_LIFECYCLE =
        "server/src/main/kotlin/com/readmates/auth/application/service/MemberLifecycleService.kt"
    private const val RECORD_DRAFT =
        "server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordDraftService.kt"
    private const val RECORD_APPLY =
        "server/src/main/kotlin/com/readmates/sessionrecord/application/service/SessionRecordApplyService.kt"
    private const val PUBLICATION =
        "server/src/main/kotlin/com/readmates/session/application/service/HostSessionPublicationService.kt"
    private const val RECOVERY =
        "server/src/main/kotlin/com/readmates/session/application/service/HostSessionRecoveryService.kt"
    private const val ATTENDANCE =
        "server/src/main/kotlin/com/readmates/session/application/service/HostSessionAttendanceService.kt"

    private val bothModes = setOf(Mode.MEETING, Mode.RECORD)
    private val bothKinds = setOf(HostListEpochKind.MEETING, HostListEpochKind.RECORD)

    val sources: List<Source> =
        listOf(
            source("sessions.state", bothModes, bothKinds, LIFECYCLE, TRASH),
            source("sessions.session_date", bothModes, bothKinds, DRAFT, RECOVERY),
            source("sessions.title", bothModes, bothKinds, DRAFT, RECOVERY),
            source("sessions.book_title", bothModes, bothKinds, DRAFT, RECOVERY),
            source("sessions.number", bothModes, setOf(HostListEpochKind.MEETING), DRAFT),
            source("sessions.id", bothModes, setOf(HostListEpochKind.MEETING), DRAFT),
            source(
                "attention_rank",
                setOf(Mode.MEETING),
                setOf(HostListEpochKind.MEETING),
                LIFECYCLE,
                MEMBER,
                ATTENDANCE,
            ),
            source(
                "attention_rank",
                setOf(Mode.RECORD),
                setOf(HostListEpochKind.RECORD),
                LIFECYCLE,
                RECORD_DRAFT,
                RECORD_APPLY,
                PUBLICATION,
            ),
            source("has_draft", setOf(Mode.RECORD), setOf(HostListEpochKind.RECORD), RECORD_DRAFT, RECORD_APPLY),
            source("public_summary", setOf(Mode.RECORD), setOf(HostListEpochKind.RECORD), PUBLICATION, RECORD_APPLY),
            source("highlight_count", setOf(Mode.RECORD), setOf(HostListEpochKind.RECORD), RECORD_APPLY),
            source("one_liner_count", setOf(Mode.RECORD), setOf(HostListEpochKind.RECORD), MEMBER, RECORD_APPLY),
            source("feedback_ready", setOf(Mode.RECORD), setOf(HostListEpochKind.RECORD), RECORD_APPLY),
            source(
                "access_scope",
                setOf(Mode.RECORD),
                setOf(HostListEpochKind.RECORD),
                LIFECYCLE,
                RECORD_APPLY,
                PUBLICATION,
            ),
            source(
                "site_visibility",
                setOf(Mode.RECORD),
                setOf(HostListEpochKind.RECORD),
                LIFECYCLE,
                RECORD_APPLY,
                PUBLICATION,
            ),
            source(
                "participation_status",
                setOf(Mode.MEETING),
                setOf(HostListEpochKind.MEETING),
                LIFECYCLE,
                AUTH_LIFECYCLE,
            ),
            source(
                "pending_rsvp_count",
                setOf(Mode.MEETING),
                setOf(HostListEpochKind.MEETING),
                MEMBER,
                LIFECYCLE,
                AUTH_LIFECYCLE,
            ),
            source("deleted_at", bothModes, bothKinds, DELETION, TRASH),
        )

    private fun source(
        sqlToken: String,
        modes: Set<Mode>,
        kinds: Set<HostListEpochKind>,
        vararg owners: String,
    ) = Source(sqlToken, modes, kinds, owners.toSet())
}
