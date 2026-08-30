package com.readmates.auth.application.port.`in`

import com.readmates.auth.application.model.AuthAccessProjection
import java.util.UUID

interface ResolveAuthAccessProjectionUseCase {
    fun resolve(userId: UUID): AuthAccessProjection
}
