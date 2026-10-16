import fs from "fs";
import path from "path";

const dataDirectory = path.join(__dirname, "pd2");

function readTable(fileName: string, season = 14) {
  const lines = fs
    .readFileSync(
      path.join(dataDirectory, `season-${season}`, fileName),
      "utf8"
    )
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r?\n/);
  return {
    columns: lines[0].split("\t"),
    rows: lines.slice(1).map((line) => line.split("\t")),
  };
}

function cell(fileName: string, key: string, column: string): string {
  const { columns, rows } = readTable(fileName);
  const row = rows.find((candidate) => candidate[0] === key);
  if (!row || !columns.includes(column)) {
    throw new Error(`Missing ${fileName} ${key} ${column}`);
  }
  return row[columns.indexOf(column)] || "";
}

describe("provisional Season 14 source tables", () => {
  it.each([
    [
      "Skills.txt",
      [
        "Jab",
        "Multiple Shot",
        "Power Strike",
        "Charged Strike",
        "Lightning Strike",
        "Frost Nova",
        "Blaze",
        "Shiver Armor",
        "Chilling Armor",
        "AmpDmg",
        "Decrepify",
        "LowRes",
        "Poison Nova",
        "Concentration",
        "One Hand Mastery",
        "Two Hand Mastery",
        "Leap Attack",
        "Natural Resistance",
        "Eruption",
        "Summon Fenris",
        "Twister",
        "Tornado",
        "Hurricane",
        "Combustion",
      ],
    ],
    [
      "Missiles.txt",
      [
        "hydra",
        "royalstrikemeteor",
        "royalstrikechaosice",
        "powerstrikenova2",
        "hydrafireball",
      ],
    ],
    [
      "SkillDesc.txt",
      [
        "multiple shot",
        "blaze",
        "shiver armor",
        "chilling armor",
        "decrepify",
        "concentration",
        "royal strike",
        "combustion",
      ],
    ],
    ["MonStats.txt", ["lightningsentry", "chainlightningsentry"]],
    [
      "Armor.txt",
      [
        "Splint Mail",
        "Plate Mail",
        "Field Plate",
        "Ghost Armor",
        "Serpentskin Armor",
        "Demonhide Armor",
        "Trellised Armor",
        "Armet",
        "Giant Conch",
      ],
    ],
  ] as const)(
    "preserves the schema, row order, and unrelated rows in %s",
    (fileName, expectedChangedRows) => {
      const before = readTable(fileName, 13);
      const after = readTable(fileName);
      expect(after.columns).toEqual(before.columns);
      expect(after.rows).toHaveLength(before.rows.length);
      const changedRows: string[] = [];
      after.rows.forEach((row, index) => {
        expect(row).toHaveLength(before.rows[index].length);
        expect(row[0]).toBe(before.rows[index][0]);
        if (row.some((value, column) => value !== before.rows[index][column])) {
          changedRows.push(row[0]);
        }
      });
      expect(changedRows.sort()).toEqual([...expectedChangedRows].sort());
    }
  );

  it.each(["Properties.txt", "ItemStatCost.txt"])(
    "preserves %s byte for byte",
    (fileName) => {
      expect(
        fs.readFileSync(path.join(dataDirectory, "season-14", fileName))
      ).toEqual(
        fs.readFileSync(path.join(dataDirectory, "season-13", fileName))
      );
    }
  );

  it.each([
    "Splint Mail",
    "Plate Mail",
    "Field Plate",
    "Ghost Armor",
    "Serpentskin Armor",
    "Demonhide Armor",
    "Trellised Armor",
    "Tigulated Mail",
    "Mesh Armor",
    "Cuirass",
    "Russet Armor",
    "Templar Coat",
    "Armet",
    "Giant Conch",
  ])("supports three sockets in %s", (name) => {
    expect(cell("Armor.txt", name, "gemsockets")).toBe("3");
  });

  it.each([
    ["lightningsentry", "13"],
    ["chainlightningsentry", "14"],
  ])(
    "updates %s AI delay in every difficulty without changing inactive stall time",
    (name, delay) => {
      for (const suffix of ["", "(N)", "(H)"]) {
        expect(cell("MonStats.txt", name, `aidel${suffix}`)).toBe(delay);
        expect(cell("MonStats.txt", name, `aip3${suffix}`)).toBe("15");
      }
    }
  );

  it.each([
    ["hydra", "20"],
    ["hydrafireball", "25"],
  ])("increases %s speed by 25 percent", (name, speed) => {
    expect(cell("Missiles.txt", name, "Vel")).toBe(speed);
    expect(cell("Missiles.txt", name, "MaxVel")).toBe(speed);
  });

  it("stores half-point Twister damage in HitShift 7 units", () => {
    expect(cell("Skills.txt", "Twister", "HitShift")).toBe("7");
    expect(Number(cell("Skills.txt", "Twister", "MinDam")) / 2).toBe(6.5);
    expect(Number(cell("Skills.txt", "Twister", "MaxLevDam1")) / 2).toBe(3.5);
    expect(Number(cell("Skills.txt", "Twister", "MinLevDam5")) / 2).toBe(42);
    expect(Number(cell("Skills.txt", "Twister", "MaxLevDam5")) / 2).toBe(44);
  });

  it("updates player curse bases while preserving monster and dedicated proc rows", () => {
    expect(
      Number(cell("Skills.txt", "AmpDmg", "Param5")) +
        Number(cell("Skills.txt", "AmpDmg", "Param6"))
    ).toBe(15);
    expect(
      Number(cell("Skills.txt", "LowRes", "Param5")) +
        Number(cell("Skills.txt", "LowRes", "Param6"))
    ).toBe(20);
    expect(cell("Skills.txt", "Decrepify", "aurastatcalc1")).toBe(
      "-min(par5 + lvl,60)"
    );
    expect(cell("Skills.txt", "Decrepify", "aurastatcalc5")).toBe(
      "-(10 + (lvl/2))"
    );
    expect(cell("SkillDesc.txt", "decrepify", "desccalca6")).toBe(
      cell("Skills.txt", "Decrepify", "aurastatcalc1")
    );
    expect(cell("SkillDesc.txt", "decrepify", "desccalca5")).toBe(
      cell("Skills.txt", "Decrepify", "aurastatcalc5")
    );
    // The row-diff checks above also require all Mon* and Decrepify Proc rows to remain identical.
  });

  it("keeps level caps and tooltip formulas aligned with the skill mechanics", () => {
    expect(cell("Skills.txt", "One Hand Mastery", "Param6")).toBe("45");
    expect(cell("Skills.txt", "Natural Resistance", "Param2")).toBe("65");
    expect(cell("Skills.txt", "Summon Fenris", "passivestat4")).toBe(
      "passive_phys_pierce"
    );
    expect(cell("Skills.txt", "Summon Fenris", "passivecalc4")).toBe(
      "min(5 + lvl/2,20)"
    );
    expect(cell("Skills.txt", "Blaze", "Param3")).toBe("25");
    expect(cell("Skills.txt", "Blaze", "Param4")).toBe("1");
    expect(cell("Skills.txt", "Blaze", "passivecalc1")).toBe(
      "min(par3 + lvl * par4,60)"
    );
    expect(cell("SkillDesc.txt", "blaze", "desccalca2")).toBe(
      cell("Skills.txt", "Blaze", "passivecalc1")
    );
    expect(cell("Skills.txt", "Concentration", "Param5")).toBe("15");
    expect(cell("Skills.txt", "Concentration", "aurastatcalc2")).toBe(
      "par5 + lvl/3"
    );
    expect(cell("SkillDesc.txt", "concentration", "desccalca5")).toBe(
      cell("Skills.txt", "Concentration", "aurastatcalc2")
    );
    expect(cell("Skills.txt", "Combustion", "delay")).toBe("50");
    expect(cell("SkillDesc.txt", "combustion", "desccalca6")).toBe("50");
    expect(cell("SkillDesc.txt", "multiple shot", "desccalca3")).toBe(
      cell("Skills.txt", "Multiple Shot", "calc1")
    );
    expect(cell("SkillDesc.txt", "royal strike", "dsc3calca2")).toBe("10");
    expect(cell("SkillDesc.txt", "shiver armor", "dsc3texta2")).toBe(
      "skillname44"
    );
    expect(cell("SkillDesc.txt", "chilling armor", "dsc3texta2")).toBe(
      "skillname59"
    );
  });
});
