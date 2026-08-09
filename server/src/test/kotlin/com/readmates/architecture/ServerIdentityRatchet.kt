package com.readmates.architecture

fun requireApprovedIdentitySubset(
    current: Set<String>,
    approvedSeed: Set<String>,
    ceiling: Int,
    label: String,
) {
    require(approvedSeed.size == ceiling) {
        "$label approved Phase 0 seed must stay fixed at $ceiling identities, but contained ${approvedSeed.size}"
    }
    require(current.size <= ceiling) {
        "$label exceeded the approved ceiling $ceiling with ${current.size} identities"
    }
    val unapproved = current - approvedSeed
    require(unapproved.isEmpty()) {
        "$label contains identities outside the approved Phase 0 seed: ${unapproved.sorted().joinToString()}"
    }
}
