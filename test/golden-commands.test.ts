import { expect, test } from "bun:test";

function update(...arguments_: string[]) {
  return Bun.spawnSync(["bun", "run", "golden:update", "--", ...arguments_], {
    cwd: import.meta.dir.replace(/\/test$/, ""),
    stdout: "pipe",
    stderr: "pipe",
  });
}

test("golden update requires one scenario name or --all", () => {
  const missing = update();
  const mixed = update("minimal", "--all");

  expect(missing.exitCode).toBe(1);
  expect(missing.stderr.toString()).toContain("Name one scenario or use --all.");
  expect(mixed.exitCode).toBe(1);
  expect(mixed.stderr.toString()).toContain("Name one scenario or use --all.");
});

test("golden update accepts an explicit --all selection", () => {
  const result = update("--all");

  expect(result.exitCode, result.stderr.toString()).toBe(0);
});
