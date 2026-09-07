import { describe, expect, it } from "vitest";
import monsterTable from "../../../api/src/game-data/pd2/season-13/MonStats.txt?raw";
import type { DamageComponent, DamageElement, DamageProfile } from "../types/damage";
import type { MonsterTarget, MonsterTargetStats, TargetResistances } from "../types/damage-target";
import { averageTargetDamage, calculateTargetDamage, EMPTY_TARGET_CONDITIONS, getActiveConvictionLevel, getEffectiveResistance } from "./target-damage";

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
  it("uses the strongest stored or dynamically active Conviction source", () => {
    const p = profile([], {
      activeAuras: [{ name: "Conviction", level: 15, source: "manual", carrier: "party" }],
      targetModifiers: { resistancePierce: {}, convictionLevel: 12 },
    });
    expect(getActiveConvictionLevel(p)).toBe(15);
    p.activeAuras[0].level = 10;
    expect(getActiveConvictionLevel(p)).toBe(12);
  });
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
      { ...EMPTY_TARGET_CONDITIONS, decrepify: 20, sanctuary: 30, staticField: 40, inferno: 50,
        arcticBlast: 30, plaguePoppy: 40 });
    expect(result.resistances).toEqual({ physical: 90, magic: 85, fire: 75, lightning: 80, cold: 20, poison: 10 });
  });
  it("applies Arctic Blast and Plague Poppy at half strength against immunities", () => {
    const result = calculateTargetDamage(profile([component("cold"), component("poison")]), target,
      { ...stats, resistances: { ...zero, cold: 110, poison: 110 } },
      { ...EMPTY_TARGET_CONDITIONS, arcticBlast: 21, plaguePoppy: 31 });
    expect(result.resistances.cold).toBe(100);
    expect(result.resistances.poison).toBe(95);
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
    [75, [], 0, 75], [75, [34], 10, 31], [75, [200], 100, -100],
    [100, [], 200, 100], [116, [34], 10, 89], [117, [34], 200, 100],
    [120, [35, 11], 5, 93], [100, [1], 100, 100], [100, [2], 0, 99],
    [25, [30, 30], 12, -23], [0, [], 1, 0], [0, [], 2, -1], [0, [], 200, -100],
    [-25, [], 0, -25], [-25, [1], 0, -25], [-25, [2], 0, -26],
  ])("handles resistance %i, breakers %j and pierce %i", (base, breakers, pierce, expected) => {
    expect(getEffectiveResistance(base, breakers, pierce)).toBe(expected);
  });
  it("amplifies damage against negative resistance after diminishing returns", () => {
    const result = calculateTargetDamage(profile([component("cold", 100, 100)], {
      targetModifiers: { resistancePierce: { cold: 12 }, convictionLevel: 0 },
    }), target, { ...stats, resistances: { ...zero, cold: 25 } }, {
      ...EMPTY_TARGET_CONDITIONS, conviction: 30, lowerResist: 30,
    });
    expect(result.resistances.cold).toBe(-23);
    expect(result.totals.combinedDamage).toEqual({ min: 123, max: 123 });
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
  it("uses the profile-effective pierce exported by the API without a second pet penalty", () => {
    const p = profile([component("fire"), component("physical")], { skillName: "Skeletal Mage", skillDamageMode: "summon",
      targetModifiers: { resistancePierce: { fire: 10, physical: 0 }, convictionLevel: 0 } });
    const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, fire: 75, physical: 50 } });
    expect(result.resistances.fire).toBe(65);
    expect(result.resistances.physical).toBe(50);
  });
  it("applies poison pierce to poison-length resistance as well as damage resistance", () => {
    const p = profile([{ ...component("poison", 1000, 1000), timing: "over_time", poisonDamage: { total: 1000, durationSeconds: 4 } }],
      { targetModifiers: { resistancePierce: { poison: 20 }, convictionLevel: 0 } });
    const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, poison: 50 }, poisonLengthReduction: 50 });
    expect(result.totals.poisonDamage).toEqual({ total: 490, durationSeconds: 2.8 });
  });
  it.each([[20, 4.8], [200, 8]])("extends poison duration below zero PLR with %i pierce", (pierce, durationSeconds) => {
    const p = profile([{ ...component("poison", 1000, 1000), timing: "over_time", poisonDamage: { total: 1000, durationSeconds: 4 } }],
      { targetModifiers: { resistancePierce: { poison: pierce }, convictionLevel: 0 } });
    const result = calculateTargetDamage(p, target, stats);
    expect(result.totals.poisonDamage?.durationSeconds).toBe(durationSeconds);
  });
  it("applies local physical pierce to its own strike", () => {
    const p = profile([component("physical")], {
      skillDamageMode: "weapon",
      strikeBreakdowns: [{ id: "hit", physicalComponentIds: ["physical"], criticalChance: 0, criticalMultiplier: 2,
        effectiveDeadlyStrikeChance: 0, deadlyStrikeMultiplier: 1.5, resistancePierce: 20 } as DamageProfile["strikeBreakdowns"][number]],
    });
    const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, physical: 50 } });
    expect(result.totals.combinedDamage).toEqual({ min: 70, max: 140 });
    expect(result.physicalResistanceRange).toEqual({ min: 30, max: 30 });
  });
  it("reports the resistance range used by distinct dual-weapon strikes", () => {
    const strike = (id: string, pierce: number) => ({ id, label: id, physicalComponentIds: [id], rawCriticalChance: 0,
      criticalChance: 0, criticalMultiplier: 2, rawDeadlyStrikeChance: 0, rawMaxDeadlyStrikeChance: 75,
      deadlyStrikeChance: 0, maxDeadlyStrikeChance: 75, effectiveDeadlyStrikeChance: 0, deadlyStrikeMultiplier: 1.5,
      resistancePierce: pierce } as DamageProfile["strikeBreakdowns"][number]);
    const p = profile([component("physical", 100, 100, "right"), component("physical", 100, 100, "left")], {
      skillDamageMode: "weapon", strikeBreakdowns: [strike("right", 10), strike("left", 30)],
    });
    const result = calculateTargetDamage(p, target, { ...stats, resistances: { ...zero, physical: 50 } });
    expect(result.totals.combinedDamage).toEqual({ min: 140, max: 140 });
    expect(result.physicalResistanceRange).toEqual({ min: 20, max: 40 });
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
        expect(result.totals.combinedDamage.max).toBeLessThanOrEqual(2400);
        expect(result.totals.combinedDamage.max).toBeGreaterThanOrEqual(result.totals.combinedDamage.min);
      }
    }
  });
});
