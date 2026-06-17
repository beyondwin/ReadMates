package com.readmates.feedback.application.port.out

import com.readmates.feedback.application.model.FeedbackDocumentSessionResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentListResult
import com.readmates.feedback.application.model.StoredFeedbackDocumentResult
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import java.util.UUID

interface FeedbackDocumentStorePort {
    fun listLatestReadableDocuments(
        currentMember: CurrentMember,
        pageRequest: PageRequest,
    ): CursorPage<StoredFeedbackDocumentListResult>

    fun findReadableSession(
        clubId: UUID,
        sessionId: UUID,
    ): FeedbackDocumentSessionResult?

    fun findLatestDocument(
        clubId: UUID,
        sessionId: UUID,
    ): StoredFeedbackDocumentResult?
}
