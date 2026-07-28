FROM eclipse-temurin:25-jre-jammy AS layers

WORKDIR /layers
COPY build/libs/readmates-server-0.0.1-SNAPSHOT.jar readmates-server.jar
RUN java -Djarmode=tools -jar readmates-server.jar extract --layers --launcher --destination extracted

FROM eclipse-temurin:25-jre-jammy

RUN groupadd --system readmates \
    && useradd --system --gid readmates --home-dir /app --shell /usr/sbin/nologin readmates

WORKDIR /app
COPY --from=layers /layers/extracted/dependencies/ ./
COPY --from=layers /layers/extracted/spring-boot-loader/ ./
COPY --from=layers /layers/extracted/snapshot-dependencies/ ./
COPY --from=layers /layers/extracted/application/ ./
COPY docker/readmates-http-get /app/bin/readmates-http-get
RUN chmod 755 /app/bin/readmates-http-get \
    && chown -R readmates:readmates /app

USER readmates
EXPOSE 8080 8081

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70", "--enable-native-access=ALL-UNNAMED", "--illegal-native-access=deny", "--sun-misc-unsafe-memory-access=deny", "org.springframework.boot.loader.launch.JarLauncher"]
