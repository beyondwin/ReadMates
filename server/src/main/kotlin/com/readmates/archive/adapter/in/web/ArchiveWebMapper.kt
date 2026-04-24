package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.model.ArchiveSessionResult
import com.readmates.archive.application.model.MemberArchiveCheckinResult
import com.readmates.archive.application.model.MemberArchiveFeedbackDocumentStatusResult
import com.readmates.archive.application.model.MemberArchiveHighlightResult
import com.readmates.archive.application.model.MemberArchiveLongReviewResult
import com.readmates.archive.application.model.MemberArchiveOneLineReviewResult
import com.readmates.archive.application.model.MemberArchiveOneLinerResult
import com.readmates.archive.application.model.MemberArchiveQuestionResult
import com.readmates.archive.application.model.MemberArchiveSessionDetailResult
import com.readmates.archive.application.model.MyArchiveQuestionResult
import com.readmates.archive.application.model.MyArchiveReviewResult
import com.readmates.archive.application.model.MyPageResult
import com.readmates.archive.application.model.MyRecentAttendanceResult

fun ArchiveSessionResult.toWebDto() =
    ArchiveSessionItem(
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        title = title,
        bookTitle = bookTitle,
        bookAuthor = bookAuthor,
        bookImageUrl = bookImageUrl,
        date = date,
        attendance = attendance,
        total = total,
        published = published,
        state = state,
        feedbackDocument = feedbackDocument.toWebDto(),
    )

fun MyArchiveQuestionResult.toWebDto() =
    MyArchiveQuestionItem(
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        bookTitle = bookTitle,
        date = date,
        priority = priority,
        text = text,
        draftThought = draftThought,
    )

fun MyArchiveReviewResult.toWebDto() =
    MyArchiveReviewItem(
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        bookTitle = bookTitle,
        date = date,
        kind = kind,
        text = text,
    )

fun MemberArchiveSessionDetailResult.toWebDto() =
    MemberArchiveSessionDetailResponse(
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        title = title,
        bookTitle = bookTitle,
        bookAuthor = bookAuthor,
        bookImageUrl = bookImageUrl,
        date = date,
        locationLabel = locationLabel,
        attendance = attendance,
        total = total,
        state = state,
        myAttendanceStatus = myAttendanceStatus,
        isHost = isHost,
        publicSummary = publicSummary,
        publicHighlights = publicHighlights.map { it.toWebDto() },
        clubQuestions = clubQuestions.map { it.toWebDto() },
        clubOneLiners = clubOneLiners.map { it.toWebDto() },
        publicOneLiners = publicOneLiners.map { it.toWebDto() },
        myQuestions = myQuestions.map { it.toWebDto() },
        myCheckin = myCheckin?.toWebDto(),
        myOneLineReview = myOneLineReview?.toWebDto(),
        myLongReview = myLongReview?.toWebDto(),
        feedbackDocument = feedbackDocument.toWebDto(),
    )

fun MemberArchiveHighlightResult.toWebDto() =
    MemberArchiveHighlightItem(
        text = text,
        sortOrder = sortOrder,
        authorName = authorName,
        authorShortName = authorShortName,
    )

fun MemberArchiveQuestionResult.toWebDto() =
    MemberArchiveQuestionItem(
        priority = priority,
        text = text,
        draftThought = draftThought,
        authorName = authorName,
        authorShortName = authorShortName,
    )

fun MemberArchiveCheckinResult.toWebDto() =
    MemberArchiveCheckinItem(
        readingProgress = readingProgress,
    )

fun MemberArchiveOneLinerResult.toWebDto() =
    MemberArchiveOneLinerItem(
        authorName = authorName,
        authorShortName = authorShortName,
        text = text,
    )

fun MemberArchiveOneLineReviewResult.toWebDto() =
    MemberArchiveOneLineReview(
        text = text,
    )

fun MemberArchiveLongReviewResult.toWebDto() =
    MemberArchiveLongReview(
        body = body,
    )

fun MemberArchiveFeedbackDocumentStatusResult.toWebDto() =
    MemberArchiveFeedbackDocumentStatus(
        available = available,
        readable = readable,
        lockedReason = lockedReason,
        title = title,
        uploadedAt = uploadedAt,
    )

fun MyPageResult.toWebDto() =
    MyPageResponse(
        displayName = displayName,
        accountName = accountName,
        email = email,
        role = role,
        membershipStatus = membershipStatus,
        clubName = clubName,
        joinedAt = joinedAt,
        sessionCount = sessionCount,
        totalSessionCount = totalSessionCount,
        recentAttendances = recentAttendances.map { it.toWebDto() },
    )

fun MyRecentAttendanceResult.toWebDto() =
    MyRecentAttendanceItem(
        sessionNumber = sessionNumber,
        attended = attended,
    )
