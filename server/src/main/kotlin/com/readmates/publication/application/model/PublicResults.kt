package com.readmates.publication.application.model

const val LEGACY_PUBLIC_CLUB_SLUG = "reading-sai"

data class PublicClubResult(
    val clubName: String,
    val tagline: String,
    val about: String,
    val stats: PublicClubStatsResult,
    val recentSessions: List<PublicSessionSummaryResult>,
)

data class PublicClubStatsResult(
    val sessions: Int,
    val books: Int,
    val members: Int,
)

data class PublicSessionSummaryResult(
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

data class PublicSessionDetailResult(
    val sessionId: String,
    val sessionNumber: Int,
    val bookTitle: String,
    val bookAuthor: String,
    val bookImageUrl: String?,
    val date: String,
    val summary: String,
    val highlights: List<PublicHighlightResult>,
    val oneLiners: List<PublicOneLinerResult>,
)

data class PublicHighlightResult(
    val text: String,
    val sortOrder: Int,
    val authorName: String?,
    val authorShortName: String?,
)

data class PublicOneLinerResult(
    val authorName: String,
    val authorShortName: String,
    val text: String,
)
