package com.readmates.archive.application.model

data class ArchiveDetailFragments(
    val publicHighlights: List<MemberArchiveHighlightResult>,
    val clubQuestions: List<MemberArchiveQuestionResult>,
    val clubOneLiners: List<MemberArchiveOneLinerResult>,
    val publicOneLiners: List<MemberArchiveOneLinerResult>,
    val myQuestions: List<MemberArchiveQuestionResult>,
    val myCheckin: MemberArchiveCheckinResult?,
    val myOneLineReview: MemberArchiveOneLineReviewResult?,
    val myLongReview: MemberArchiveLongReviewResult?,
    val feedbackDocument: MemberArchiveFeedbackDocumentStatusResult,
)
