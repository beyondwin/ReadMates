package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.PendingApprovalAppResponse
import com.readmates.auth.application.port.`in`.GetPendingApprovalUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping(path = ["/api/app/pending", "/api/app/viewer"])
class PendingApprovalController(
    private val pendingApproval: GetPendingApprovalUseCase,
) {
    @GetMapping
    fun get(currentMember: CurrentMember): PendingApprovalAppResponse =
        pendingApproval.get(currentMember)
}
