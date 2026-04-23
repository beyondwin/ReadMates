package com.readmates.publication.adapter.`in`.web

data class PublicClubResponse(
    val clubName: String,
    val tagline: String,
    val about: String,
    val stats: PublicClubStats,
    val recentSessions: List<PublicSessionListItem>,
)

data class PublicClubStats(
    val sessions: Int,
    val books: Int,
    val members: Int,
)

data class PublicSessionListItem(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val summary: String,
    val highlightCount: Int,
    val oneLinerCount: Int,
)

data class PublicSessionDetailResponse(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val summary: String,
    val highlights: List<PublicHighlight>,
    val oneLiners: List<PublicOneLiner>,
)

data class PublicHighlight(
    val text: String,
    val sortOrder: Int,
    val authorName: String?,
    val authorShortName: String?,
)

data class PublicOneLiner(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)
