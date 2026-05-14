// @vitest-environment node

import { describe, expect, it } from "vitest";

import vitestConfig from "../../vitest.config";

describe("Vitest project split", () => {
  it("runs node and jsdom test projects from one shared config", () => {
    const projects = vitestConfig.test?.projects ?? [];
    const projectNames = projects.map((project) => project.test?.name);

    expect(projectNames).toEqual(["node", "jsdom"]);
    expect(projects[0]?.test?.environment).toBe("node");
    expect(projects[1]?.test?.environment).toBe("jsdom");
  });
});
