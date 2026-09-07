import { applyMonsterModifiers, getDamageTargetCatalog, readTargetTable } from "./damage-targets";
import type { TargetResistances } from "../types/damage-target";
import request from "supertest";
import express from "express";
import targetRoutes from "../routes/damage-targets";

const catalog = getDamageTargetCatalog();
const zero: TargetResistances = { physical: 0, magic: 0, fire: 0, cold: 0, lightning: 0, poison: 0 };
const monster = (id: string) => catalog.monsters.find((target) => target.id === id)!;

describe("source-backed target catalog", () => {
  it("includes every enabled, killable hostile monster row without conflating variants", () => {
    const expected = readTargetTable("MonStats").filter((row) => row.enabled === "1" && row.killable === "1" && row.npc !== "1" && Number(row.Align || 0) === 0);
    expect(catalog.monsters.filter((target) => target.kind !== "superunique").map((target) => target.id).sort())
      .toEqual(expected.map((row) => row.Id).sort());
    expect(new Set(catalog.monsters.map((target) => target.id)).size).toBe(catalog.monsters.length);
    expect(monster("mephisto")).toBeDefined();
    expect(monster("ubermephisto")).toBeDefined();
    expect(monster("mephistoMap")).toBeDefined();
    expect(monster("Lucion")).toBeDefined();
    expect(monster("NaKrulBoss")).toBeDefined();
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
