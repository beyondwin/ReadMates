package com.readmates.club.application.model

import java.time.OffsetDateTime
import java.util.UUID

data class AdminClubOperationsSnapshot(
    val schema: String = "admin.club_operations_snapshot.v1",
    val generatedAt: OffsetDateTime,
    val club: AdminClubOperationsClub,
    val readiness: AdminClubReadinessSummary,
    val memberActivity: AdminClubMemberActivity,
    val sessionProgress: AdminClubSessionProgress,
    val notificationHealth: AdminClubNotificationHealth,
    val aiUsage: AdminClubAiUsage,
    val safeLinks: List<AdminClubSafeLink>,
)

data class AdminClubOperationsClub(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val status: String,
    val publicVisibility: String,
)

data class AdminClubReadinessSummary(
    val state: String,
    val blockingReasons: List<String>,
    val nextAction: String?,
)

data class AdminClubMemberActivity(
    val activeCount: Int,
    val dormantCount: Int,
    val pendingViewerCount: Int,
    val hostCount: Int,
)

data class AdminClubSessionProgress(
    val upcomingCount: Int,
    val currentOpenCount: Int,
    val closedCount: Int,
    val publishedRecordCount: Int,
    val incompleteRecordCount: Int,
)

data class AdminClubNotificationHealth(
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val lastSuccessAt: OffsetDateTime?,
    val failureClusters: List<AdminClubNotificationFailureCluster>,
    val recentFailed7d: Int = 0,
    val priorFailed7d: Int = 0,
)

data class AdminClubNotificationFailureCluster(
    val safeErrorCode: String,
    val count: Int,
)

data class AdminClubAiUsage(
    val activeJobs: Int,
    val failedRecentJobs: Int,
    val staleCandidates: Int,
    val costEstimateUsd: String,
    val state: String,
    val priorFailedJobs7d: Int = 0,
)

data class AdminClubSafeLink(
    val label: String,
    val href: String,
    val kind: String,
)
