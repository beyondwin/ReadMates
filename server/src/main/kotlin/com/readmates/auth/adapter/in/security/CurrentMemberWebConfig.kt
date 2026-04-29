package com.readmates.auth.adapter.`in`.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import org.springframework.context.annotation.Configuration
import org.springframework.web.method.support.HandlerMethodArgumentResolver
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

@Configuration
class CurrentMemberWebConfig(
    private val resolveCurrentMemberUseCase: ResolveCurrentMemberUseCase,
    private val resolveClubContextUseCase: ResolveClubContextUseCase,
) : WebMvcConfigurer {
    override fun addArgumentResolvers(resolvers: MutableList<HandlerMethodArgumentResolver>) {
        resolvers.add(CurrentMemberArgumentResolver(resolveCurrentMemberUseCase, resolveClubContextUseCase))
        resolvers.add(CurrentPlatformAdminArgumentResolver(resolveCurrentMemberUseCase))
    }
}
