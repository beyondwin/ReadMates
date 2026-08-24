package com.readmates.session.application.service

import com.readmates.sessionrecord.application.model.ApplySessionRecordCommand
import com.readmates.sessionrecord.application.model.PreviewSessionRecordApplyCommand
import com.readmates.sessionrecord.application.model.PublishSessionRecordCorrectionCommand
import com.readmates.sessionrecord.application.model.PublishSessionRecordCorrectionResult
import com.readmates.sessionrecord.application.model.SessionRecordApplyPreview
import com.readmates.sessionrecord.application.model.SessionRecordApplyResult
import com.readmates.sessionrecord.application.model.SessionRecordCorrectionPreview
import com.readmates.sessionrecord.application.port.`in`.ApplySessionRecordUseCase
import com.readmates.shared.security.CurrentMember
import java.util.UUID

internal object TestApplySessionRecordUseCaseStub : ApplySessionRecordUseCase {
    override fun previewCorrection(
        host: CurrentMember,
        sessionId: UUID,
    ): SessionRecordCorrectionPreview? = null

    override fun preview(
        host: CurrentMember,
        command: PreviewSessionRecordApplyCommand,
    ): SessionRecordApplyPreview = unsupported()

    override fun apply(
        host: CurrentMember,
        command: ApplySessionRecordCommand,
    ): SessionRecordApplyResult = unsupported()

    override fun publishCorrection(
        host: CurrentMember,
        command: PublishSessionRecordCorrectionCommand,
    ): PublishSessionRecordCorrectionResult = unsupported()

    private fun unsupported(): Nothing = error("Correction publishing is not configured for this unit test")
}
