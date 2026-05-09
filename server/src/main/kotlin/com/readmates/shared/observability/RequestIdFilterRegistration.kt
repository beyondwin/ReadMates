package com.readmates.shared.observability

import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.Ordered

@Configuration
class RequestIdFilterRegistration {
    @Bean
    fun requestIdFilter(): RequestIdFilter = RequestIdFilter()

    @Bean
    fun requestIdFilterRegistrationBean(filter: RequestIdFilter) =
        FilterRegistrationBean(filter).apply {
            order = Ordered.HIGHEST_PRECEDENCE
            addUrlPatterns("/*")
        }
}
