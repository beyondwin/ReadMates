package com.readmates.club.application.port.out

interface LoadPlatformAdminSummaryPort {
    fun countActiveClubs(): Long
    fun countDomainsRequiringAction(): Long
}
