package com.readmates.note.adapter.`in`.web

import com.readmates.note.application.model.NoteFeedResult
import com.readmates.note.application.model.NoteSessionResult

data class NoteFeedItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val authorName: String?,
    val authorShortName: String?,
    val kind: String,
    val text: String,
)

data class NoteSessionItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val questionCount: Int,
    val oneLinerCount: Int,
    val longReviewCount: Int,
    val highlightCount: Int,
    val totalCount: Int,
)

internal fun NoteFeedResult.toNoteFeedItem() = NoteFeedItem(
    sessionId = sessionId,
    sessionNumber = sessionNumber,
    bookTitle = bookTitle,
    date = date,
    authorName = authorName,
    authorShortName = authorShortName,
    kind = kind,
    text = text,
)

internal fun NoteSessionResult.toNoteSessionItem() = NoteSessionItem(
    sessionId = sessionId,
    sessionNumber = sessionNumber,
    bookTitle = bookTitle,
    date = date,
    questionCount = questionCount,
    oneLinerCount = oneLinerCount,
    longReviewCount = longReviewCount,
    highlightCount = highlightCount,
    totalCount = totalCount,
)
