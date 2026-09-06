import { evaluateIntegerFormula } from "./game-formula";

describe("game integer formulas", () => {
  it.each([
    ["(5 / 2) * 3", 6],
    ["5 * 3 / 2", 7],
    ["-5 / 2", -2],
    ["10 - 5 / 2", 8],
    ["2 + 9 / 0", 2],
    ["Math.min(5/2, 10) + Math.max(2, 7/2)", 5],
    ["(2 < 3) * 10", 10],
    ["0 ? 99 : 2 < 3 ? 5 : 6", 5],
    ["1 ? (0 ? 4 : 5) : 6", 5],
    ["(3+2)^2", 25],
  ])("evaluates %s as %i", (expression, expected) => {
    expect(evaluateIntegerFormula(expression)).toBe(expected);
  });

  it.each(["1 +", "Math.min(1)", "(1+2", "1foo", "1 2", "Infinity"])(
    "rejects malformed or unresolved expression %s", (expression) => {
      expect(() => evaluateIntegerFormula(expression)).toThrow();
    }
  );
});
