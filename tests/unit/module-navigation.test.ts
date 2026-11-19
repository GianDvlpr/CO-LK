import { describe, expect, it } from "vitest";
import {
  allModules,
  moduleNavigationGroups,
  standaloneNavigationModuleKeys,
} from "@/lib/config/modules";

describe("module navigation", () => {
  it("assigns every module to one visible navigation location", () => {
    const assigned = [
      ...standaloneNavigationModuleKeys,
      ...moduleNavigationGroups.flatMap((group) => group.moduleKeys),
    ];

    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual(allModules.map((module) => module.key).sort());
  });
});
