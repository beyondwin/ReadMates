package com.readmates.aigen.config

import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import jakarta.annotation.PostConstruct
import org.springframework.beans.factory.ListableBeanFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/**
 * Guards against the AIGEN_ENABLED=true + KAFKA_ENABLED=false combination that
 * crashed the v1.10.1 boot with an opaque "No qualifying bean of type
 * 'AiGenerationJobQueue'" message. The only production queue implementation
 * (KafkaAiGenerationJobProducer) is @ConditionalOnProperty on
 * readmates.aigen.kafka.enabled, so disabling Kafka while the orchestrator is
 * still wired in produces a startup failure with no actionable hint.
 *
 * We check for an actual AiGenerationJobQueue bean — not just the kafka
 * property flag — so that narrow integration tests which enable AIGEN and
 * supply their own queue (e.g. via @MockitoBean) still boot cleanly.
 */
@Component
class AiGenerationConfigValidator(
    @param:Value("\${readmates.aigen.enabled:false}") private val aigenEnabled: Boolean,
    private val beanFactory: ListableBeanFactory,
) {
    @PostConstruct
    fun validate() {
        if (!aigenEnabled) return
        val queueBeans = beanFactory.getBeanNamesForType(AiGenerationJobQueue::class.java)
        check(queueBeans.isNotEmpty()) {
            "readmates.aigen.enabled=true but no AiGenerationJobQueue bean is wired. " +
                "The default implementation (KafkaAiGenerationJobProducer) is conditional on " +
                "readmates.aigen.kafka.enabled, so enabling AIGEN without it produces a " +
                "missing-bean error at boot. " +
                "Set READMATES_AIGEN_KAFKA_ENABLED=true (with READMATES_AIGEN_KAFKA_BOOTSTRAP_SERVERS) " +
                "or set READMATES_AIGEN_ENABLED=false."
        }
    }
}
