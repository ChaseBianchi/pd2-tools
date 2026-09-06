import { describe, expect, it } from "vitest";
import monsterTable from "../../../api/src/game-data/pd2/season-13/MonStats.txt?raw";
import type { DamageComponent, DamageElement, DamageProfile } from "../types/damage";
import type { MonsterTarget, MonsterTargetStats, TargetResistances } from "../types/damage-target";
import { averageTargetDamage, calculateTargetDamage, EMPTY_TARGET_CONDITIONS, getEffectiveResistance } from "./target-damage";

const zero: TargetResistances = { physical: 0, fire: 0, cold: 0, lightning: 0, magic: 0, poison: 0 };
const stats: MonsterTargetStats = { resistances: zero, poisonLengthReduction: 0, curseResistance: 0, curseEffectReduction: 0, receivesImmunityAura: false,
  flatPhysicalReduction: 0, flatMagicReduction: 0, absorbPercent: {}, absorbFlat: {}, block: 0, notes: [] };
const target = { id: "test", creatureType: "other" } as MonsterTarget;
function component(element: DamageElement, min = 100, max = 200, id: string = element): DamageComponent {
  return { id, label: id, source: "skill", timing: "instant", damageType: element, damage: { min, max }, sourceRefs: [], notes: [] };
}
function profile(components: DamageComponent[], overrides: Partial<DamageProfile> = {}): DamageProfile {
  return { damageComponents: components, strikeBreakdowns: [], skillName: "Fire Ball", skillDamageMode: "spell",
    targetModifiers: { resistancePierce: {}, convictionLevel: 0 }, ...overrides } as DamageProfile;
}

describe("independent target mitigation arithmetic", () => {
  it("applies flat absorption per stream event rather than once per second", () => {
    const stream = { ...component("fire", 2500, 2500), timing: "over_time" as const, damageEventsPerUnit: 25 };
    const result = calculateTargetDamage(profile([stream]), target, { ...stats, absorbFlat: { fire: 8 } });
    expect(result.totals.combinedDamage.min).toBe(2300); // 25 * (100 - 8)
    expect(result.absorptionHealing.min).toBe(200);
  });
  it("keeps child missile absorption separate from the weapon impact", () => {
    const missile = { ...component("fire", 100, 100, "explosion"), source: "missile" as const,
      sourceRefs: [{ table: "Missiles.txt", row: "explosion", columns: ["EMin"] }] };
    expect(calculateTargetDamage(profile([component("fire", 100, 100), missile]), target,
      { ...stats, absorbFlat: { fire: 8 } }).totals.combinedDamage.min).toBe(184);
  });
  it("supports each additional resistance debuff only for its affected element", () => {
    const result = calculateTargetDamage(profile([component("magic")]), target,
      { ...stats, resistances: { physical: 100, magic: 100, fire: 100, lightning: 100, cold: 50, poison: 50 } },
      { ...EMPTY_TARGET_CONDITIONS, decrepify: 20, sanctuary: 30, staticField: 40, inferno: 50 });
    expect(result.resistances).toEqual({ physical: 90, magic: 85, fire: 75, lightning: 80, cold: 50, poison: 50 });
  });
  it("reduces curse effectiveness before applying the immunity penalty", () => {
    const conditions = { ...EMPTY_TARGET_CONDITIONS, lowerResist: 41 };
    const result = calculateTargetDamage(profile([component("fire")]), target,
      { ...stats, curseEffectReduction: 17, resistances: { ...zero, fire: 110 } }, conditions);
    // floor(41 * .83) = 34; immune reduction = 17, leaving 93.
    expect(result.resistances.fire).toBe(93);
  });
  it("models the source-backed immunity aura separately from invulnerability", () => {
    const result = calculateTargetDamage(profile([component("fire")]), target,
      { ...stats, receivesImmunityAura: true, resistances: { ...zero, fire: 1 } },
      { ...EMPTY_TARGET_CONDITIONS, immunityAura: true });
    expect(result.resistances.fire).toBe(201);
    expect(result.totals.combinedDamage.min).toBe(0);
  });
  it.each([
    [75, [], 0, 75], [75, [34], 10, 31], [75, [200], 100, 0],
    [100, [], 200, 100], [116, [34], 10, 89], [117, [34], 200, 100],
    [120, [35, 11], 5, 93], [100, [1], 100, 100], [100, [2], 0, 99],
  ])("handles resistance %i, breakers %j and pierce %i", (base, breakers, pierce, expected) => {
    expect(getEffectiveResistance(base, breakers, pierce)).toBe(expected);
  });
  it("mitigates Vengeance's three elements and physical strike expectation independently", () => {
    const p = profile([component("physical"), component("fire"), component("cold"), component("lightning")], {
      skillName: "Vengeance", skillDamageMode: "weapon",
      strikeBreakdowns: [{ id: "hit", physicalComponentIds: ["physical"], criticalChance: 50, criticalMultiplier: 2,
        effectiveDeadlyStrikeChance: 0, deadlyStrikeMultiplier: 1.5 } as DamageProfile["strikeBreakdowns"][number]],
    });
    // Hell Mephisto: 20% physical, 75% fire/cold/lightning.
    // Physical 150-300 expected * .8 = 120-240; elements 3 * 25-50.
    expect(calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, physical: 20, fire: 75, cold: 75, lightning: 75 } }).totals.combinedDamage)
      .toEqual({ min: 195, max: 390 });
  });
  it("applies fixed reduction to actual critical outcomes before averaging", () => {
    const p = profile([component("physical", 10, 10)], {
      strikeBreakdowns: [{ id: "hit", physicalComponentIds: ["physical"], criticalChance: 50, criticalMultiplier: 2,
        effectiveDeadlyStrikeChance: 0, deadlyStrikeMultiplier: 1.5 } as DamageProfile["strikeBreakdowns"][number]],
    });
    // ordinary max(10-15,0)=0; critical max(20-15,0)=5; expected 2.5.
    expect(calculateTargetDamage(p, target, { ...stats, flatPhysicalReduction: 15 }).totals.combinedDamage.min).toBe(2.5);
  });
  it("deducts absorption once per element per hit and exposes its separate healing", () => {
    const p = profile([component("fire", 40, 40, "skill"), component("fire", 60, 60, "item")]);
    const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, fire: 50 }, absorbFlat: { fire: 8 } });
    expect(result.totals.combinedDamage).toEqual({ min: 42, max: 42 });
    expect(result.absorptionHealing).toEqual({ min: 8, max: 8 });
  });
  it("keeps dual-weapon damage events separate for absorption", () => {
    const p = profile([component("fire", 100, 100, "sequence:1:fire"), component("fire", 100, 100, "sequence:2:fire")]);
    expect(calculateTargetDamage(p, target, { ...stats, absorbFlat: { fire: 8 } }).totals.combinedDamage.min).toBe(184);
  });
  it("combines poison resistance and poison-length reduction without changing raw data", () => {
    const poison = { ...component("poison", 1000, 1000), timing: "over_time" as const, poisonDamage: { total: 1000, durationSeconds: 4 } };
    const p = profile([poison]);
    const before = JSON.stringify(p);
    const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, poison: 50 }, poisonLengthReduction: 50 });
    expect(result.totals.combinedDamage.min).toBe(250);
    expect(result.totals.poisonDamage).toEqual({ total: 250, durationSeconds: 2 });
    expect(JSON.stringify(p)).toBe(before);
  });
  it("halves inherited elemental pierce for summons and traps without inheriting physical pierce", () => {
    for (const [skillName, skillDamageMode] of [["Skeletal Mage", "summon"], ["Lightning Sentry", "spell"]] as const) {
      const p = profile([component("fire"), component("physical")], { skillName, skillDamageMode,
        targetModifiers: { resistancePierce: { fire: 21, physical: 20 }, convictionLevel: 0 } });
      const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, fire: 75, physical: 50 } });
      expect(result.resistances.fire).toBe(65);
      expect(result.resistances.physical).toBe(50);
    }
  });
  it("applies poison pierce to poison-length resistance as well as damage resistance", () => {
    const p = profile([{ ...component("poison", 1000, 1000), timing: "over_time", poisonDamage: { total: 1000, durationSeconds: 4 } }],
      { targetModifiers: { resistancePierce: { poison: 20 }, convictionLevel: 0 } });
    const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, poison: 50 }, poisonLengthReduction: 50 });
    expect(result.totals.poisonDamage).toEqual({ total: 490, durationSeconds: 2.8 });
  });
  it("distinguishes curse duration resistance from immunity", () => {
    const conditions = { ...EMPTY_TARGET_CONDITIONS, lowerResist: 40, conviction: 20 };
    expect(calculateTargetDamage(profile([component("fire")]), target, { ...stats, curseResistance: 95, resistances: { ...zero, fire: 75 } }, conditions).resistances.fire).toBe(15);
    expect(calculateTargetDamage(profile([component("fire")]), target, { ...stats, curseResistance: 100, resistances: { ...zero, fire: 75 } }, conditions).resistances.fire).toBe(55);
  });
  it("includes enemy-type enhanced damage before resistance", () => {
    const p = profile([{ ...component("physical", 200, 400), baseDamage: { min: 100, max: 200 }, physicalBonusPercent: 100,
      targetDamageBonuses: { demon: 50, undead: 100 } }]);
    expect(calculateTargetDamage(p, { ...target, creatureType: "demon" }, { ...stats, resistances: { ...zero, physical: 20 } }).totals.combinedDamage)
      .toEqual({ min: 200, max: 400 });
  });
  it("keeps excluded effects out of totals and aura pulses separate", () => {
    const p = profile([component("fire"), { ...component("fire", 900, 900, "ground"), includedInTotal: false }], { auraPulseDamageComponents: [component("fire", 40, 40)] });
    const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, fire: 50 } });
    expect(result.totals.combinedDamage).toEqual({ min: 50, max: 100 });
    expect(result.pulseTotals?.combinedDamage).toEqual({ min: 20, max: 20 });
  });
  it("makes protected phases deal zero damage including poison and pulses", () => {
    const result = calculateTargetDamage(profile([component("fire")], { auraPulseDamageComponents: [component("fire")] }), target, stats, { ...EMPTY_TARGET_CONDITIONS, protected: true });
    expect(result.totals.combinedDamage.max).toBe(0);
    expect(result.pulseTotals?.combinedDamage.max).toBe(0);
  });
  it("averages outcomes after immunity mitigation, rather than averaging resistance", () => {
    const p = profile([component("fire")]);
    const results = [0, 150].map((fire) => calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, fire } }));
    expect(averageTargetDamage(results)?.combinedDamage).toEqual({ min: 50, max: 100 });
    expect(averageTargetDamage([])).toBeUndefined();
  });
  it("sweeps every committed monster resistance row across all difficulties and damage modes", () => {
    const [header, ...lines] = monsterTable.trimEnd().split(/\r?\n/);
    const columns = header.split("\t");
    const fields = { physical: "ResDm", fire: "ResFi", cold: "ResCo", lightning: "ResLi", poison: "ResPo", magic: "ResMa" };
    for (const line of lines) {
      const row = Object.fromEntries(line.split("\t").map((value, index) => [columns[index], value]));
      if (row.enabled !== "1" || row.killable !== "1") continue;
      for (const suffix of ["", "(N)", "(H)"]) for (const skillDamageMode of ["weapon", "spell", "summon"] as const) {
        const resistances = Object.fromEntries(Object.entries(fields).map(([element, column]) => [element, Number(row[column + suffix] || 0)])) as TargetResistances;
        const result = calculateTargetDamage(profile(Object.keys(fields).map((element) => component(element as DamageElement)), { skillDamageMode }), target, { ...stats, resistances });
        expect(Number.isFinite(result.totals.averageCombinedDamage)).toBe(true);
        expect(result.totals.combinedDamage.min).toBeGreaterThanOrEqual(0);
        expect(result.totals.combinedDamage.max).toBeLessThanOrEqual(1200);
        expect(result.totals.combinedDamage.max).toBeGreaterThanOrEqual(result.totals.combinedDamage.min);
      }
    }
  });
});
