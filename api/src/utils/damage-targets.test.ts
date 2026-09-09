import { applyMonsterModifiers, getDamageTargetCatalog, readTargetTable } from "./damage-targets";
import type { TargetResistances } from "../types/damage-target";
import request from "supertest";
import express from "express";
import targetRoutes from "../routes/damage-targets";

const catalog = getDamageTargetCatalog();
const zero: TargetResistances = { physical: 0, magic: 0, fire: 0, cold: 0, lightning: 0, poison: 0 };
const monster = (id: string) => catalog.monsters.find((target) => target.id === id)!;

describe("source-backed target catalog", () => {
  it("keeps distinct campaign, map, and encounter variants", () => {
    expect(new Set(catalog.monsters.map((target) => target.id)).size).toBe(catalog.monsters.length);
    expect(monster("mephisto")).toBeDefined();
    expect(monster("ubermephisto")).toBeDefined();
    expect(monster("mephistoMap")).toBeDefined();
    expect(monster("Lucion")).toBeDefined();
    expect(monster("NaKrulBoss")).toBeDefined();
  });
  it("excludes unnamed objects, unattackable helpers, and zero-life unused rows", () => {
    for (const id of ["window1", "window2", "larva", "quillbear1", "quillbear5", "evilhole1", "minispider", "demonhole", "monhydra1", "monhydra2", "monhydra3", "minionspawner1", "minionspawner8", "DemonPortal", "demonspawner"]) {
      expect(monster(id)).toBeUndefined();
    }
    expect(catalog.monsters.every((target) => target.name.trim())).toBe(true);
    // Inert does not mean unattackable: nests and this map boss are valid targets.
    expect(monster("crownest1")).toBeDefined();
    expect(monster("KyovoshadBoss")).toBeDefined();
    expect(monster("targetdummy")).toBeDefined();
  });
  it("excludes scenery while retaining combat constructs in map pools", () => {
    for (const id of ["trap-melee", "turret1", "turret2", "turret3", "boneprison1", "boneprison2", "boneprison3", "boneprison4", "barricadewall1", "barricadewall2", "barricadedoor1", "barricadedoor2", "barricadetower", "catapult1", "catapult4", "prisondoor"]) {
      expect(monster(id)).toBeUndefined();
    }
    expect(monster("firetowerMarket")).toBeDefined();
    expect(monster("flyingscimitarMarket")).toBeDefined();
  });
  it("does not apply an unused superunique template to the directly placed Canight boss", () => {
    const placements = readTargetTable("MonPreset").map((row) => row.Place);
    expect(placements).toContain("willowispboss");
    expect(placements).not.toContain("Wisp Boss");
    expect(catalog.monsters.filter((target) => target.name === "Canight The Corrupted").map((target) => target.id)).toEqual(["willowispboss"]);
    expect(monster("willowispboss").fixedModifiers).toEqual([]);
  });
  it("excludes reviewed test and legacy definitions while keeping their live encounters", () => {
    for (const id of ["cantorboss", "DungeonTest3", "diabloclone"]) expect(monster(id)).toBeUndefined();
    expect(catalog.monsters.filter((target) => target.name === "Radament").map((target) => target.id)).toEqual(["superunique:Radament"]);
    expect(monster("uberdiablonew").name).toBe("Diablo Clone");
  });
  it("consolidates equivalent defensive profiles without conflating different defenses", () => {
    expect(monster("baalminion1")).toBeDefined();
    expect(monster("baalminion2")).toBeUndefined();
    expect(monster("baalminion3")).toBeUndefined();
    expect(catalog.monsters.filter((target) => target.name === "Abhorrent")).toHaveLength(1);
    const profiles = catalog.monsters.map(({ name, kind, creatureType, difficulties, fixedModifiers, notes }) =>
      JSON.stringify([name, kind, creatureType, difficulties, fixedModifiers, notes]));
    expect(new Set(profiles).size).toBe(profiles.length);
    expect(monster("mephisto").difficulties).not.toEqual(monster("ubermephisto").difficulties);
    expect(monster("mColdNihlMinion").difficulties.hell).toEqual(monster("mFireNihlMinion").difficulties.hell);
    expect(monster("mColdNihlMinion").difficulties.normal).not.toEqual(monster("mFireNihlMinion").difficulties.normal);
  });
  it("shows the actual named encounter instead of its unmodified quest template", () => {
    for (const name of ["The Smith", "The Summoner", "Griswold", "Hephasto The Armorer", "Nihlathak", "Talic", "Madawc", "Korlic"]) {
      const targets = catalog.monsters.filter((target) => target.name === name);
      expect(targets).toHaveLength(1);
      expect(targets[0].kind).toBe("superunique");
    }
    // Hephasto's fixed Spectral Hit raises 25 cold to 45; 75 fire stays capped.
    expect(monster("superunique:The Feature Creep").difficulties.hell.resistances.cold).toBe(45);
    expect(monster("superunique:The Feature Creep").difficulties.hell.resistances.fire).toBe(75);
    expect(monster("fallenshaman1")).toBeDefined(); // ordinary species used by Bishibosh
  });
  it("distinguishes the Cistern boss from its minion despite their equal resistances", () => {
    const boss = monster("lernaeanhydra2");
    const minion = monster("lernaeanhydra1");
    expect(boss.name).toBe("Ancient Cistern Hydra (boss)");
    expect(minion.name).toBe("Ancient Cistern Hydra (minion)");
    expect(boss.difficulties.hell.resistances).toEqual(minion.difficulties.hell.resistances);
    expect(boss.difficulties.hell.block).toBe(27);
    expect(minion.difficulties.hell.block).toBe(24);
    expect(readTargetTable("MonStats").find((row) => row.Id === boss.id)?.minion1).toBe(minion.id);
  });
  it("uses independent literal Mephisto difficulty resistances", () => {
    expect(monster("mephisto").difficulties.normal.resistances).toEqual({ physical: 0, magic: 0, fire: 33, cold: 25, lightning: 33, poison: 50 });
    expect(monster("mephisto").difficulties.hell.resistances).toEqual({ physical: 20, magic: 50, fire: 75, cold: 75, lightning: 75, poison: 75 });
  });
  it("reads absorption and poison length reduction from MonProp with difficulty-specific columns", () => {
    const clone = monster("uberdiablonew");
    expect(clone.difficulties.hell.absorbFlat.fire).toBe(8);
    expect(clone.difficulties.hell.poisonLengthReduction).toBe(50);
    expect(clone.difficulties.hell.curseResistance).toBe(95);
    expect(clone.difficulties.normal.absorbFlat.fire).toBeUndefined();
    expect(monster("Lucion").difficulties.normal.poisonLengthReduction).toBe(50);
    expect(monster("Lucion").difficulties.hell.poisonLengthReduction).toBe(30);
  });
  it("applies the boss's level 15 Cleansing aura using its source formulas", () => {
    const stats = monster("ImperialPalaceMiniBoss").difficulties.hell;
    // EMin 25 + fourteen levels * 2 = 53; PLR = 100 - 53.
    expect(stats.poisonLengthReduction).toBe(47);
    expect(stats.curseEffectReduction).toBe(17);
    expect(stats.curseResistance).toBe(0); // equipped aura has no invested points
  });
  it("does not expose string-table formatting codes or mojibake in names", () => {
    for (const entry of [...catalog.monsters, ...catalog.maps]) {
      expect(entry.name).not.toMatch(/[\u00ff\u00c3]/);
      expect(entry.name.includes(String.fromCharCode(0))).toBe(false);
    }
  });
  it("includes each named-monster variant and applies its ordered fixed modifiers", () => {
    const bishibosh = monster("superunique:Bishibosh");
    expect(bishibosh.fixedModifiers).toEqual([8, 9]);
    // Fallen Shaman starts at 25 fire: 25 + 40 magic resistant + 75 fire enchanted.
    expect(bishibosh.difficulties.normal.resistances.fire).toBe(140);
    expect(bishibosh.difficulties.normal.resistances.cold).toBe(40);
    expect(bishibosh.name).toBe("Bishibosh");
  });
  it("resolves every map reference case-insensitively and keeps pools distinct", () => {
    const ids = new Set(catalog.monsters.map((target) => target.id));
    for (const map of catalog.maps) {
      expect(map.monsterIds.length).toBeGreaterThan(0);
      expect(new Set(map.monsterIds).size).toBe(map.monsterIds.length);
      expect(map.monsterIds.every((id) => ids.has(id))).toBe(true);
      expect(map.monsterIds.every((id) => monster(id).kind !== "boss")).toBe(true);
    }
    const road = catalog.maps.find((map) => map.id === "191")!;
    expect(road.monsterIds).toEqual(["wraith3DemonRoad", "goatman3DemonRoad", "skmage_fire1DemonRoad", "succubus4DemonRoad", "blunderbore2DemonRoad", "clawviper1DemonRoad", "unraveler1DemonRoad", "skeleton2DemonRoad"]);
    expect(catalog.maps.find((map) => map.id === "183")!.monsterIds).toHaveLength(6); // duplicate mosquito slot
    expect(catalog.maps.find((map) => map.id === "194")).toBeUndefined(); // no random spawns, despite stale nmon cells
    const outerVoid = catalog.maps.find((map) => map.name === "The Outer Void")!;
    expect(outerVoid.monsterIds).toEqual(["voidBeast", "voidWatcher", "voidFrog", "voidKnightCorridor", "voidling"]);
    expect(monster("voidFrog").areas).toContain("The Outer Void");
    expect(monster("superunique:Ancient Barbarian 1").areas).toContain("Arreat Summit");
  });
  it("assigns map tiers from Hell expansion area levels", () => {
    expect(catalog.maps.find((map) => map.id === "146")!.tier).toBe(1); // Ancestral Trial
    expect(catalog.maps.find((map) => map.id === "175")!.tier).toBe(2); // Ashen Plains
    expect(catalog.maps.find((map) => map.id === "201")!.tier).toBe(3); // Kyovashad
    expect(catalog.maps.find((map) => map.id === "164")!.tier).toBeNull(); // dungeon
  });
  it("keeps all resistances and reductions finite across the entire catalog", () => {
    for (const target of catalog.monsters) for (const stats of Object.values(target.difficulties)) {
      for (const value of Object.values(stats.resistances)) expect(Number.isFinite(value)).toBe(true);
      expect(stats.poisonLengthReduction).toBeGreaterThanOrEqual(0);
    }
  });
  it("serves the catalog through the real route with caching", async () => {
    const app = express().use("/damage-targets", targetRoutes);
    const response = await request(app).get("/damage-targets").expect(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
    expect(response.body.monsters).toHaveLength(catalog.monsters.length);
    expect(response.body.maps).toHaveLength(catalog.maps.length);
  });
});

it("stops unique resistance bonuses at two immunities, retaining modifier order", () => {
  expect(applyMonsterModifiers({ ...zero, cold: 80, fire: 80 }, [8, 17, 28]))
    .toEqual({ ...zero, cold: 120, fire: 120 });
  expect(applyMonsterModifiers({ ...zero, physical: 70 }, [28]).physical).toBe(120);
  expect(applyMonsterModifiers(zero, [36]).physical).toBe(80);
});
