package com.readmates.aigen.application.service

import java.time.Duration

/**
 * Indirection over `Thread.sleep` so retry-loop tests don't have to actually wait.
 * The default implementation just calls `Thread.sleep`.
 */
fun interface Sleeper {
    fun sleep(duration: Duration)

    companion object {
        val Default: Sleeper = Sleeper { duration -> Thread.sleep(duration.toMillis()) }
    }
}
