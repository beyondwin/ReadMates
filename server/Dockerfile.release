FROM eclipse-temurin:25-jre-jammy AS layers

WORKDIR /layers
COPY build/libs/readmates-server-0.0.1-SNAPSHOT.jar readmates-server.jar
RUN java -Djarmode=layertools -jar readmates-server.jar extract

FROM eclipse-temurin:25-jre-jammy

RUN groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates

WORKDIR /app
COPY --from=layers /layers/dependencies/ ./
COPY --from=layers /layers/spring-boot-loader/ ./
COPY --from=layers /layers/snapshot-dependencies/ ./
COPY --from=layers /layers/application/ ./
COPY docker/readmates-http-get /app/bin/readmates-http-get
RUN chmod 755 /app/bin/readmates-http-get \
    && chown -R readmates:readmates /app

USER readmates
EXPOSE 8080 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "org.springframework.boot.loader.launch.JarLauncher"]
