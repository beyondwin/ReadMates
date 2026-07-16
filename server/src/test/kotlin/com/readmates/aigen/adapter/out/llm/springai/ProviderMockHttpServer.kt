package com.readmates.aigen.adapter.out.llm.springai

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

internal class ProviderMockHttpServer private constructor(
    private val server: HttpServer,
    private val executor: java.util.concurrent.ExecutorService,
    private val response: Response,
) : AutoCloseable {
    private val count = AtomicInteger()
    private val bodies = CopyOnWriteArrayList<String>()

    val baseUrl: String = "http://127.0.0.1:${server.address.port}/v1"
    val requestCount: Int get() = count.get()
    val requestBodies: List<String> get() = bodies.toList()

    init {
        server.createContext("/v1/chat/completions", ::handle)
        server.executor = executor
        server.start()
    }

    private fun handle(exchange: HttpExchange) {
        exchange.use {
            count.incrementAndGet()
            bodies += exchange.requestBody.readAllBytes().toString(StandardCharsets.UTF_8)
            if (!response.delay.isZero) {
                Thread.sleep(response.delay)
            }
            val bytes = response.body.toByteArray(StandardCharsets.UTF_8)
            exchange.responseHeaders.add("Content-Type", response.contentType)
            runCatching {
                exchange.sendResponseHeaders(response.status, bytes.size.toLong())
                exchange.responseBody.write(bytes)
            }
        }
    }

    override fun close() {
        server.stop(0)
        executor.shutdownNow()
    }

    data class Response(
        val status: Int,
        val body: String,
        val contentType: String = "application/json",
        val delay: Duration = Duration.ZERO,
    )

    companion object {
        fun start(response: Response): ProviderMockHttpServer {
            val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
            val executor = Executors.newCachedThreadPool()
            return ProviderMockHttpServer(server, executor, response)
        }
    }
}
