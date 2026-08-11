import { expect, test } from "bun:test";

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
  expect(await Bun.file(`${appRoot}/dist/vendor/LICENSE.md`).exists()).toBe(true);
  expect(await Bun.file(`${appRoot}/dist/THIRD-PARTY-NOTICES.md`).text())
    .toContain("elkjs 0.12.0");
  expect(await Bun.file(`${appRoot}/dist/starters/visual-menu/spec.json`).exists()).toBe(true);
  expect(await Bun.file(`${appRoot}/dist/starters/dynamic-list/preview.json`).exists()).toBe(true);
});
