import { expect, test } from "bun:test";

// Guards the package shape, not any behaviour: every published entry point has
// to resolve through its exports map against the built output. A wrong path in
// `exports`, a missing `outDir` file, or a subpath that was never declared all
// fail here rather than in a consumer's install.
test.each([
  "botchart",
  "botchart/simulator",
  "botchart/conformance/schema.json",
  "botchart/conformance/coverage.json",
  "botchart-grammy",
])(
  "%s resolves through its exports map",
  async (specifier) => {
    expect(await import(specifier)).toBeDefined();
  },
);

test("the simulator subpath exports the conversation player", async () => {
  const simulator = await import("botchart/simulator");

  expect(simulator.simulateConversation).toBeFunction();
  expect(simulator.replayTranscript).toBeFunction();
});
