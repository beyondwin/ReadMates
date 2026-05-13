plugins {
    kotlin("jvm") version "2.2.0"
    kotlin("plugin.spring") version "2.2.0"
    id("org.springframework.boot") version "4.0.6"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.flywaydb.flyway") version "11.7.2"
}

group = "com.readmates"
version = "0.0.1-SNAPSHOT"

extra["netty.version"] = "4.2.13.Final"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(21))
    }
}

repositories {
    mavenCentral()
}

dependencies {
    constraints {
        implementation("org.lz4:lz4-java:1.8.1") {
            because("Trivy flags CVE-2025-12183 in lz4-java 1.8.0.")
        }
        implementation("org.springframework.security:spring-security-config:7.0.5") {
            because("Trivy flags servlet path matching vulnerabilities before Spring Security 7.0.5.")
        }
        implementation("org.springframework.security:spring-security-web:7.0.5") {
            because("Trivy flags servlet path matching vulnerabilities before Spring Security web 7.0.4.")
        }
        implementation("tools.jackson.core:jackson-core:3.1.2") {
            because("Trivy flags jackson-core 3.0.2 for high severity parser issues.")
        }
        implementation("io.netty:netty-codec-dns:4.2.13.Final") {
            because("Trivy flags CVE-2026-42579 in netty-codec-dns 4.2.12.Final.")
        }
    }

    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-jdbc")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-flyway")
    implementation("org.springframework.boot:spring-boot-starter-mail")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.kafka:spring-kafka")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("org.flywaydb:flyway-mysql")
    runtimeOnly("com.mysql:mysql-connector-j")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.springframework.kafka:spring-kafka-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:testcontainers-kafka:2.0.2")
    testImplementation("org.testcontainers:testcontainers-mysql:2.0.2")
    testImplementation("com.tngtech.archunit:archunit-junit5:1.3.0")
}

tasks.named<org.gradle.jvm.tasks.Jar>("jar") {
    enabled = false
}

val colimaDockerSocket = file("${System.getProperty("user.home")}/.colima/default/docker.sock")

tasks.withType<Test> {
    useJUnitPlatform()
    filter {
        excludeTestsMatching("*\$*")
    }
    jvmArgs("-Xshare:off")
    systemProperty(
        "readmates.frontend.fixtures.dir",
        rootProject.file("../front/tests/unit/__fixtures__").absolutePath,
    )
    systemProperty(
        "readmates.frontend.zod.fixtures.dir",
        rootProject.file("../front/tests/unit/__fixtures__/zod-schemas").absolutePath,
    )

    if (System.getenv("DOCKER_HOST").isNullOrBlank() && colimaDockerSocket.exists()) {
        environment("DOCKER_HOST", "unix://${colimaDockerSocket.absolutePath}")
        environment("TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE", "/var/run/docker.sock")
    }
}
