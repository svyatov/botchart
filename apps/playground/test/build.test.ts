import { expect, test } from "bun:test";
import { createServer } from "node:http";

const appRoot = new URL("../", import.meta.url).pathname;
const repoRoot = new URL("../../../", import.meta.url).pathname;

test("the playground build keeps ELK and its notices separate", async () => {
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: appRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(build.exitCode, build.stderr.toString()).toBe(0);
  const source = await Bun.file(`${appRoot}/node_modules/elkjs/lib/elk.bundled.js`).bytes();
  const deployed = await Bun.file(`${appRoot}/dist/vendor/elk.bundled.js`).bytes();
  expect(Bun.hash(source)).toBe(Bun.hash(deployed));
  const licenseSource = await Bun.file(`${appRoot}/node_modules/elkjs/LICENSE.md`).bytes();
  const licenseDeployed = await Bun.file(`${appRoot}/dist/vendor/LICENSE.md`).bytes();
  expect(Bun.hash(licenseSource)).toBe(Bun.hash(licenseDeployed));
  expect(await Bun.file(`${appRoot}/dist/THIRD-PARTY-NOTICES.md`).text())
    .toContain("elkjs 0.12.0");
  expect(await Bun.file(`${appRoot}/dist/starters/visual-menu/spec.json`).exists()).toBe(true);
  expect(await Bun.file(`${appRoot}/dist/starters/dynamic-list/preview.json`).exists()).toBe(true);
});

test("the built playground exposes deterministic transcript controls", async () => {
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: appRoot,
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(build.exitCode, build.stderr.toString()).toBe(0);
  const page = await Bun.file(`${appRoot}/dist/index.html`).text();
  expect(page).toContain('aria-label="Conversation replay"');
  expect(page).toContain('id="replay-previous"');
  expect(page).toContain('id="replay-next"');
  expect(page).toContain('id="replay-reset"');
  expect(page).toContain('id="replay-status"');
});

test("the Pages smoke command checks every built asset", async () => {
  const build = Bun.spawnSync(["bun", "run", "build"], {
    cwd: appRoot,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(build.exitCode, build.stderr.toString()).toBe(0);

  const server = createServer(async (request, response) => {
    const path = decodeURIComponent(request.url ?? "/").replace(/^\//, "") || "index.html";
    const file = Bun.file(`${appRoot}/dist/${path}`);
    if (!await file.exists()) {
      response.writeHead(404).end("missing");
      return;
    }
    response.writeHead(200).end(await file.bytes());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("The smoke test server has no TCP port.");

  try {
    const smoke = Bun.spawn(["bun", "run", "smoke", `http://127.0.0.1:${address.port}/`], {
      cwd: appRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exitCode, stderr] = await Promise.all([
      smoke.exited,
      new Response(smoke.stderr).text(),
    ]);
    expect(exitCode, stderr).toBe(0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (
      error ? reject(error) : resolve()
    )));
  }
});
