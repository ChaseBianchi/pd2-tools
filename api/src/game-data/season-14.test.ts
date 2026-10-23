import fs from "fs";
import path from "path";
import { createHash } from "crypto";

const directory = path.join(__dirname, "pd2/season-14");
const manifest = JSON.parse(
  fs.readFileSync(path.join(directory, "SOURCE_MANIFEST.json"), "utf8")
) as { files: Record<string, { sha256: string; rows?: number; columns?: number }> };
function table(name: string) {
  const [header, ...lines] = fs.readFileSync(path.join(directory, name), "utf8")
    .trimEnd().split(/\r?\n/);
  const columns = header.split("\t");
  return { columns, rows: lines.map((line) => line.split("\t")) };
}
function cell(name: string, key: string, column: string) {
  const { columns, rows } = table(name);
  const row = rows.find((r) => r[0] === key);
  if (!row || !columns.includes(column)) throw Error(`Missing ${name} ${key} ${column}`);
  return row[columns.indexOf(column)] || "";
}

describe("extracted Season 14 beta source tables", () => {
  it.each(Object.entries(manifest.files))(
    "matches the recorded installation extract for %s",
    (name, source) => {
      const text = fs.readFileSync(path.join(directory, name), "utf8").replace(/\r\n/g, "\n");
      expect(createHash("sha256").update(text).digest("hex")).toBe(source.sha256);
      if (source.rows !== undefined) {
        const parsed = table(name);
        expect(parsed.rows).toHaveLength(source.rows);
        expect(parsed.columns).toHaveLength(source.columns!);
      }
    }
  );
  it.each([
    ["Skills.txt", "Multiple Shot", "calc1", '"min(25,ln12)"'],
    ["Skills.txt", "Combustion", "delay", "63"],
    ["Skills.txt", "Combustion", "Param8", "12"],
    ["Skills.txt", "Eruption", "EMinLev5", "28"],
    ["Skills.txt", "Twister", "MinLevDam5", "68"],
    ["Skills.txt", "Twister", "MaxLevDam5", "70"],
    ["Skills.txt", "Tornado", "MinDam", "35"],
    ["Skills.txt", "Tornado", "MaxDam", "39"],
    ["Skills.txt", "Fire Claws", "HitShift", "8"],
    ["Skills.txt", "Fire Claws", "EMin", "11"],
    ["Skills.txt", "Fire Claws", "EMax", "17"],
    ["Skills.txt", "Poison Dagger", "aurastat1", "passive_pois_pierce"],
    ["Skills.txt", "Poison Dagger", "aurastatcalc1", '"min(ln12, 50)"'],
    ["Skills.txt", "Poison Dagger", "calc1", ""],
    ["Skills.txt", "Warmth", "passivestat2", "tohit"],
    ["Skills.txt", "Raise Skeleton Archer", "DmgSymPerCalc", ""],
    ["Skills.txt", "AmpDmg Proc", "Param5", "14"],
    ["Skills.txt", "LowRes Proc", "Param5", "19"],
    ["Skills.txt", "Decrepify Proc", "aurastatcalc5", "-(10 + (lvl/2))"],
    ["Missiles.txt", "royalstrikemeteor", "EMin", "24"],
    ["Missiles.txt", "royalstrikechaosice", "MinELev5", "56"],
    ["Missiles.txt", "clawfirestorm", "NextDelay", "5"],
    ["SkillDesc.txt", "fire claws", "desccalca2", "(enma * 5)/2"],
    ["SkillDesc.txt", "combustion", "desccalca6", "63"],
    ["ItemStatCost.txt", "phasing", "Stat", "phasing"],
    ["Properties.txt", "phasing", "stat1", "phasing"],
    ["CharStats.txt", "Sorceress", "ManaPerMagic", "8"],
    ["CharStats.txt", "Necromancer", "ManaPerMagic", "8"],
    ["CharStats.txt", "Druid", "ManaPerMagic", "8"],
    ["Levels.txt", "Library Map", "MonLvl3Ex", "87"],
    ["Levels.txt", "Dark Temple Map", "Id", "209"],
  ])("retains beta %s %s %s", (name, key, column, expected) => {
    expect(cell(name, key, column)).toBe(expected);
  });
  it.each(["Splint Mail", "Plate Mail", "Field Plate", "Ghost Armor", "Serpentskin Armor", "Demonhide Armor", "Trellised Armor", "Tigulated Mail", "Mesh Armor", "Cuirass", "Russet Armor", "Templar Coat", "Armet", "Giant Conch"])(
    "retains the beta three-socket limit on %s", (key) => {
      expect(cell("Armor.txt", key, "gemsockets")).toBe("3");
    }
  );
  it("retains source integer units and quoted formulas without editing the extract", () => {
    expect(cell("Skills.txt", "Twister", "HitShift")).toBe("7");
    expect(cell("Skills.txt", "Decrepify", "aurastatcalc1")).toBe('-"min(par5 + lvl,60)"');
    expect(cell("Skills.txt", "Summon Fenris", "passivecalc4")).toBe('"min(20,8+((lvl-1)/2))"');
    expect(cell("Skills.txt", "Barbs Aura", "aurastatcalc3")).toBe("skill('Spirit of Barbs'.blvl)/4");
  });
});
