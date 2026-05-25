package com.readmates.admin.health.application.port.out

import com.readmates.admin.health.application.model.DeployAttemptStripEntry

interface DeployLedgerPort {
    fun tailLatestAttempts(limit: Int): List<DeployAttemptStripEntry>
}
