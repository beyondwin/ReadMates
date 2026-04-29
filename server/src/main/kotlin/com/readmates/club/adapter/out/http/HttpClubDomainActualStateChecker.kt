package com.readmates.club.adapter.out.http

import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.port.out.CheckClubDomainActualStatePort
import com.readmates.club.domain.ClubDomainStatus
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import tools.jackson.databind.json.JsonMapper
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.UnknownHostException
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import kotlin.text.Charsets.UTF_8

internal data class MarkerHttpResult(
    val statusCode: Int,
    val body: String? = null,
    val bodyTooLarge: Boolean = false,
)

@Component
class HttpClubDomainActualStateChecker @Autowired constructor(
    @param:Value("\${readmates.club-domain-check.timeout:5s}")
    private val timeout: Duration,
) : CheckClubDomainActualStatePort {
    private val objectMapper = JsonMapper.builder().build()
    private val client: HttpClient = HttpClient.newBuilder()
        .connectTimeout(timeout)
        .followRedirects(HttpClient.Redirect.NEVER)
        .build()
    private var addressResolver: (String) -> Array<InetAddress> = InetAddress::getAllByName
    private var markerFetcher: (URI) -> MarkerHttpResult = ::fetchMarker

    internal constructor(
        timeout: Duration,
        addressResolver: (String) -> Array<InetAddress>,
        markerFetcher: (URI) -> MarkerHttpResult,
    ) : this(timeout) {
        this.addressResolver = addressResolver
        this.markerFetcher = markerFetcher
    }

    override fun check(hostname: String): ClubDomainActualCheckResult {
        val uri = try {
            URI.create("https://$hostname$MARKER_PATH")
        } catch (_: IllegalArgumentException) {
            return failed("DOMAIN_CHECK_INVALID_HOSTNAME")
        }
        val host = uri.host ?: return failed("DOMAIN_CHECK_INVALID_HOSTNAME")
        val addressCheckError = addressCheckError(host)
        if (addressCheckError != null) {
            return failed(addressCheckError)
        }

        val marker = try {
            markerFetcher(uri)
        } catch (_: Exception) {
            return failed("DOMAIN_CHECK_UNREACHABLE")
        }

        if (marker.statusCode in 300..399) {
            return failed("DOMAIN_CHECK_REDIRECT")
        }
        if (marker.bodyTooLarge) {
            return failed("DOMAIN_CHECK_RESPONSE_TOO_LARGE")
        }
        if (marker.statusCode != 200) {
            return failed("DOMAIN_CHECK_HTTP_${marker.statusCode}")
        }

        return if (marker.body != null && hasReadmatesMarker(marker.body)) {
            ClubDomainActualCheckResult(status = ClubDomainStatus.ACTIVE, errorCode = null)
        } else {
            failed("DOMAIN_CHECK_MARKER_MISMATCH")
        }
    }

    private fun fetchMarker(uri: URI): MarkerHttpResult {
        val response = client.send(
            HttpRequest.newBuilder(uri)
                .timeout(timeout)
                .header("Accept", "application/json")
                .header("User-Agent", "ReadMatesDomainCheck/1")
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofInputStream(),
        )
        if (response.headers().firstValueAsLong("content-length").orElse(-1) > MAX_MARKER_BODY_BYTES) {
            response.body().close()
            return MarkerHttpResult(statusCode = response.statusCode(), bodyTooLarge = true)
        }

        response.body().use { input ->
            val bytes = input.readNBytes(MAX_MARKER_BODY_BYTES + 1)
            return if (bytes.size > MAX_MARKER_BODY_BYTES) {
                MarkerHttpResult(statusCode = response.statusCode(), bodyTooLarge = true)
            } else {
                MarkerHttpResult(statusCode = response.statusCode(), body = String(bytes, UTF_8))
            }
        }
    }

    private fun hasReadmatesMarker(body: String): Boolean {
        val root = try {
            objectMapper.readTree(body)
        } catch (_: Exception) {
            return false
        }

        return root.path("service").asString() == "readmates" &&
            root.path("surface").asString() == "cloudflare-pages" &&
            root.path("version").asInt() == 1
    }

    private fun failed(errorCode: String): ClubDomainActualCheckResult =
        ClubDomainActualCheckResult(status = ClubDomainStatus.FAILED, errorCode = errorCode)

    private fun addressCheckError(hostname: String): String? {
        val addresses = try {
            addressResolver(hostname)
        } catch (_: UnknownHostException) {
            return "DOMAIN_CHECK_DNS_FAILED"
        }
        return if (addresses.any(::isPrivateAddress)) {
            "DOMAIN_CHECK_PRIVATE_ADDRESS"
        } else {
            null
        }
    }

    private fun isPrivateAddress(address: InetAddress): Boolean =
        address.isAnyLocalAddress ||
            address.isLoopbackAddress ||
            address.isLinkLocalAddress ||
            address.isSiteLocalAddress ||
            address.isMulticastAddress ||
            isUniqueLocalIpv6(address)

    private fun isUniqueLocalIpv6(address: InetAddress): Boolean =
        address is Inet6Address && (address.address[0].toInt() and 0xfe) == 0xfc

    companion object {
        const val MARKER_PATH = "/.well-known/readmates-domain-check.json"
        private const val MAX_MARKER_BODY_BYTES = 4096
    }
}
