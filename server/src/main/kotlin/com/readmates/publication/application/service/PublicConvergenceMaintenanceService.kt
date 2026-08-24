package com.readmates.publication.application.service

import com.readmates.publication.application.port.`in`.MaintainPublicConvergenceWorkUseCase
import com.readmates.publication.application.port.out.PublicConvergencePort
import com.readmates.publication.config.PublicConvergenceProperties
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.concurrent.atomic.AtomicLong

@Service
class PublicConvergenceMaintenanceService(
    private val convergencePort: PublicConvergencePort,
    private val properties: PublicConvergenceProperties,
    meterRegistry: MeterRegistry,
    private val clock: Clock,
) : MaintainPublicConvergenceWorkUseCase {
    private val backlog = AtomicLong(0)
    private val purged = meterRegistry.counter(PURGED_METRIC)

    init {
        Gauge
            .builder(BACKLOG_METRIC, backlog) { value -> value.get().toDouble() }
            .register(meterRegistry)
    }

    @Transactional
    override fun purgeExpiredWork(): Int {
        val now = clock.instant()
        val count =
            convergencePort.purgeExpiredWork(
                createdBefore = now.minus(properties.maintenance.retention),
                now = now,
                limit = properties.maintenance.batchSize,
            )
        purged.increment(count.toDouble())
        backlog.set(convergencePort.countWorkBacklog())
        return count
    }

    private companion object {
        const val PURGED_METRIC = "readmates.public.convergence.work.purged"
        const val BACKLOG_METRIC = "readmates.public.convergence.work.backlog"
    }
}
