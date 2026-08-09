package com.readmates.admin.health.config

import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.scheduling.concurrent.ExecutorConfigurationSupport
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import tools.jackson.databind.ObjectMapper
import java.time.Duration
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class PlatformAdminHealthExecutorTest {
    @Test
    fun `rejects a third task immediately when its sole worker and queue slot are occupied`() {
        withExecutor(threads = 1, queueCapacity = 1) { executor ->
            val workerStarted = CountDownLatch(1)
            val releaseWorker = CountDownLatch(1)
            val queuedTaskRan = CountDownLatch(1)
            val rejectedTaskThread = AtomicReference<Thread?>()

            try {
                executor.execute {
                    workerStarted.countDown()
                    check(releaseWorker.await(1, TimeUnit.SECONDS)) { "Test did not release the occupied worker" }
                }
                assertThat(workerStarted.await(1, TimeUnit.SECONDS)).isTrue()

                executor.execute { queuedTaskRan.countDown() }

                assertThatThrownBy {
                    executor.execute { rejectedTaskThread.set(Thread.currentThread()) }
                }.isInstanceOf(RejectedExecutionException::class.java)

                assertThat(rejectedTaskThread.get()).isNull()
                assertThat(queuedTaskRan.count).isEqualTo(1)
            } finally {
                releaseWorker.countDown()
                assertThat(queuedTaskRan.await(1, TimeUnit.SECONDS)).isTrue()
            }
        }
    }

    @Test
    fun `uses the configured fixed-size bounded executor lifecycle and daemon worker policy`() {
        withExecutor(threads = 2, queueCapacity = 3, shutdownAwait = Duration.ofMillis(1_234)) { rawExecutor ->
            assertThat(rawExecutor).isInstanceOf(ThreadPoolTaskExecutor::class.java)
            val executor = rawExecutor as ThreadPoolTaskExecutor
            val workersStarted = CountDownLatch(2)
            val releaseWorkers = CountDownLatch(1)
            val workerThreads = mutableListOf<Thread>()

            try {
                repeat(2) {
                    executor.execute {
                        synchronized(workerThreads) { workerThreads += Thread.currentThread() }
                        workersStarted.countDown()
                        check(releaseWorkers.await(1, TimeUnit.SECONDS)) { "Test did not release the health worker" }
                    }
                }
                assertThat(workersStarted.await(1, TimeUnit.SECONDS)).isTrue()

                val pool = executor.threadPoolExecutor
                assertThat(executor.corePoolSize).isEqualTo(2)
                assertThat(executor.maxPoolSize).isEqualTo(2)
                assertThat(executor.queueCapacity).isEqualTo(3)
                assertThat(pool.rejectedExecutionHandler).isInstanceOf(ThreadPoolExecutor.AbortPolicy::class.java)
                assertThat(readField<Boolean>(executor, "waitForTasksToCompleteOnShutdown")).isTrue()
                assertThat(readField<Long>(executor, "awaitTerminationMillis")).isEqualTo(1_234L)

                assertThat(workerThreads).allSatisfy { thread ->
                    assertThat(thread.name).startsWith("platform-admin-health-")
                    assertThat(thread.name.removePrefix("platform-admin-health-")).isNotBlank()
                    assertThat(thread.isDaemon).isTrue()
                }
                assertThat(workerThreads.map(Thread::getName)).doesNotHaveDuplicates()
            } finally {
                releaseWorkers.countDown()
            }
        }
    }

    @Test
    fun `invalid executor properties prevent the health executor bean from being created`() {
        ExecutorCreationProbe.executorCreated.set(false)
        ApplicationContextRunner()
            .withUserConfiguration(PlatformAdminHealthConfig::class.java, ExecutorCreationProbe::class.java)
            .withBean(ObjectMapper::class.java, { ObjectMapper() })
            .withPropertyValues("readmates.admin.health.executor.queue-capacity=0")
            .run { context ->
                assertThat(context).hasFailed()
                assertThat(ExecutorCreationProbe.executorCreated.get()).isFalse()
            }
    }

    private fun withExecutor(
        threads: Int,
        queueCapacity: Int,
        shutdownAwait: Duration = Duration.ofSeconds(5),
        assertion: (Executor) -> Unit,
    ) {
        ApplicationContextRunner()
            .withUserConfiguration(PlatformAdminHealthConfig::class.java)
            .withBean(ObjectMapper::class.java, { ObjectMapper() })
            .withPropertyValues(
                "readmates.admin.health.executor.threads=$threads",
                "readmates.admin.health.executor.queue-capacity=$queueCapacity",
                "readmates.admin.health.executor.shutdown-await=${shutdownAwait.toMillis()}ms",
            ).run { context ->
                assertThat(context).hasNotFailed()
                assertion(context.getBean("platformAdminHealthExecutor", Executor::class.java))
            }
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> readField(
        executor: ThreadPoolTaskExecutor,
        fieldName: String,
    ): T {
        val field = ExecutorConfigurationSupport::class.java.getDeclaredField(fieldName)
        field.trySetAccessible()
        return field.get(executor) as T
    }

    @org.springframework.context.annotation.Configuration(proxyBeanMethods = false)
    class ExecutorCreationProbe {
        companion object {
            val executorCreated = AtomicReference(false)

            @JvmStatic
            @org.springframework.context.annotation.Bean
            fun executorCreationProbe(): org.springframework.beans.factory.config.BeanPostProcessor =
                object : org.springframework.beans.factory.config.BeanPostProcessor {
                    override fun postProcessAfterInitialization(
                        bean: Any,
                        beanName: String,
                    ): Any {
                        if (bean is ThreadPoolTaskExecutor) {
                            executorCreated.set(true)
                        }
                        return bean
                    }
                }
        }
    }
}
