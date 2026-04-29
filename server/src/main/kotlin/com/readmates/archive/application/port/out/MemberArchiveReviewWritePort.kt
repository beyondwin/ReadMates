package com.readmates.archive.application.port.out

import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewCommand
import com.readmates.archive.application.port.`in`.SaveMemberArchiveLongReviewResult

interface MemberArchiveReviewWritePort {
    fun saveLongReview(command: SaveMemberArchiveLongReviewCommand): SaveMemberArchiveLongReviewResult?
}
