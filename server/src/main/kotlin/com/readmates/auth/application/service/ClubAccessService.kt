package com.readmates.auth.application.service

import com.readmates.auth.application.AuthApplicationError
import com.readmates.auth.application.AuthApplicationException
import com.readmates.auth.application.model.ClubAccessResult
import com.readmates.auth.application.model.TouchClubAccessCommand
import com.readmates.auth.application.port.`in`.TouchClubAccessUseCase
import com.readmates.auth.application.port.out.ClubAccessPort
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class ClubAccessService(
    private val clubAccessPort: ClubAccessPort,
) : TouchClubAccessUseCase {
    @Transactional
    override fun touch(command: TouchClubAccessCommand): ClubAccessResult {
        val member = command.member
        if (!member.canBrowseMemberContent) {
            throw AuthApplicationException(AuthApplicationError.PENDING_APPROVAL_REQUIRED, "Club access is unavailable")
        }
        val storedAt =
            clubAccessPort.touch(member.membershipId, member.clubId)
                ?: throw AuthApplicationException(
                    AuthApplicationError.PENDING_APPROVAL_REQUIRED,
                    "Club access is unavailable",
                )
        return ClubAccessResult(lastClubAccessAt = storedAt)
    }
}
