package com.readmates.admin.health.adapter.out.prometheus

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.method
import org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo
import org.springframework.test.web.client.response.MockRestResponseCreators.withStatus
import org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess
import org.springframework.web.client.RestClient
import java.io.IOException
import java.time.Duration

class HttpPrometheusQueryAdapterTest {
    @Test
    fun `parses instant vector with single value`() {
        val (adapter, server) = newAdapter()
        server
            .expect(method(HttpMethod.GET))
            .andExpect(requestTo(org.hamcrest.Matchers.containsString("api/v1/query")))
            .andRespond(
                withSuccess(
                    """
                    {"status":"success","data":{"resultType":"vector","result":[
                       {"metric":{"provider":"CLAUDE"},"value":[1717000000,"0.97"]}
                    ]}}
                    """.trimIndent(),
                    MediaType.APPLICATION_JSON,
                ),
            )

        val result = adapter.query("sum by (provider) (rate(readmates_aigen_jobs_completed_total[5m]))")

        assertThat(result.values).hasSize(1)
        assertThat(result.values[0].labels).containsEntry("provider", "CLAUDE")
        assertThat(result.values[0].value).isEqualTo(0.97)
        server.verify()
    }

    @Test
    fun `returns empty values when prometheus returns no data`() {
        val (adapter, server) = newAdapter()
        server
            .expect(method(HttpMethod.GET))
            .andRespond(
                withSuccess(
                    """{"status":"success","data":{"resultType":"vector","result":[]}}""",
                    MediaType.APPLICATION_JSON,
                ),
            )

        val result = adapter.query("up")
        assertThat(result.values).isEmpty()
        server.verify()
    }

    @Test
    fun `sends label selector braces as query value without template expansion`() {
        val (adapter, server) = newAdapter()
        server
            .expect(method(HttpMethod.GET))
            .andExpect(requestTo(org.hamcrest.Matchers.containsString("consumer_group")))
            .andRespond(
                withSuccess(
                    """{"status":"success","data":{"resultType":"vector","result":[]}}""",
                    MediaType.APPLICATION_JSON,
                ),
            )

        val result = adapter.query("""kafka_consumergroup_lag{consumer_group="readmates-aigen-worker"}""")

        assertThat(result.values).isEmpty()
        server.verify()
    }

    @Test
    fun `throws when prometheus returns non-200`() {
        val (adapter, server) = newAdapter()
        server
            .expect(method(HttpMethod.GET))
            .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR).body("boom"))

        try {
            adapter.query("up")
            throw AssertionError("expected exception")
        } catch (ex: PrometheusQueryException) {
            assertThat(ex.message).contains("500")
        }
        server.verify()
    }

    @Test
    fun `wraps network failures`() {
        val (adapter, server) = newAdapter()
        server
            .expect(method(HttpMethod.GET))
            .andRespond { throw IOException("network down") }

        try {
            adapter.query("up")
            throw AssertionError("expected exception")
        } catch (ex: PrometheusQueryException) {
            assertThat(ex.message).contains("prometheus unavailable")
        }
        server.verify()
    }

    private fun newAdapter(): Pair<HttpPrometheusQueryAdapter, MockRestServiceServer> {
        val builder = RestClient.builder().baseUrl("http://prometheus.test/")
        val server = MockRestServiceServer.bindTo(builder).build()
        val adapter = HttpPrometheusQueryAdapter(builder.build(), Duration.ofSeconds(5))
        return adapter to server
    }
}
