@file:Suppress("ktlint:standard:package-name")

package com.readmates.sessionrecord.adapter.`in`.web

import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.sessionrecord.application.model.SessionRecordError
import com.readmates.sessionrecord.application.model.SessionRecordException
import com.readmates.sessionrecord.application.port.`in`.ApplySessionRecordUseCase
import com.readmates.sessionrecord.application.port.`in`.GetHostSessionHistoryUseCase
import com.readmates.sessionrecord.application.port.`in`.GetHostSessionRecordCapabilitiesUseCase
import com.readmates.sessionrecord.application.port.`in`.ManageSessionRecordDraftUseCase
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/host")
class HostSessionRecordController(
    private val drafts: ManageSessionRecordDraftUseCase,
    private val apply: ApplySessionRecordUseCase,
    private val history: GetHostSessionHistoryUseCase,
    private val capabilities: GetHostSessionRecordCapabilitiesUseCase,
) {
    @GetMapping("/capabilities")
    fun capabilities(member: CurrentMember) = capabilities.capabilities(member)

    @GetMapping("/sessions/{sessionId}/record-editor")
    fun editor(
        member: CurrentMember,
        @PathVariable sessionId: String,
    ) = drafts.getEditor(member, parseRecordPathId(sessionId)).toResponse()

    @PatchMapping("/sessions/{sessionId}/record-draft")
    fun saveDraft(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @Valid @RequestBody request: SaveSessionRecordDraftRequest,
    ) = drafts.save(member, request.toCommand(parseRecordPathId(sessionId))).toResponse()

    @DeleteMapping("/sessions/{sessionId}/record-draft")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun discardDraft(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestParam expectedDraftRevision: Long,
    ) {
        drafts.discard(member, parseRecordPathId(sessionId), expectedDraftRevision)
    }

    @PostMapping("/sessions/{sessionId}/record-apply-preview")
    fun previewApply(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @Valid @RequestBody request: PreviewSessionRecordApplyRequest,
    ) = apply.preview(member, request.toCommand(parseRecordPathId(sessionId))).toResponse()

    @PostMapping("/sessions/{sessionId}/record-apply")
    fun apply(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @Valid @RequestBody request: ApplySessionRecordRequest,
    ) = apply.apply(member, request.toCommand(parseRecordPathId(sessionId))).toResponse()

    @GetMapping("/sessions/{sessionId}/history")
    fun history(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ) = history
        .history(
            member,
            parseRecordPathId(sessionId),
            PageRequest.cursor(limit, requireValidHistoryCursor(cursor), defaultLimit = 50, maxLimit = 100),
        ).toHistoryResponse()

    @PostMapping("/sessions/{sessionId}/revisions/{revisionId}/restore-to-draft")
    fun restore(
        member: CurrentMember,
        @PathVariable sessionId: String,
        @PathVariable revisionId: String,
        @Valid @RequestBody request: RestoreSessionRecordDraftRequest,
    ) = drafts
        .restore(
            member,
            request.toCommand(parseRecordPathId(sessionId), parseRecordPathId(revisionId)),
        ).toResponse()
}

private fun requireValidHistoryCursor(cursor: String?): String? {
    if (!cursor.isNullOrBlank() && CursorCodec.decode(cursor) == null) {
        throw InvalidHostSessionCursorException()
    }
    return cursor
}

private fun parseRecordPathId(value: String): UUID =
    runCatching { UUID.fromString(value) }
        .getOrElse { throw SessionRecordException(SessionRecordError.SESSION_NOT_FOUND, "Session record not found") }
