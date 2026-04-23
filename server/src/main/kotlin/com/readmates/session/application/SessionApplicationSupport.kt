package com.readmates.session.application

import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentMember
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.ResponseStatus

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

@ResponseStatus(HttpStatus.CONFLICT)
class CurrentSessionNotOpenException : RuntimeException("No open current session")

@ResponseStatus(HttpStatus.CONFLICT)
class OpenSessionAlreadyExistsException : RuntimeException("Open session already exists")

@ResponseStatus(HttpStatus.NOT_FOUND)
class HostSessionNotFoundException : RuntimeException("Host session not found")

@ResponseStatus(HttpStatus.NOT_FOUND)
class HostSessionParticipantNotFoundException : RuntimeException("Host session participant not found")

@ResponseStatus(HttpStatus.CONFLICT)
class HostSessionDeletionNotAllowedException : RuntimeException("Only open sessions can be deleted")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidMembershipIdException : RuntimeException("Invalid membership id")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidSessionScheduleException : RuntimeException("Session end time must be after start time")

@ResponseStatus(HttpStatus.BAD_REQUEST)
class InvalidQuestionSetException : RuntimeException("Questions must include 2 to 5 non-empty items")
