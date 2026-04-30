package com.readmates.note.application.model

data class NoteFeedResult(
    val itemId: String = "",
    val createdAt: String = "",
    val sourceOrder: Int = 0,
    val itemOrder: Int = 0,
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String,
    val authorName: String?,
    val authorShortName: String?,
    val kind: String,
    val text: String,
)

data class NoteSessionResult(
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
