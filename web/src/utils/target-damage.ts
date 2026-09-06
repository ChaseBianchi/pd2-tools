import type { DamageElement, DamageProfile, DamageRange, DamageTotals } from "../types/damage";
import type { MonsterTarget, MonsterTargetStats, TargetResistances } from "../types/damage-target";

export interface TargetConditions {
  conviction: number;
  lowerResist: number;
  amplifyDamage: number;
  battleCry: number;
  decrepify: number;
  sanctuary: number;
  staticField: number;
  inferno: number;
  addedResistances: Partial<TargetResistances>;
  protected: boolean;
  immunityAura: boolean;
}

export const EMPTY_TARGET_CONDITIONS: TargetConditions = {
  conviction: 0, lowerResist: 0, amplifyDamage: 0, battleCry: 0,
  decrepify: 0, sanctuary: 0, staticField: 0, inferno: 0,
  addedResistances: {}, protected: false, immunityAura: false,
};
export const DAMAGE_ELEMENTS: DamageElement[] = ["physical", "fire", "cold", "lightning", "magic", "poison"];
const empty = (): DamageRange => ({ min: 0, max: 0 });
const add = (a: DamageRange, b: DamageRange): DamageRange => ({ min: a.min + b.min, max: a.max + b.max });
const scale = (a: DamageRange, n: number): DamageRange => ({ min: a.min * n, max: a.max * n });
const fixed = (n: number) => Math.floor(Math.max(0, n) * 256 + 1e-8) / 256;
const positive = (n: number) => Number.isFinite(n) ? Math.max(0, n) : 0;

export function getEffectiveResistance(base: number, reductions: number[], pierce: number): number {
  // PD2 immunity breakers work at half strength against an immune base.
  // Pierce is applied only after immunity is broken, with a zero resistance floor.
  const reduced = base - reductions.reduce((sum, value) => sum + Math.floor(positive(value) / (base >= 100 ? 2 : 1)), 0);
  return reduced >= 100 ? reduced : Math.max(0, reduced - Math.floor(positive(pierce)));
}

function getTargetPierce(profile: DamageProfile, element: DamageElement) {
  const isPet = profile.skillDamageMode === "summon" ||
    /^(?:Wake of Fire|Wake of Inferno|Inferno Sentry|Lightning Sentry|Chain Lightning Sentry|Death Sentry|Hydra|Lesser Hydra)$/.test(profile.sourceSkillName || profile.skillName);
  const pierce = profile.targetModifiers?.resistancePierce[element] || 0;
  return isPet ? element === "physical" ? 0 : Math.floor(pierce / 2) : pierce;
}

export function targetResistances(profile: DamageProfile, stats: MonsterTargetStats, conditions: TargetConditions): TargetResistances {
  return Object.fromEntries(DAMAGE_ELEMENTS.map((element) => {
    // Curse resistance shortens duration; it is not an effectiveness penalty.
    const curseAllowed = stats.curseResistance < 100;
    const curseStrength = (value: number) => curseAllowed ? Math.floor(value * (100 - Math.min(100, stats.curseEffectReduction)) / 100) : 0;
    const reductions = element === "physical"
      ? [conditions.battleCry, curseStrength(conditions.amplifyDamage), curseStrength(conditions.decrepify)]
      : element === "magic" ? [conditions.sanctuary]
        : [element === "poison" ? 0 : conditions.conviction, curseStrength(conditions.lowerResist),
          element === "fire" ? conditions.inferno : element === "lightning" ? conditions.staticField : 0];
    const inheritedPierce = getTargetPierce(profile, element);
    const base = stats.resistances[element] + (conditions.addedResistances[element] || 0) + (stats.receivesImmunityAura && conditions.immunityAura ? 200 : 0);
    return [element, getEffectiveResistance(base, reductions, inheritedPierce)];
  })) as TargetResistances;
}

export interface TargetDamageResult {
  totals: DamageTotals;
  pulseTotals?: DamageTotals;
  resistances: TargetResistances;
  absorptionHealing: DamageRange;
  pulseAbsorptionHealing?: DamageRange;
}

function emptyTotals(): DamageTotals {
  return { instantDamage: empty(), overTimeDamage: empty(), combinedDamage: empty(),
    averageInstantDamage: 0, averageCombinedDamage: 0, byElement: {} };
}

export function calculateTargetDamage(
  profile: DamageProfile, target: MonsterTarget, stats: MonsterTargetStats,
  conditions: TargetConditions = EMPTY_TARGET_CONDITIONS,
): TargetDamageResult {
  const resistances = targetResistances(profile, stats, conditions);
  const absorptionHealing = empty();
  const mitigate = (value: number, element: DamageElement, flat = true) => {
    if (conditions.protected) return { damage: 0, heal: 0 };
    const reduction = !flat || element === "poison" ? 0 : element === "physical" ? stats.flatPhysicalReduction : stats.flatMagicReduction;
    let damage = fixed(fixed(value - reduction) * Math.max(0, 100 - resistances[element]) / 100);
    const percentAbsorb = fixed(damage * Math.min(40, positive(stats.absorbPercent[element] || 0)) / 100);
    damage -= percentAbsorb;
    const flatAbsorb = flat ? Math.min(damage, positive(stats.absorbFlat[element] || 0)) : 0;
    return { damage: fixed(damage - flatAbsorb), heal: percentAbsorb + flatAbsorb };
  };
  const calculate = (components: DamageProfile["damageComponents"], strikes: DamageProfile["strikeBreakdowns"], healing = absorptionHealing) => {
    const totals = emptyTotals();
    const record = (damage: DamageRange, element: DamageElement, timing: "instant" | "over_time") => {
      totals.byElement[element] = add(totals.byElement[element] || empty(), damage);
      if (timing === "instant") totals.instantDamage = add(totals.instantDamage, damage);
      else totals.overTimeDamage = add(totals.overTimeDamage, damage);
    };
    const adjusted = components.filter((component) => component.includedInTotal !== false)
      .map((component) => {
        const bonus = target.creatureType === "other" ? 0 : component.targetDamageBonuses?.[target.creatureType] || 0;
        if (!bonus || !component.baseDamage || component.damageType !== "physical") return component;
        const multiplier = (100 + (component.physicalBonusPercent || 0) + bonus) / 100;
        return { ...component, damage: { min: Math.floor(component.baseDamage.min * multiplier), max: Math.floor(component.baseDamage.max * multiplier) } };
      });
    const usedPhysical = new Set<string>();
    for (const strike of strikes) {
      const physical = adjusted.filter((c) => strike.physicalComponentIds.includes(c.id) && c.damageType === "physical" && c.timing === "instant");
      physical.forEach((c) => usedPhysical.add(c.id));
      const base = physical.reduce((sum, c) => add(sum, c.damage), empty());
      const outcomes = [
        { chance: 1 - (strike.criticalChance + strike.effectiveDeadlyStrikeChance) / 100, multiplier: 1 },
        { chance: strike.criticalChance / 100, multiplier: strike.criticalMultiplier },
        { chance: strike.effectiveDeadlyStrikeChance / 100, multiplier: strike.deadlyStrikeMultiplier },
      ];
      const damage = empty();
      for (const side of ["min", "max"] as const) {
        for (const outcome of outcomes) {
          const hit = mitigate(base[side] * outcome.multiplier, "physical");
          damage[side] += hit.damage * outcome.chance;
        }
      }
      record(damage, "physical", "instant");
    }
    // Sources within one hit share reduction/absorb once; two-weapon cycles
    // retain independent damage events. Poison lengths must stay separate.
    const groups = new Map<string, { damage: DamageRange; element: DamageElement; timing: "instant" | "over_time"; duration?: number; events: number }>();
    for (const c of adjusted) {
      if (usedPhysical.has(c.id) || c.damageType === "critical" || c.damageType === "deadly") continue;
      const sequence = c.id.match(/^sequence:\d+:/)?.[0] || "hit";
      const missile = c.source === "missile" ? c.sourceRefs.find((ref) => ref.table === "Missiles.txt")?.row : undefined;
      const events = c.damageEventsPerUnit || 1;
      const key = `${sequence}:${missile || "impact"}:${c.damageType}:${c.timing}:${c.poisonDamage?.durationSeconds || 0}:${events}`;
      const group = groups.get(key) || { damage: empty(), element: c.damageType, timing: c.timing, duration: c.poisonDamage?.durationSeconds, events };
      group.damage = add(group.damage, c.damage);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      const damage = empty();
      let duration = group.duration;
      for (const side of ["min", "max"] as const) {
        const hit = mitigate(group.damage[side] / group.events, group.element);
        damage[side] = hit.damage * group.events;
        healing[side] += hit.heal * group.events;
      }
      if (group.element === "poison" && duration) {
        const frames = Math.round(duration * 25);
        // Monster poison-length resistance has no player difficulty penalty.
        const lengthResist = Math.min(75, Math.max(0, stats.poisonLengthReduction - getTargetPierce(profile, "poison")));
        const nextFrames = Math.floor(frames * (100 - lengthResist) / 100);
        duration = nextFrames / 25;
        damage.min = fixed(damage.min * nextFrames / frames);
        damage.max = fixed(damage.max * nextFrames / frames);
        const previous = totals.poisonDamage;
        totals.poisonDamage = { total: (previous?.total || 0) + (damage.min + damage.max) / 2,
          durationSeconds: Math.max(previous?.durationSeconds || 0, duration) };
      }
      record(damage, group.element, group.timing);
    }
    totals.combinedDamage = add(totals.instantDamage, totals.overTimeDamage);
    totals.averageInstantDamage = (totals.instantDamage.min + totals.instantDamage.max) / 2;
    totals.averageCombinedDamage = (totals.combinedDamage.min + totals.combinedDamage.max) / 2;
    return totals;
  };
  const totals = calculate(profile.damageComponents, profile.strikeBreakdowns);
  const pulseAbsorptionHealing = empty();
  const pulseTotals = profile.auraPulseDamageComponents?.length
    ? calculate(profile.auraPulseDamageComponents, [], pulseAbsorptionHealing) : undefined;
  return { totals, pulseTotals, resistances, absorptionHealing, pulseAbsorptionHealing: pulseTotals ? pulseAbsorptionHealing : undefined };
}

export function averageTargetDamage(results: TargetDamageResult[]): DamageTotals | undefined {
  if (!results.length) return undefined;
  const total = emptyTotals();
  for (const { totals } of results) {
    total.instantDamage = add(total.instantDamage, scale(totals.instantDamage, 1 / results.length));
    total.overTimeDamage = add(total.overTimeDamage, scale(totals.overTimeDamage, 1 / results.length));
    for (const element of DAMAGE_ELEMENTS) {
      total.byElement[element] = add(total.byElement[element] || empty(), scale(totals.byElement[element] || empty(), 1 / results.length));
    }
  }
  total.combinedDamage = add(total.instantDamage, total.overTimeDamage);
  total.averageInstantDamage = (total.instantDamage.min + total.instantDamage.max) / 2;
  total.averageCombinedDamage = (total.combinedDamage.min + total.combinedDamage.max) / 2;
  return total;
}
