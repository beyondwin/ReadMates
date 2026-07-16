plugins {
    kotlin("jvm") version "2.4.0"
    kotlin("plugin.spring") version "2.4.0"
    id("org.springframework.boot") version "4.0.6"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.flywaydb.flyway") version "11.7.2"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1"
    id("dev.detekt") version "2.0.0-alpha.5"
    id("jacoco")
}

group = "com.readmates"
version = "0.0.1-SNAPSHOT"

extra["netty.version"] = "4.2.15.Final"
extra["spring-kafka.version"] = "4.0.6"
extra["tomcat.version"] = "11.0.22"

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_25)
    }
}

repositories {
    mavenCentral()
}

configurations.configureEach {
    resolutionStrategy.eachDependency {
        if (requested.group == "com.fasterxml.jackson.core" && requested.name == "jackson-databind") {
            useVersion("2.21.4")
            because("Trivy flags CVE-2026-54512 and CVE-2026-54513 in jackson-databind 2.21.2.")
        }
        if (requested.group == "com.fasterxml.jackson.core" && requested.name == "jackson-annotations") {
            useVersion("2.21")
            because("jackson-databind 2.21.4 requests a non-published annotations 2.21.4 artifact.")
        }
        if (requested.group == "tools.jackson.core") {
            useVersion("3.1.4")
            because("Trivy flags CVE-2026-54512 and CVE-2026-54513 in tools.jackson databind 3.1.2.")
        }
    }
}

dependencyManagement {
    imports {
        mavenBom("org.springframework.ai:spring-ai-bom:2.0.0")
    }
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
        implementation("com.fasterxml.jackson.core:jackson-databind:2.21.4") {
            because("Trivy flags CVE-2026-54512 and CVE-2026-54513 in jackson-databind 2.21.2.")
        }
        implementation("tools.jackson.core:jackson-databind:3.1.4") {
            because("Trivy flags CVE-2026-54512 and CVE-2026-54513 in tools.jackson databind 3.1.2.")
        }
        implementation("io.netty:netty-codec-dns:4.2.15.Final") {
            because("Trivy flags Netty DNS/handler CVEs before 4.2.15.Final.")
        }
        implementation("org.springframework.kafka:spring-kafka:4.0.6") {
            because("Trivy flags CVE-2026-41731 in spring-kafka 4.0.5.")
        }
    }

    implementation("net.logstash.logback:logstash-logback-encoder:7.4")
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
    // SLO catalog yaml parsing (com.fasterxml.jackson.dataformat.yaml.YAMLFactory).
    // Pinned to match jackson-module-kotlin 2.21.2 already resolved transitively.
    implementation("com.fasterxml.jackson.dataformat:jackson-dataformat-yaml:2.21.2")
    implementation("org.springframework.ai:spring-ai-starter-model-openai")
    implementation("org.springframework.ai:spring-ai-starter-model-anthropic")
    implementation("org.springframework.ai:spring-ai-starter-model-google-genai")
    implementation("org.springframework.boot:spring-boot-starter-opentelemetry")
    // TODO(Task 11): remove this compile-only bridge with the legacy direct-SDK clients.
    compileOnly("com.anthropic:anthropic-java-client-okhttp:2.40.1")
    compileOnly("com.openai:openai-java-client-okhttp:4.39.1")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("org.flywaydb:flyway-mysql")
    runtimeOnly("com.mysql:mysql-connector-j")
    runtimeOnly("io.micrometer:micrometer-registry-prometheus")
    // Resilience4j CircuitBreaker for outbound adapters (resilience plan task 1).
    // Core + micrometer only; the Spring Boot starter/annotations are intentionally
    // unused so circuit-breaker types stay confined to adapter.out (ArchUnit task 7).
    implementation("io.github.resilience4j:resilience4j-circuitbreaker:2.2.0")
    implementation("io.github.resilience4j:resilience4j-micrometer:2.2.0")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.springframework.kafka:spring-kafka-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:testcontainers-kafka:2.0.2")
    testImplementation("org.testcontainers:testcontainers-mysql:2.0.2")
    testImplementation("com.tngtech.archunit:archunit-junit5:1.3.2")
}

tasks.named<org.gradle.jvm.tasks.Jar>("jar") {
    enabled = false
}

// The default :test task has no tag filter, so it would run every unit,
// integration, container, and architecture test exactly the way the explicit
// :unitTest / :integrationTest / :architectureTest tasks already do. Disabling
// it makes `./gradlew check` run each tagged group exactly once.
// Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.1
tasks.named<Test>("test") {
    enabled = false
}

val colimaDockerSocket = file("${System.getProperty("user.home")}/.colima/default/docker.sock")

val serverTestJavaLauncher =
    javaToolchains.launcherFor {
        languageVersion.set(JavaLanguageVersion.of(25))
    }

val testSourceSet = sourceSets.named("test")

fun Test.configureReadmatesTestRuntime() {
    useJUnitPlatform()
    javaLauncher.set(serverTestJavaLauncher)
    filter {
        excludeTestsMatching("*\$*")
    }
    maxHeapSize =
        (project.findProperty("testMaxHeap") as String?)
            ?: System.getenv("READMATES_TEST_MAX_HEAP")
            ?: "1536m"
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

fun Test.useReadmatesTestClasses() {
    testClassesDirs = testSourceSet.get().output.classesDirs
    classpath = testSourceSet.get().runtimeClasspath
}

tasks.withType<Test>().configureEach {
    configureReadmatesTestRuntime()
}

tasks.register<Test>("unitTest") {
    description = "Runs ReadMates unit tests without Spring/Testcontainers integration tags."
    group = "verification"
    configureReadmatesTestRuntime()
    useReadmatesTestClasses()
    useJUnitPlatform {
        excludeTags("integration", "container", "architecture")
    }
    // Adjustable parallelism for unitTest (no shared state across classes).
    // Override priority: -PmaxForks=N (sweep harness) > READMATES_TEST_FORKS
    // env (CI workflow) > availableProcessors()/2 default (min 1).
    // Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.3
    val requestedForks =
        (project.findProperty("maxForks") as String?)?.toIntOrNull()
            ?: System.getenv("READMATES_TEST_FORKS")?.toIntOrNull()
            ?: (Runtime.getRuntime().availableProcessors() / 2).coerceAtLeast(1)
    maxParallelForks = requestedForks
    forkEvery = 0

    // JUnit5 class-level parallel execution, scoped to :unitTest only via
    // systemProperty (NOT classpath junit-platform.properties — that would
    // also affect :integrationTest and :architectureTest, both of which
    // share Testcontainers fixtures and need sequential class execution).
    // Methods inside a class stay on the same thread (default), classes
    // run concurrently. Audit (docs/superpowers/reports/2026-05-16-stateful-audit.md)
    // found 0 unit-tagged tests with @DirtiesContext / @MockBean / @SpyBean.
    // Refs: docs/superpowers/specs/2026-05-16-readmates-build-test-speed-spec.md §4.4
    systemProperty("junit.jupiter.execution.parallel.enabled", "true")
    systemProperty("junit.jupiter.execution.parallel.mode.default", "same_thread")
    systemProperty("junit.jupiter.execution.parallel.mode.classes.default", "concurrent")
    systemProperty("junit.jupiter.execution.parallel.config.strategy", "dynamic")
    systemProperty("junit.jupiter.execution.parallel.config.dynamic.factor", "1.0")
}

tasks.register<Test>("integrationTest") {
    description = "Runs ReadMates Spring Boot and Testcontainers integration tests."
    group = "verification"
    configureReadmatesTestRuntime()
    useReadmatesTestClasses()
    shouldRunAfter("unitTest")
    useJUnitPlatform {
        includeTags("integration", "container")
    }
}

tasks.register<Test>("architectureTest") {
    description = "Runs ReadMates ArchUnit architecture boundary tests."
    group = "verification"
    configureReadmatesTestRuntime()
    useReadmatesTestClasses()
    shouldRunAfter("unitTest")
    useJUnitPlatform {
        includeTags("architecture")
    }
}

ktlint {
    version.set("1.7.1")
    android.set(false)
    ignoreFailures.set(false)
    baseline.set(file("$projectDir/config/ktlint/baseline.xml"))
    filter {
        exclude("**/generated/**")
    }
    reporters {
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.PLAIN)
        reporter(org.jlleitschuh.gradle.ktlint.reporter.ReporterType.CHECKSTYLE)
    }
}

detekt {
    config.setFrom(files("$rootDir/config/detekt/detekt.yml"))
    buildUponDefaultConfig = true
    autoCorrect = false
    parallel = true
    source.setFrom(files("src/main/kotlin", "src/test/kotlin"))
    baseline = file("$rootDir/config/detekt/baseline.xml")
}

tasks.named("check") {
    dependsOn("detekt")
    dependsOn("unitTest")
    dependsOn("architectureTest")
}

jacoco {
    toolVersion = "0.8.14"
}

val unitTestTask = tasks.named<Test>("unitTest")

unitTestTask.configure {
    extensions.configure<JacocoTaskExtension> {
        destinationFile =
            layout.buildDirectory
                .file("jacoco/unitTest.exec")
                .get()
                .asFile
    }
}

tasks.named<JacocoReport>("jacocoTestReport") {
    dependsOn(unitTestTask)
    executionData.setFrom(fileTree(layout.buildDirectory).include("/jacoco/unitTest.exec"))
    sourceSets(sourceSets["main"])
    reports {
        xml.required.set(true)
        html.required.set(true)
        csv.required.set(false)
    }
    classDirectories.setFrom(
        files(
            classDirectories.files.map {
                fileTree(it) {
                    exclude(
                        "**/*Application*",
                        "**/dto/**",
                        "**/config/**",
                    )
                }
            },
        ),
    )
}

tasks.named<JacocoCoverageVerification>("jacocoTestCoverageVerification") {
    dependsOn(tasks.named("jacocoTestReport"))
    executionData.setFrom(fileTree(layout.buildDirectory).include("/jacoco/unitTest.exec"))
    classDirectories.setFrom(
        files(
            classDirectories.files.map {
                fileTree(it) {
                    exclude(
                        "**/*Application*",
                        "**/dto/**",
                        "**/config/**",
                    )
                }
            },
        ),
    )
    violationRules {
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                // baseline 0.2504 (measured 2026-05-14) -2pp; raised in Task 4 if needed.
                minimum = "0.23".toBigDecimal()
            }
        }
    }
}

tasks.named("check") {
    dependsOn("jacocoTestCoverageVerification")
}
