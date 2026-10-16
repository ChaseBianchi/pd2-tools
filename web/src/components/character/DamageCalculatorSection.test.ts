import { describe, expect, it } from "vitest";
import type {
  DamageAuraOption,
  DamageCalculation,
  DamageProfile,
} from "../../types";
import {
  applyAuraToProfile,
  findPrecomputedAuraProfile,
} from "./DamageCalculatorSection";

function profile(): DamageProfile {
  return {
    key: "base",
    weaponId: "primary:right:one_handed:test",
    skillId: "Basic Attack",
    skillName: "Basic Attack",
    skillLevel: 1,
    skillDamageMode: "weapon",
    playerAuraId: "none",
    playerAuraCarrier: "self",
    playerAuraLevel: 0,
    transformationId: "none",
    activeAuras: [],
    strikeBreakdowns: [],
    damageScope: { label: "per hit", note: "", sourceRefs: [] },
    damageComponents: [
      {
        id: "physical",
        label: "Physical",
        source: "weapon",
        damageType: "physical",
        timing: "instant",
        damage: { min: 100, max: 200 },
        baseDamage: { min: 100, max: 200 },
        sourceRefs: [],
        notes: [],
      },
    ],
    damageTotals: {
      instantDamage: { min: 100, max: 200 },
      overTimeDamage: { min: 0, max: 0 },
      combinedDamage: { min: 100, max: 200 },
      averageInstantDamage: 150,
      averageCombinedDamage: 150,
      byElement: { physical: { min: 100, max: 200 } },
    },
    totalPhysicalDamage: { min: 100, max: 200 },
    totalElementalDamage: {},
    totalDamage: { min: 100, max: 200 },
    averageHitDamage: 150,
    breakdown: {
      weaponDamage: { min: 100, max: 200 },
      flatPhysicalDamage: { min: 0, max: 0 },
      physicalBonusPercent: {
        stat: 0,
        nonWeapon: 0,
        passive: 0,
        selectedSkill: 0,
        selectedSkillSynergy: 0,
        transformation: 0,
        activeAuras: 0,
        total: 0,
      },
      elementalDamage: {},
    },
    notes: [],
  };
}

function bonus(level: number, physicalBonusPercent = 0, skillLevelBonus = 0) {
  return {
    level,
    physicalBonusPercent,
    skillLevelBonus,
    elementalDamage: {},
    strikeModifiers: {
      criticalChance: 0,
      deadlyStrikeChance: 0,
      maxDeadlyStrikeChance: 0,
      criticalMultiplierBonus: 0,
      deadlyStrikeMultiplierBonus: 0,
    },
  };
}

function aura(id: string): DamageAuraOption {
  return {
    id,
    name: id,
    level: 20,
    source: "character_skill",
    defaultActive: false,
    levelOptions: [1, 8, 10, 20],
    levelBonuses: [bonus(20)],
    selfLevelBonuses: [bonus(20)],
    partyLevelBonuses: [bonus(20)],
  };
}

describe("damage calculator aura interactions", () => {
  it("keeps an owned Enchant payload when another physical aura is added", () => {
    const enchant = aura("Enchant");
    enchant.selfLevelBonuses[0].elementalDamage = {
      fire: { min: 10, max: 20 },
    };
    enchant.partyLevelBonuses[0].elementalDamage = {
      fire: { min: 10, max: 20 },
    };
    enchant.selfLevelBonusesByWeaponSet = {
      primary: [
        { ...bonus(20), elementalDamage: { fire: { min: 500, max: 1000 } } },
      ],
      secondary: [
        { ...bonus(20), elementalDamage: { fire: { min: 300, max: 600 } } },
      ],
    };
    const might = aura("Might");
    might.selfLevelBonuses = [bonus(20, 100)];
    const enchanted = applyAuraToProfile(
      profile(),
      enchant,
      false,
      "20",
      "player_skill"
    );
    const withMight = applyAuraToProfile(
      enchanted,
      might,
      false,
      "20",
      "manual"
    );
    const reverse = applyAuraToProfile(
      applyAuraToProfile(profile(), might, false, "20", "manual"),
      enchant,
      false,
      "20",
      "player_skill"
    );
    expect(enchanted.totalElementalDamage.fire).toEqual({
      min: 500,
      max: 1000,
    });
    expect(withMight.totalElementalDamage.fire).toEqual(
      enchanted.totalElementalDamage.fire
    );
    expect(withMight.totalDamage).toEqual(reverse.totalDamage);
    const swapped = applyAuraToProfile(
      { ...profile(), weaponId: "secondary:right:one_handed:test" },
      enchant,
      false,
      "20",
      "player_skill"
    );
    expect(swapped.totalElementalDamage.fire).toEqual({ min: 300, max: 600 });
    expect(
      applyAuraToProfile(profile(), enchant, false, "20", "player_item")
        .totalElementalDamage.fire
    ).toEqual({ min: 10, max: 20 });
    enchant.summonLevelBonusesByWeaponSet = {
      primary: [
        { ...bonus(20), elementalDamage: { fire: { min: 400, max: 800 } } },
      ],
    };
    const summon = { ...profile(), skillDamageMode: "summon" as const };
    const enchantedSummon = applyAuraToProfile(
      summon,
      enchant,
      false,
      "20",
      "player_skill"
    );
    expect(enchantedSummon.totalElementalDamage.fire).toEqual({
      min: 400,
      max: 800,
    });
    expect(
      applyAuraToProfile(enchantedSummon, might, false, "20", "manual")
        .totalElementalDamage.fire
    ).toEqual({ min: 400, max: 800 });
    expect(
      applyAuraToProfile(profile(), enchant, true, "20", "player_skill")
        .totalElementalDamage.fire
    ).toEqual({ min: 10, max: 20 });
  });

  it("reuses a Battle Command skill tier while applying the requested enhanced damage", () => {
    const command = aura("Battle Command");
    command.selfLevelBonuses = [
      bonus(1, 20, 1),
      bonus(8, 41, 1),
      bonus(10, 47, 2),
    ];
    command.partyLevelBonuses = command.selfLevelBonuses;
    const seed = applyAuraToProfile(profile(), command, false, "1", "manual");
    seed.skillLevel = 21;
    const calculation = { profiles: [seed] } as DamageCalculation;
    const matched = findPrecomputedAuraProfile(
      calculation,
      seed.weaponId,
      seed.skillId,
      null,
      null,
      command,
      false,
      "8"
    );
    expect(matched).toBe(seed);
    const selected = applyAuraToProfile(
      matched!,
      command,
      false,
      "8",
      "manual",
      true
    );
    expect(selected.skillLevel).toBe(21);
    expect(selected.totalPhysicalDamage).toEqual({ min: 141, max: 282 });
    expect(selected.selectedPlayerAura?.level).toBe(8);
    // A different all-skills tier must not reuse stale spell or passive damage.
    expect(
      findPrecomputedAuraProfile(
        calculation,
        seed.weaponId,
        seed.skillId,
        null,
        null,
        command,
        false,
        "10"
      )
    ).toBeNull();
    const lowered = applyAuraToProfile(
      selected,
      command,
      false,
      "1",
      "manual",
      true
    );
    expect(lowered.totalDamage).toEqual(seed.totalDamage);
  });
});
