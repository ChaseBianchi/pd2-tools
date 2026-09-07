import fs from "fs";
import path from "path";
import { evaluateIntegerFormula } from "./game-formula";
import type { DamageElement } from "../types/damage";
import type {
  DamageTargetCatalog, MonsterTarget, MonsterTargetStats, TargetDifficulty,
  TargetResistances,
} from "../types/damage-target";

const DATA = path.resolve(process.cwd(), "src/game-data/pd2/season-13");
const RESIST_COLUMNS: Record<DamageElement, string> = {
  physical: "ResDm", magic: "ResMa", fire: "ResFi", cold: "ResCo",
  lightning: "ResLi", poison: "ResPo",
};
const SUFFIXES: Record<TargetDifficulty, string> = {
  normal: "", nightmare: "(N)", hell: "(H)",
};
type Row = Record<string, string>;

export function readTargetTable(name: string): Row[] {
  const [header, ...lines] = fs.readFileSync(path.join(DATA, `${name}.txt`), "utf8")
    .replace(/^\uFEFF/, "").trimEnd().split(/\r?\n/);
  const columns = header.split("\t");
  return lines.filter(Boolean).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(columns.map((column, index) => [column, cells[index] || ""]));
  });
}

// D2Game MONSTERUNIQUE_UMod_ElementalEnchanted: modifiers are ordered,
// and no further resistance bonus is applied after two immunities exist.
export function applyMonsterModifiers(resistances: TargetResistances, modifiers: number[]) {
  const result = { ...resistances };
  const immuneCount = () => Object.values(result).filter((value) => value >= 100).length;
  for (const modifier of modifiers) {
    if (modifier === 36) { result.physical = 80; continue; }
    if (immuneCount() >= 2) continue;
    if (modifier === 8 || modifier === 27) {
      for (const element of ["cold", "fire", "lightning"] as const) {
        if (immuneCount() < 2 && result[element] < (modifier === 8 ? 100 : 75)) {
          result[element] += modifier === 8 ? 40 : 20;
        }
      }
    } else {
      const bonuses: Record<number, [DamageElement, number]> = {
        9: ["fire", 75], 17: ["lightning", 75], 18: ["cold", 75],
        23: ["poison", 75], 25: ["magic", 20], 28: ["physical", 50],
      };
      const bonus = bonuses[modifier];
      if (bonus) result[bonus[0]] += bonus[1];
    }
  }
  return result;
}

function getStats(row: Row, difficulty: TargetDifficulty, skills: Map<number, Row>, properties?: Row): MonsterTargetStats {
  const suffix = SUFFIXES[difficulty];
  const stats: MonsterTargetStats = {
    resistances: Object.fromEntries(Object.entries(RESIST_COLUMNS)
      .map(([element, column]) => [element, Number(row[column + suffix] || 0)])) as TargetResistances,
    poisonLengthReduction: 0, curseResistance: 0, curseEffectReduction: 0, receivesImmunityAura: false,
    flatPhysicalReduction: 0, flatMagicReduction: 0,
    absorbPercent: {}, absorbFlat: {}, block: Number(row[`ToBlock${suffix}`] || 0), notes: [],
  };
  if (!properties) return stats;
  for (let i = 1; i <= 6; i++) {
    const key = `${i}${suffix ? ` ${suffix}` : ""}`;
    const property = properties[`prop${key}`];
    if (!property) continue;
    const value = Number(properties[`min${key}`] || 0);
    const simple: Record<string, "poisonLengthReduction" | "curseResistance" | "flatPhysicalReduction" | "flatMagicReduction"> = {
      "res-pois-len": "poisonLengthReduction", "curse-res": "curseResistance",
      red: "flatPhysicalReduction", "red-mag": "flatMagicReduction",
    };
    if (simple[property]) stats[simple[property]] += value;
    for (const [code, element] of Object.entries({ fire: "fire", cold: "cold", ltng: "lightning", mag: "magic" } as const)) {
      if (property === `abs-${code}`) stats.absorbFlat[element] = (stats.absorbFlat[element] || 0) + value;
      if (property === `abs-${code}%`) stats.absorbPercent[element] = (stats.absorbPercent[element] || 0) + value;
    }
    if (property === "aura") {
      const aura = Number(properties[`par${key}`]);
      const skill = skills.get(aura);
      if (aura === 109 && skill) {
        // Cleansing uses elemental minimum as its remaining-duration alias.
        let minimum = Number(skill.EMin);
        for (let level = 2; level <= value; level++) {
          const tier = level <= 8 ? 1 : level <= 16 ? 2 : level <= 22 ? 3 : level <= 28 ? 4 : 5;
          minimum += Number(skill[`EMinLev${tier}`]);
        }
        const evaluate = (formula: string) => evaluateIntegerFormula(formula.replace(/\bedmn\b/g, String(minimum)).replace(/\blvl\b/g, String(value)));
        stats.poisonLengthReduction += evaluate(skill.aurastatcalc1);
        stats.curseEffectReduction += evaluate(skill.aurastatcalc2);
      }
      if (aura === 396) {
        // Immune Passive adds 1 + 200 * immune_stat to all six resistances.
        for (const element of Object.keys(RESIST_COLUMNS) as DamageElement[]) stats.resistances[element] += 1;
        stats.receivesImmunityAura = true;
        stats.notes.push("A nearby immunity aura adds 200 to every resistance while active. Enable that condition when the aura source is present.");
      }
      stats.notes.push(`Innate aura: ${skill?.skill || aura}, level ${value}. Nearby aura recipients and encounter phases depend on positioning.`);
    }
  }
  return stats;
}

let catalog: DamageTargetCatalog | undefined;
export function getDamageTargetCatalog(): DamageTargetCatalog {
  if (catalog) return catalog;
  const rows = readTargetTable("MonStats");
  const levels = readTargetTable("Levels");
  const properties = new Map(readTargetTable("MonProp").map((row) => [row.Id, row]));
  const skills = new Map(readTargetTable("Skills").map((row) => [Number(row.Id), row]));
  const names: Record<string, string> = JSON.parse(fs.readFileSync(path.join(DATA, "MonsterNames.json"), "utf8"));
  const name = (key: string) => names[key] || key;
  const monsters: MonsterTarget[] = rows
    .filter((row) => row.enabled === "1" && row.killable === "1" && row.npc !== "1" && Number(row.Align || 0) === 0)
    .map((row) => ({
      id: row.Id, monsterId: row.Id, name: name(row.NameStr),
      kind: row.boss === "1" ? "boss" : "monster",
      creatureType: row.demon === "1" ? "demon" : row.lUndead === "1" || row.hUndead === "1" ? "undead" : "other",
      difficulties: Object.fromEntries(Object.keys(SUFFIXES).map((difficulty) => [difficulty,
        getStats(row, difficulty as TargetDifficulty, skills, properties.get(row.MonProp)),
      ])) as MonsterTarget["difficulties"],
      fixedModifiers: [], areas: [],
      notes: row.boss === "1" || row.primeevil === "1"
        ? ["Damage is per landed hit during the vulnerable phase. Encounter tiers, scripted shields, recovery, blocking, and downtime are not inferred from base resistances."] : [],
    }));
  const byId = new Map(monsters.map((monster) => [monster.id, monster]));
  const canonicalIds = new Map(monsters.map((monster) => [monster.id.toLowerCase(), monster.id]));
  // Distinct rows often share a localized name (campaign/map/uber versions).
  const overrides: Record<string, string> = {
    diabloclone: "Diablo Clone (legacy)", uberdiablonew: "Diablo Clone",
    uberbaal: "Uber Baal", baalclone: "Baal Clone", baalcrab: "Baal",
    mephistoMap: "Mephisto (map)", diabloMap: "Diablo (map)", baalcrabMap: "Baal (map)",
    andarielMap: "Andariel (map)", durielMap: "Duriel (map)",
    rathmaBoneClone: "Rathma (clone)", rathmaPoisonClone: "Mendeln (clone)",
  };
  for (const monster of monsters) if (overrides[monster.id]) monster.name = overrides[monster.id];
  for (const row of readTargetTable("SuperUniques")) {
    const base = byId.get(canonicalIds.get(row.Class.toLowerCase()) || row.Class);
    if (!base) continue;
    const modifiers = [1, 2, 3].map((i) => Number(row[`Mod${i}`] || 0)).filter(Boolean);
    const target: MonsterTarget = {
      ...base, id: `superunique:${row.Superunique}`, name: name(row.Name), kind: "superunique",
      fixedModifiers: modifiers, areas: [],
      difficulties: Object.fromEntries(Object.entries(base.difficulties).map(([difficulty, stats]) => [difficulty, {
        ...stats, resistances: applyMonsterModifiers(stats.resistances, modifiers),
      }])) as MonsterTarget["difficulties"],
      notes: [...base.notes, "Includes fixed SuperUniques.txt modifiers. Additional randomly rolled unique modifiers are not assumed."],
    };
    monsters.push(target);
  }
  for (const level of levels) {
    const area = name(level.LevelName);
    for (const [column, reference] of Object.entries(level)) {
      const id = canonicalIds.get(reference.toLowerCase()) || reference;
      if (/^(?:n?mon|umon)\d+$/.test(column) && byId.has(id)) {
        const monster = byId.get(id)!;
        if (!monster.areas.includes(area)) monster.areas.push(area);
      }
    }
  }
  const maps = levels.filter((row) => Number(row.Id) >= 138 && Number(row.NumMon) > 0 && !/pvp|BR Arena/i.test(row.Name))
    .map((row) => {
      const ids = [...new Set(Object.entries(row).filter(([key, value]) => /^nmon\d+$/.test(key) && value)
        .map(([, value]) => canonicalIds.get(value.toLowerCase()) || value))];
      const missing = ids.filter((id) => !byId.has(id));
      if (missing.length) throw new Error(`Unresolved map spawn references in ${row.Name}: ${missing.join(", ")}`);
      const areaLevel = Number(row.MonLvl3Ex);
      return {
        id: row.Id, name: name(row.LevelName),
        tier: areaLevel >= 87 && areaLevel <= 89 ? (areaLevel - 86) as 1 | 2 | 3 : null,
        monsterIds: ids.filter((id) => byId.get(id)!.kind !== "boss"),
        bossIds: ids.filter((id) => byId.get(id)!.kind === "boss"),
        notes: ["Equal weight per distinct monster type in the Hell spawn pool. This is not a prediction of spawn frequencies or clear speed. Bosses, random affixes, map events, summoned reinforcements, and map rolls are excluded from the average."],
      };
    }).filter((map) => map.monsterIds.length > 0);
  monsters.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  maps.sort((a, b) => a.name.localeCompare(b.name));
  catalog = { season: 13, monsters, maps };
  return catalog;
}
