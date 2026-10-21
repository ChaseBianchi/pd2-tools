import fs from "fs";
import path from "path";
import type { CombatCatalog, CombatResistances } from "../types/combat";
const directory = path.resolve(process.cwd(), "src/game-data/pd2/season-14");
export function readCombatTable(name: string): Record<string, string>[] {
  const [header, ...lines] = fs
    .readFileSync(path.join(directory, `${name}.txt`), "utf8")
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split(/\r?\n/);
  const keys = header.split("\t");
  return lines.map((line) =>
    Object.fromEntries(
      line.split("\t").map((value, index) => [keys[index], value])
    )
  );
}
const suffixes = ["", "(N)", "(H)"];
export const combatElementStats: Record<keyof CombatResistances, string> = {
  physical: "damageresist",
  fire: "fireresist",
  cold: "coldresist",
  lightning: "lightresist",
  poison: "poisonresist",
  magic: "magicresist",
};
export const emptyCombatResistances = (): CombatResistances => ({
  physical: 0,
  fire: 0,
  cold: 0,
  lightning: 0,
  magic: 0,
  poison: 0,
});
export const combatWeapons = new Map(
  readCombatTable("Weapons").map((row) => [row.code, row])
);
export const combatClasses = new Map(
  readCombatTable("CharStats").map((row) => [row.class, row])
);
let catalog: CombatCatalog | undefined;
export function getCombatCatalog(): CombatCatalog {
  if (catalog) return catalog;
  const names: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(directory, "TargetNames.json"), "utf8")
  );
  const animations = JSON.parse(
    fs.readFileSync(path.join(directory, "CombatAnimations.json"), "utf8")
  );
  const resistColumns = {
    physical: "ResDm",
    fire: "ResFi",
    cold: "ResCo",
    lightning: "ResLi",
    poison: "ResPo",
    magic: "ResMa",
  };
  const monsters = readCombatTable("MonStats")
    .filter(
      (row) =>
        row.enabled === "1" &&
        row.killable === "1" &&
        row.npc !== "1" &&
        row.Align !== "1"
    )
    .map((row) => ({
      id: row.Id,
      name: (names[row.NameStr] || row.NameStr || row.Id).replace(
        /(?:ÿ|Ã¿)c[0-9a-z]/gi,
        ""
      ),
      demon: row.demon === "1",
      undead: row.lUndead === "1" || row.hUndead === "1",
      boss: row.boss === "1",
      primeEvil: row.primeevil === "1",
      noRatio: row.noRatio === "1",
      levels: suffixes.map((s) => Number(row[`Level${s}`]) || 1),
      defense: suffixes.map((s) => Number(row[`AC${s}`]) || 0),
      life: suffixes.map((s, i) => ({
        min: Number(row[`${i ? "MinHP" : "minHP"}${s}`]) || 0,
        max: Number(row[`${i ? "MaxHP" : "maxHP"}${s}`]) || 0,
      })),
      block: suffixes.map((s) => Number(row[`ToBlock${s}`]) || 0),
      resistances: suffixes.map(
        (s) =>
          Object.fromEntries(
            Object.entries(resistColumns).map(([element, column]) => [
              element,
              Number(row[`${column}${s}`]) || 0,
            ])
          ) as CombatResistances
      ),
    }));
  const known = new Set(monsters.map((m) => m.id));
  const areas = readCombatTable("Levels")
    .filter((row) => Number(row.Id) > 0)
    .map((row) => ({
      id: row.Id,
      name: names[row.LevelName] || row.LevelName || row.Name,
      map:
        (Number(row.Id) >= 138 && Number(row.Id) <= 201) ||
        row.Name.endsWith(" Map"),
      levels: [1, 2, 3].map((i) => Number(row[`MonLvl${i}Ex`]) || 1),
      monsters: ["mon", "nmon", "nmon"].map((prefix) => [
        ...new Set(
          Array.from({ length: 25 }, (_, i) => row[`${prefix}${i + 1}`]).filter(
            (id) => known.has(id)
          )
        ),
      ]),
    }))
    .filter((area) => area.monsters.some((list) => list.length));
  catalog = {
    monsters,
    areas,
    ...animations,
    pulseRates: Object.fromEntries(
      readCombatTable("Skills")
        .filter(
          (row) =>
            Number(row.perdelay) > 0 && ["66", "81"].includes(row.srvdofunc)
        )
        .map((row) => [row.skill, 25 / Number(row.perdelay)])
    ),
    monsterLevels: readCombatTable("MonLvl").map((row) => ({
      level: Number(row.Level),
      defense: suffixes.map((s) => Number(row[`L-AC${s}`])),
      life: suffixes.map((s) => Number(row[`L-HP${s}`])),
    })),
  };
  return catalog!;
}
