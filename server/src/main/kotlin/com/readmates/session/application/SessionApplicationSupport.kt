package com.readmates.session.application

import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember

internal fun requireHost(member: CurrentMember) {
    if (!member.isHost) {
        throw AccessDeniedException("Host role required")
    }
}

internal fun shortNameFor(displayName: String): String = when (displayName) {
    "김호스트" -> "호스트"
    "안멤버1" -> "멤버1"
    "최멤버2" -> "멤버2"
    "김멤버3" -> "멤버3"
    "송멤버4" -> "멤버4"
    "이멤버5" -> "멤버5"
    else -> displayName
}

class CurrentSessionNotOpenException : RuntimeException("No open current session")

class OpenSessionAlreadyExistsException : RuntimeException("Open session already exists")

class HostSessionNotFoundException : RuntimeException("Host session not found")

class HostSessionParticipantNotFoundException : RuntimeException("Host session participant not found")

class HostSessionDeletionNotAllowedException : RuntimeException("Only open sessions can be deleted")

class HostSessionOpenNotAllowedException : RuntimeException("Only draft sessions can be opened")

class HostSessionCloseNotAllowedException : RuntimeException("Only open sessions can be closed")

class HostSessionPublishNotAllowedException : RuntimeException(
    "Only closed sessions with member-visible publication can be published",
)

class InvalidMembershipIdException : RuntimeException("Invalid membership id")

class InvalidSessionScheduleException : RuntimeException("Session end time must be after start time")

class InvalidQuestionSetException : RuntimeException("Questions must include up to 5 non-empty items")
