// Fog's formula evaluator performs integer arithmetic at EVERY operation:
// https://github.com/ThePhrozenKeep/D2MOO/blob/master/source/Fog/src/Calc.cpp
// Game aliases are resolved by the caller; this parses only arithmetic.
export function evaluateIntegerFormula(expression: string): number {
  const tokens = expression.match(/Math\.(?:min|max)|\d+(?:\.\d+)?|>=|<=|==|!=|[+\-*/^(),<>?:]/g) || [];
  if (tokens.join("") !== expression.replace(/\s/g, "")) {
    throw new Error(`Unsupported game formula: ${expression}`);
  }
  let position = 0;
  const precedence: Record<string, number> = {
    "==": 1, "!=": 1, "<": 2, ">": 2, "<=": 2, ">=": 2,
    "+": 3, "-": 3, "*": 4, "/": 4, "^": 5,
  };
  const consume = (token: string) => {
    if (tokens[position++] !== token) {
      throw new Error(`Invalid game formula: ${expression}`);
    }
  };
  const atom = (): number => {
    const token = tokens[position++];
    if (token === "-" || token === "+") {
      return (token === "-" ? -1 : 1) * atom();
    }
    if (token === "(") {
      const value = conditional();
      consume(")");
      return value;
    }
    if (token === "Math.min" || token === "Math.max") {
      consume("(");
      const left = conditional();
      consume(",");
      const right = conditional();
      consume(")");
      return token === "Math.min" ? Math.min(left, right) : Math.max(left, right);
    }
    if (!token || !/^\d/.test(token)) {
      throw new Error(`Invalid game formula: ${expression}`);
    }
    return Math.trunc(Number(token));
  };
  const binary = (minimumPrecedence: number): number => {
    let left = atom();
    while ((precedence[tokens[position]] || 0) >= minimumPrecedence) {
      const operator = tokens[position++];
      const right = binary(precedence[operator] + 1);
      switch (operator) {
        case "+": left += right; break;
        case "-": left -= right; break;
        case "*": left *= right; break;
        case "/": left = right === 0 ? 0 : Math.trunc(left / right); break;
        case "^": left = right <= 0 ? 1 : left ** right; break;
        case "<": left = Number(left < right); break;
        case ">": left = Number(left > right); break;
        case "<=": left = Number(left <= right); break;
        case ">=": left = Number(left >= right); break;
        case "==": left = Number(left === right); break;
        case "!=": left = Number(left !== right); break;
      }
    }
    return left;
  };
  const conditional = (): number => {
    const condition = binary(1);
    if (tokens[position] !== "?") {
      return condition;
    }
    position += 1;
    const yes = conditional();
    consume(":");
    const no = conditional();
    return condition ? yes : no;
  };
  const value = conditional();
  if (position !== tokens.length || !Number.isFinite(value)) {
    throw new Error(`Invalid game formula: ${expression}`);
  }
  return value;
}
