package com.readmates.archive.adapter.`in`.web

import com.readmates.archive.application.port.`in`.GetMyPageSummaryUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/app/me")
class MyPageController(
    private val getMyPageSummaryUseCase: GetMyPageSummaryUseCase,
) {
    @GetMapping
    fun me(currentMember: CurrentMember): MyPageResponse =
        getMyPageSummaryUseCase.getMyPageSummary(currentMember).toWebDto()
}
