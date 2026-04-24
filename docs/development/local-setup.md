# 로컬 개발 환경 설정

이 문서는 ReadMates를 로컬에서 실행하기 위한 최소 절차를 정리합니다. 운영 배포 절차는 [배포 문서](../deploy/README.md)를 참고합니다.

## 필수 도구

- `JDK 21`
- `Node.js 24` 권장
- `pnpm`
- `Docker Compose` 또는 `MySQL 8` compatible database

프론트엔드는 `front/package.json`의 `packageManager` 기준으로 `pnpm@10.33.0`을 사용합니다. CI는 Node.js 24로 frontend lint/test/build를 실행합니다. 백엔드는 Gradle wrapper와 Java toolchain으로 `JDK 21`을 사용합니다.

## 의존성 설치

```bash
pnpm --dir front install --frozen-lockfile
```

백엔드는 Gradle wrapper가 필요한 의존성을 내려받습니다. 별도 전역 Gradle 설치는 필요하지 않습니다.

## MySQL 준비

저장소의 `compose.yml`은 로컬 개발용 MySQL 8.4 컨테이너를 제공합니다.

```bash
docker compose up -d mysql
```

기본 접속 정보는 아래와 같습니다.

```text
database: readmates
username: readmates
password: readmates
port: 3306
```

이미 별도 MySQL 8 compatible database를 사용한다면 같은 database를 만들고, backend 실행 시 `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`를 해당 값으로 바꿉니다.

## Backend 실행

로컬 개발은 `dev` profile을 사용합니다. 이 profile은 sample seed data와 dev-login fixture를 켭니다.

```bash
SPRING_PROFILES_ACTIVE=dev \
SPRING_DATASOURCE_URL='jdbc:mysql://localhost:3306/readmates?serverTimezone=UTC' \
SPRING_DATASOURCE_USERNAME=readmates \
SPRING_DATASOURCE_PASSWORD=readmates \
READMATES_APP_BASE_URL=http://localhost:5173 \
READMATES_ALLOWED_ORIGINS=http://localhost:5173 \
READMATES_BFF_SECRET=local-dev-secret \
READMATES_AUTH_SESSION_COOKIE_SECURE=false \
./server/gradlew -p server bootRun
```

주요 backend 환경 변수는 다음과 같습니다.

| 변수 | 용도 |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `dev` profile을 켜면 dev seed migration과 dev-login fixture가 활성화됩니다. |
| `SPRING_DATASOURCE_URL` | MySQL JDBC URL입니다. |
| `SPRING_DATASOURCE_USERNAME` | MySQL 사용자입니다. |
| `SPRING_DATASOURCE_PASSWORD` | MySQL 비밀번호입니다. |
| `READMATES_APP_BASE_URL` | 로그인 성공 후 돌아갈 frontend origin입니다. |
| `READMATES_ALLOWED_ORIGINS` | mutating API 요청의 `Origin` 또는 `Referer` 허용 origin입니다. 쉼표로 여러 값을 줄 수 있습니다. |
| `READMATES_BFF_SECRET` | BFF가 Spring API로 전달하는 공유 secret입니다. 로컬에서도 frontend proxy와 같은 값을 쓰면 production boundary를 비슷하게 테스트할 수 있습니다. |
| `READMATES_BFF_SECRET_REQUIRED` | 기본 `true`입니다. `application-dev.yml`에서는 `false`로 완화되어 있지만, `READMATES_BFF_SECRET`을 설정하면 `/api/**` 요청은 `X-Readmates-Bff-Secret`이 필요합니다. |
| `READMATES_AUTH_SESSION_COOKIE_SECURE` | 로컬 HTTP에서 `readmates_session` cookie를 테스트하려면 `false`로 둡니다. |
| `READMATES_FLYWAY_LOCATIONS` | Flyway migration 위치입니다. 기본은 `classpath:db/mysql/migration`이고, `dev` profile은 `classpath:db/mysql/dev`를 추가합니다. |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID` | Google OAuth를 로컬에서 직접 시험할 때 필요한 client id입니다. dev-login만 쓰면 필요하지 않습니다. |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET` | Google OAuth를 로컬에서 직접 시험할 때 필요한 client secret입니다. dev-login만 쓰면 필요하지 않습니다. |
| `SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_SCOPE` | Google OAuth scope입니다. 기본 운영 예시는 `openid,email,profile`입니다. |

Backend health check:

```bash
curl -sS http://localhost:8080/internal/health
```

## Frontend 실행

Vite 개발 서버는 `front/vite.config.ts`의 proxy를 사용합니다. 로컬에서는 Cloudflare Pages Functions 대신 Vite proxy가 `/api/bff/**`, `/oauth2/authorization/**`, `/login/oauth2/code/**`를 Spring backend로 전달합니다.

```bash
READMATES_API_BASE_URL=http://localhost:8080 \
READMATES_BFF_SECRET=local-dev-secret \
VITE_ENABLE_DEV_LOGIN=true \
pnpm --dir front dev
```

브라우저에서 `http://localhost:5173`을 엽니다.

주요 frontend 환경 변수는 다음과 같습니다.

| 변수 | 용도 |
| --- | --- |
| `READMATES_API_BASE_URL` | Vite dev proxy와 Cloudflare Pages Functions가 바라볼 Spring API origin입니다. 문서 예시는 로컬 `http://localhost:8080` 또는 placeholder `https://api.example.com`만 사용합니다. |
| `READMATES_BFF_SECRET` | Vite dev proxy 또는 Pages Functions가 Spring으로 보낼 `X-Readmates-Bff-Secret` 값입니다. 브라우저 bundle에 들어가는 `VITE_` 변수로 만들지 않습니다. |
| `VITE_ENABLE_DEV_LOGIN` | 로컬 dev-login 버튼 표시를 명시적으로 켭니다. `import.meta.env.DEV`에서도 표시되지만, 로컬 의도를 분명히 하기 위해 설정할 수 있습니다. |
| `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | 이전 로컬 env 파일 호환을 위한 legacy 변수입니다. 새 설정에는 `VITE_ENABLE_DEV_LOGIN`을 사용합니다. |

## Dev-login 흐름

Dev-login은 로컬 개발과 E2E fixture를 위한 흐름입니다. production auth가 아닙니다.

- Backend endpoint는 `POST /api/dev/login`입니다.
- Controller는 `@Profile("!prod & !production")`와 `readmates.dev.login-enabled=true` 조건에서만 등록됩니다.
- `application-dev.yml`은 `readmates.dev.login-enabled=true`를 설정합니다.
- Frontend login 화면은 production build에서는 dev-login 버튼을 숨깁니다.
- Fixture 계정은 `host@example.com`, `member1@example.com` 같은 `example.com` 주소를 사용합니다.
- Dev seed는 기존 account alias인 `users.short_name`과 현재 표시 이름 저장소인 `memberships.short_name`을 모두 채웁니다. 화면 표시와 프로필 수정 API는 `displayName` 필드를 주고받고 membership 단위 `memberships.short_name`을 갱신하므로, `/app/me`와 `/app/host/members`에서 표시 이름 변경 흐름을 로컬로 확인할 수 있습니다.

운영 로그인은 Google OAuth 흐름입니다. 브라우저는 `/oauth2/authorization/google`로 시작하고, callback은 `/login/oauth2/code/google`로 돌아오며, Spring은 성공 시 `readmates_session` cookie를 발급합니다.

## 종료와 초기화

MySQL 컨테이너를 멈추려면 아래 명령을 사용합니다.

```bash
docker compose down
```

로컬 database volume까지 삭제하려면 아래 명령을 사용합니다. 기존 seed와 개발 중 데이터가 사라집니다.

```bash
docker compose down -v
```
