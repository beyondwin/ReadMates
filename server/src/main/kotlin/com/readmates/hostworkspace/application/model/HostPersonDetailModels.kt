package com.readmates.hostworkspace.application.model

import java.time.Instant
import java.time.LocalDateTime
import java.util.UUID

enum class HostPersonMembershipStatus { INVITED, VIEWER, ACTIVE, SUSPENDED, LEFT, INACTIVE }

enum class HostPersonMembershipRole { MEMBER, HOST }

enum class HostPersonRsvpStatus { NO_RESPONSE, GOING, MAYBE, DECLINED }

enum class HostPersonAttendanceStatus { UNKNOWN, ATTENDED, ABSENT }

data class HostPersonActor(
    val clubId: UUID,
    val hostMembershipId: UUID,
    val activeHost: Boolean,
)

data class HostPersonAttendanceTuple(
    val scheduledAt: LocalDateTime,
    val sessionNumber: Int,
    val sessionId: UUID,
)

data class HostPersonCursorAnchor(
    val evaluatedAt: Instant,
    val expiry: Instant,
    val last: HostPersonAttendanceTuple?,
)

data class HostPersonDetailRequest(
    val actor: HostPersonActor,
    val targetMembershipId: UUID,
    val limit: Int,
    val cursor: HostPersonCursorAnchor,
)

data class HostPersonDetailQuery(
    val clubId: UUID,
    val targetMembershipId: UUID,
    val evaluatedAt: Instant,
    val after: HostPersonAttendanceTuple?,
    val fetchLimit: Int,
)

data class HostPersonSchedule(
    val state: String,
    val scheduleRevision: Long,
    val scheduledAt: LocalDateTime,
)

data class HostPersonAttendanceItem(
    val sessionNumber: Int,
    val scheduledAt: LocalDateTime,
    val attendanceStatus: HostPersonAttendanceStatus,
    val tuple: HostPersonAttendanceTuple,
)

data class HostPersonDetailProjection(
    val membershipId: UUID,
    val displayName: String,
    val avatarKey: String,
    val status: HostPersonMembershipStatus,
    val role: HostPersonMembershipRole,
    val lastClubAccessAt: Instant?,
    val currentSchedule: HostPersonSchedule?,
    val currentRsvp: HostPersonRsvpStatus?,
    val attendanceItems: List<HostPersonAttendanceItem>,
)

data class HostPersonAttendanceHistoryPage(
    val items: List<HostPersonAttendanceItem>,
    val next: HostPersonAttendanceTuple?,
)

data class HostPersonDetail(
    val membershipId: UUID,
    val displayName: String,
    val avatarKey: String,
    val status: HostPersonMembershipStatus,
    val role: HostPersonMembershipRole,
    val lastClubAccessAt: Instant?,
    val currentSchedule: HostPersonSchedule?,
    val currentRsvp: HostPersonRsvpStatus?,
    val attendanceHistory: HostPersonAttendanceHistoryPage,
)

class HostPersonDetailAccessDeniedException : RuntimeException("Active host required")

class HostPersonDetailNotFoundException : RuntimeException("Host person not found")

class HostPersonInvalidRequestException : IllegalArgumentException("Invalid host person request")

class HostPersonInvalidCursorException : IllegalArgumentException("Invalid host person cursor")

const val HOST_PERSON_MAX_PAGE_SIZE = 100
