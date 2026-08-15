package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.port.out.DeployLedgerPort
import com.readmates.admin.health.application.port.out.OutboundResilienceHealthPort
import com.readmates.admin.health.application.port.out.PlatformAdminHealthLocalReadingsPort
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.application.service.HealthCardProvider
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.ComponentScan
import org.springframework.context.annotation.Configuration
import org.springframework.context.annotation.FilterType
import org.springframework.stereotype.Component
import java.lang.reflect.Modifier
import java.time.Clock

private const val PROVIDER_PACKAGE = "com.readmates.admin.health.application.service.providers"

class PlatformHealthProviderIdentityTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(ProviderInventoryTestConfiguration::class.java)
            .withBean(PrometheusQueryPort::class.java, { mock(PrometheusQueryPort::class.java) })
            .withBean(DeployLedgerPort::class.java, { mock(DeployLedgerPort::class.java) })
            .withBean(
                PlatformAdminHealthLocalReadingsPort::class.java,
                { mock(PlatformAdminHealthLocalReadingsPort::class.java) },
            ).withBean(OutboundResilienceHealthPort::class.java, { mock(OutboundResilienceHealthPort::class.java) })
            .withBean(Clock::class.java, { Clock.systemUTC() })

    @Test
    fun `component scanned production provider inventory is a bijection with typed identities`() {
        contextRunner.run { context ->
            assertThat(context).hasNotFailed()
            val providers = context.getBeansOfType(HealthCardProvider::class.java).values

            assertThat(providers).hasSize(PlatformHealthProvider.entries.size)
            assertThat(providers.map(HealthCardProvider::identity)).doesNotHaveDuplicates()
            assertThat(providers.map(HealthCardProvider::identity))
                .containsExactlyInAnyOrderElementsOf(PlatformHealthProvider.entries)
            assertThat(providers).allSatisfy { provider ->
                assertThat(provider.javaClass.packageName).isEqualTo(PROVIDER_PACKAGE)
                assertThat(provider.javaClass.isAnnotationPresent(Component::class.java)).isTrue()
                assertThat(provider.javaClass.isInterface).isFalse()
                assertThat(Modifier.isAbstract(provider.javaClass.modifiers)).isFalse()
            }
        }
    }
}

@Configuration(proxyBeanMethods = false)
@ComponentScan(
    basePackages = [PROVIDER_PACKAGE],
    excludeFilters =
        [
            ComponentScan.Filter(
                type = FilterType.ASSIGNABLE_TYPE,
                classes = [ProviderInventoryTestConfiguration::class],
            ),
        ],
)
private class ProviderInventoryTestConfiguration
