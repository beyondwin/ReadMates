package com.readmates.aigen.application.port.out

fun interface AiTraceContextPort {
    fun currentTraceId(): String?
}
