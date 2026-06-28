import { spawn } from "node:child_process";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import {
  buildPreviewCommand,
  buildPreviewServerEnv,
  isExpectedPreviewShutdown,
  previewOutputDir,
  type PreviewShutdown,
} from "../tests/performance/lighthouse-preview";
import type { LighthouseRouteGroup } from "../tests/lighthouse/types";

function stringArg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function parseGroup(value: string | undefined): LighthouseRouteGroup | undefined {
  if (value === undefined) return undefined;
  if (value === "public" || value === "member" || value === "host" || value === "admin") return value;
  throw new Error(`Unsupported --group value: ${value}`);
}

function parseLimit(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--limit must be a positive integer, received ${value}`);
  }
  return parsed;
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function findFreePort() {
  return await new Promise<number>((resolvePort, reject) => {
    const server = createNetServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolvePort(address.port);
        else reject(new Error("Unable to allocate preview port"));
      });
    });
  });
}

function writeJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

function publicClubFixture() {
  return {
    clubName: "읽는사이",
    tagline: "함께 읽고 각자의 언어로 남기는 독서모임",
    about: "초대받은 멤버들이 매달 한 권의 책을 읽고, 질문과 감상과 대화를 조용히 쌓아갑니다.",
    stats: {
      sessions: 6,
      books: 6,
      members: 9,
    },
    recentSessions: [
      {
        sessionId: "00000000-0000-0000-0000-000000000301",
        sessionNumber: 6,
        bookTitle: "팩트풀니스",
        bookAuthor: "한스 로슬링",
        bookImageUrl: null,
        date: "2026-04-15",
        summary: "데이터로 세계를 읽는 법을 함께 나눴습니다.",
        highlightCount: 3,
        oneLinerCount: 5,
      },
    ],
  };
}

function publicSessionFixture() {
  return {
    sessionId: "00000000-0000-0000-0000-000000000301",
    sessionNumber: 6,
    bookTitle: "팩트풀니스",
    bookAuthor: "한스 로슬링",
    bookImageUrl: null,
    date: "2026-04-15",
    summary: "데이터로 세계를 읽는 법을 함께 나눴습니다.",
    highlights: [
      {
        text: "세상을 보는 관점을 데이터로 다시 점검했습니다.",
        sortOrder: 1,
        authorName: "김호스트",
        authorShortName: "김",
      },
    ],
    oneLiners: [
      {
        authorName: "안멤버1",
        authorShortName: "안",
        text: "익숙한 판단을 의심하게 만든 책이었습니다.",
      },
    ],
  };
}

function handlePreviewApiMock(request: IncomingMessage, response: ServerResponse) {
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? "/", "http://readmates-preview.local");
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    writeJson(response, 200, {
      authenticated: false,
      userId: null,
      membershipId: null,
      clubId: null,
      email: null,
      displayName: null,
      accountName: null,
      role: null,
      membershipStatus: null,
      approvalState: "ANONYMOUS",
      currentMembership: null,
      joinedClubs: [],
      platformAdmin: null,
      recommendedAppEntryUrl: null,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/public/clubs/reading-sai") {
    writeJson(response, 200, publicClubFixture());
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/public/clubs/reading-sai/sessions/")) {
    writeJson(response, 200, publicSessionFixture());
    return;
  }

  writeJson(response, 404, { code: "NOT_FOUND", message: "Preview API mock route not found", status: 404 });
}

async function startPreviewApiMock() {
  const port = await findFreePort();
  const server = createHttpServer(handlePreviewApiMock);

  await new Promise<void>((resolveReady, reject) => {
    server.on("error", reject);
    server.listen(port, "127.0.0.1", resolveReady);
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolveClose();
        });
      }),
  };
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function bufferProcessOutput(child: ReturnType<typeof spawn>) {
  const chunks: string[] = [];
  child.stdout?.on("data", (chunk) => chunks.push(chunk.toString()));
  child.stderr?.on("data", (chunk) => chunks.push(chunk.toString()));
  return chunks;
}

function waitForProcessExit(child: ReturnType<typeof spawn>): Promise<PreviewShutdown> {
  return new Promise((resolveExit, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => resolveExit({ code, signal }));
  });
}

async function waitForPreview(baseUrl: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Vite preview did not become ready at ${baseUrl}`);
}

async function run() {
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const outputDir = previewOutputDir(timestampSlug());

  await runCommand("pnpm", ["build"]);

  const apiMock = await startPreviewApiMock();
  const preview = spawn("pnpm", ["preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...buildPreviewServerEnv({ apiBaseUrl: apiMock.baseUrl }),
    },
  });
  const previewOutput = bufferProcessOutput(preview);
  const previewExit = waitForProcessExit(preview);
  let previewShutdownError: Error | null = null;

  try {
    await waitForPreview(baseUrl);
    const command = buildPreviewCommand({
      baseUrl,
      outputDir,
      group: parseGroup(stringArg("--group")),
      limit: parseLimit(stringArg("--limit")),
    });
    await runCommand(command.command, command.args, command.env);
  } finally {
    if (preview.exitCode === null && preview.signalCode === null) {
      preview.kill("SIGTERM");
    }
    const shutdown = await previewExit;
    await apiMock.close();
    if (!isExpectedPreviewShutdown(shutdown)) {
      console.error(previewOutput.join(""));
      previewShutdownError = new Error(`Vite preview exited unexpectedly with code ${shutdown.code} and signal ${shutdown.signal}`);
    }
  }

  if (previewShutdownError) {
    throw previewShutdownError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
