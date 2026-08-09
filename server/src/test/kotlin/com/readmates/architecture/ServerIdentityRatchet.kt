package com.readmates.architecture

fun requireApprovedIdentityPartition(
    current: Set<String>,
    retired: Set<String>,
    approvedSeed: Set<String>,
    ceiling: Int,
    label: String,
) {
    require(approvedSeed.size == ceiling) {
        "$label approved Phase 0 seed must stay fixed at $ceiling identities, but contained ${approvedSeed.size}"
    }
    val unapprovedCurrent = current - approvedSeed
    require(unapprovedCurrent.isEmpty()) {
        "$label contains current identities outside the approved Phase 0 seed: " +
            unapprovedCurrent.sorted().joinToString()
    }
    val unapprovedRetired = retired - approvedSeed
    require(unapprovedRetired.isEmpty()) {
        "$label contains retired identities outside the approved Phase 0 seed: " +
            unapprovedRetired.sorted().joinToString()
    }
    val reintroduced = current intersect retired
    require(reintroduced.isEmpty()) {
        "$label contains identities in both current and retired sets: ${reintroduced.sorted().joinToString()}"
    }
    val unaccounted = approvedSeed - (current union retired)
    require(unaccounted.isEmpty()) {
        "$label removed approved identities without retiring them: ${unaccounted.sorted().joinToString()}"
    }
}
