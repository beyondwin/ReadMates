FROM eclipse-temurin:21-jdk-jammy AS builder

WORKDIR /build
COPY gradlew gradlew.bat settings.gradle.kts build.gradle.kts gradle.properties ./
COPY gradle ./gradle
COPY src ./src
RUN ./gradlew bootJar --no-daemon --max-workers=1 \
    -Dorg.gradle.jvmargs="-Xms128m -Xmx512m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8" \
    -Pkotlin.compiler.execution.strategy=out-of-process

FROM eclipse-temurin:21-jre-jammy AS layers

WORKDIR /layers
COPY --from=builder /build/build/libs/readmates-server-0.0.1-SNAPSHOT.jar readmates-server.jar
RUN java -Djarmode=layertools -jar readmates-server.jar extract

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates

WORKDIR /app
COPY --from=layers /layers/dependencies/ ./
COPY --from=layers /layers/spring-boot-loader/ ./
COPY --from=layers /layers/snapshot-dependencies/ ./
COPY --from=layers /layers/application/ ./
RUN chown -R readmates:readmates /app

USER readmates
EXPOSE 8080 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "org.springframework.boot.loader.launch.JarLauncher"]
