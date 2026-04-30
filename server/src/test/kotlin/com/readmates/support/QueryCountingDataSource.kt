package com.readmates.support

import org.springframework.beans.BeansException
import org.springframework.beans.factory.config.BeanPostProcessor
import java.io.PrintWriter
import java.lang.reflect.InvocationHandler
import java.lang.reflect.InvocationTargetException
import java.lang.reflect.Proxy
import java.sql.Connection
import java.util.logging.Logger
import javax.sql.DataSource

object QueryCounter {
    private val counts = ThreadLocal.withInitial { 0 }

    fun reset() {
        counts.set(0)
    }

    fun count(): Int = counts.get()

    internal fun increment() {
        counts.set(count() + 1)
    }
}

class QueryCountingDataSource(
    private val delegate: DataSource,
) : DataSource {
    override fun getConnection(): Connection =
        delegate.connection.countPrepareStatements()

    override fun getConnection(username: String?, password: String?): Connection =
        delegate.getConnection(username, password).countPrepareStatements()

    override fun getLogWriter(): PrintWriter? = delegate.logWriter

    override fun setLogWriter(out: PrintWriter?) {
        delegate.logWriter = out
    }

    override fun setLoginTimeout(seconds: Int) {
        delegate.loginTimeout = seconds
    }

    override fun getLoginTimeout(): Int = delegate.loginTimeout

    override fun getParentLogger(): Logger = delegate.parentLogger

    override fun <T : Any?> unwrap(iface: Class<T>): T = delegate.unwrap(iface)

    override fun isWrapperFor(iface: Class<*>): Boolean = delegate.isWrapperFor(iface)

    private fun Connection.countPrepareStatements(): Connection {
        val target = this
        return Proxy.newProxyInstance(
            target.javaClass.classLoader,
            arrayOf(Connection::class.java),
            InvocationHandler { _, method, args ->
                if (method.name == "prepareStatement") {
                    QueryCounter.increment()
                }
                try {
                    method.invoke(target, *(args ?: emptyArray()))
                } catch (exception: InvocationTargetException) {
                    throw exception.targetException
                }
            },
        ) as Connection
    }
}

class QueryCountingDataSourcePostProcessor : BeanPostProcessor {
    @Throws(BeansException::class)
    override fun postProcessAfterInitialization(bean: Any, beanName: String): Any {
        if (bean is DataSource && bean !is QueryCountingDataSource) {
            return QueryCountingDataSource(bean)
        }
        return bean
    }
}
