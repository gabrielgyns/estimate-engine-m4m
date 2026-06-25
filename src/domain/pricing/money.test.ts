import { describe, expect, it } from "vitest";
import { roundHalfUp } from "./money";

describe("roundHalfUp", () => {
  it("arredonda cents (half up) para o inteiro mais próximo", () => {
    expect(roundHalfUp(19_000)).toBe(19_000);
    expect(roundHalfUp(150.4)).toBe(150);
    expect(roundHalfUp(150.5)).toBe(151);
    expect(roundHalfUp(0)).toBe(0);
    expect(roundHalfUp(34_199.5)).toBe(34_200);
  });
});
