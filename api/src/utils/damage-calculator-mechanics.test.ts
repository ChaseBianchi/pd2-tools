import { calculateDamage } from "./damage-calculator";
import fs from "fs";
import path from "path";
import type { CharacterData, DamageProfile, IItem } from "../types";
import * as gameFormula from "./game-formula";

// Deliberately small inputs and literal, independently worked expectations.
// These are mechanics checks, not snapshots refreshed from calculateDamage.
function weapon(id: string, slot = "Right Hand", type = "swor"): IItem {
  return {
    id, hash: id, name: id, category: "weapon",
    base: { name: id, type_code: type, type: type },
    location: { zone: "Equipped", equipment: slot },
    damage: {
      one_handed: { minimum: 100, maximum: 200 },
      two_handed: {}, missile: {},
    },
    properties: [], modifiers: [],
  } as unknown as IItem;
}

function character(
  skill = "Basic Attack", level = 1, baseLevel = level
): CharacterData {
  return {
    character: {
      name: "MechanicsTest", level: 90, season: 13,
      class: { id: 1, name: "Sorceress" },
      attributes: { strength: 0, dexterity: 0, vitality: 0, energy: 0 },
      skills: skill === "Basic Attack" ? [] : [{ name: skill, level: baseLevel }],
    },
    items: [weapon("right")],
    realSkills: [{ skill, level, baseLevel }],
  } as unknown as CharacterData;
}

function baseProfile(data: CharacterData, skill = "Basic Attack"): DamageProfile {
  const profile = calculateDamage(data).profiles.find((entry) =>
    entry.skillId === skill && entry.weaponId.startsWith("primary:right:") &&
    entry.playerAuraId === "none"
  );
  expect(profile).toBeDefined();
  return profile!;
}

describe("independent damage mechanics", () => {
  it("carries stream event rates into target mitigation", () => {
    const inferno = baseProfile(character("Inferno", 20), "Inferno");
    expect(inferno.damageComponents.find((c) => c.damageType === "fire")?.damageEventsPerUnit).toBe(25);
    const sentry = baseProfile(character("Inferno Sentry", 20), "Inferno Sentry");
    expect(sentry.damageComponents.find((c) => c.damageType === "fire")?.damageEventsPerUnit).toBe(25 / 3);
  });
  it("exports target pierce from active gear and passives for each weapon set", () => {
    const data = character("Cold Mastery", 20, 20);
    data.items[0].modifiers = [{ name: "passive_cold_pierce", values: [10] }] as IItem["modifiers"];
    const swap = weapon("swap", "Right Hand Switch");
    swap.modifiers = [{ name: "passive_cold_pierce", values: [30] }] as IItem["modifiers"];
    const stored = { ...weapon("stored"), location: { zone: "Stored", storage: "Stash" },
      modifiers: [{ name: "passive_cold_pierce", values: [80] }] } as IItem;
    data.items.push(swap, stored);
    // Cold Mastery 20 = 5 + 19 = 24 pierce, independent of skill damage.
    expect(baseProfile(data).targetModifiers?.resistancePierce.cold).toBe(34);
    const swapped = calculateDamage(data).profiles.find((p) => p.skillId === "Basic Attack" && p.weaponId.startsWith("secondary:right:") && p.playerAuraId === "none");
    expect(swapped?.targetModifiers?.resistancePierce.cold).toBe(54);
  });

  it("passes demon and undead damage bonuses only to the striking weapon", () => {
    const data = character();
    data.items[0].modifiers = [{ name: "item_demondamage_percent", values: [50] }] as IItem["modifiers"];
    const other = weapon("left", "Left Hand");
    other.modifiers = [{ name: "item_demondamage_percent", values: [200] }] as IItem["modifiers"];
    data.items.push(other);
    const physical = baseProfile(data).damageComponents.find((c) => c.damageType === "physical")!;
    expect(physical.targetDamageBonuses).toEqual({ demon: 50, undead: 0 });
  });

  it("detects equipped Conviction without treating it as an offensive damage aura", () => {
    const data = character();
    data.items[0].properties = ["Level 12 Conviction Aura When Equipped"];
    expect(baseProfile(data).targetModifiers?.convictionLevel).toBe(12);
  });
  it("includes intrinsic blunt undead damage and level-scaled enemy bonuses", () => {
    const data = character();
    data.items = [weapon("mace", "Right Hand", "mace")];
    data.items[0].modifiers = [
      { name: "item_damage_demon_perlevel", values: [20] },
      { name: "item_damage_undead_perlevel", values: [8] },
    ] as IItem["modifiers"];
    const physical = baseProfile(data).damageComponents.find((c) => c.damageType === "physical")!;
    expect(physical.targetDamageBonuses).toEqual({ demon: 225, undead: 140 });
  });
  // Skills.txt Fire Bolt: base 6/12, increments 4/6,16/18,30/32,46/48,46/48;
  // HitShift=7. Tiers have 7,8,6,6 levels, then continue without a cap.
  it.each([
    [1, 3, 6], [8, 17, 27], [9, 25, 36], [16, 81, 99],
    [17, 96, 115], [22, 171, 195], [23, 194, 219],
    [28, 309, 339], [29, 332, 363], [60, 1045, 1107], [61, 1068, 1131],
  ])("keeps Fire Bolt level %i in the correct damage tier", (level, min, max) => {
    expect(baseProfile(character("Fire Bolt", level, 1), "Fire Bolt")
      .totalElementalDamage.fire).toEqual({ min, max });
  });

  it("preserves fixed-point damage through synergy and mastery", () => {
    const data = character("Fire Ball", 2, 2);
    data.realSkills!.push(
      { skill: "Fire Bolt", level: 1, baseLevel: 1 },
      { skill: "Fire Mastery", level: 1, baseLevel: 1 },
    );
    // Base 12.5-21.5; 15% synergy, then 20% mastery in 1/256 units.
    // floor only for the displayed hit: 17-29, not floor(14)*1.2 = 16.
    expect(baseProfile(data, "Fire Ball").totalElementalDamage.fire)
      .toEqual({ min: 17, max: 29 });
  });

  it("uses hard points for blvl projectile counts", () => {
    const profile = baseProfile(character("Ice Barrage", 20, 1), "Ice Barrage");
    // calc1 = 3 + min(blvl / 3, 2); +skills must not add missiles.
    expect(profile.damageScope.count).toBe(3);
  });

  it("does not treat an oskill's soft levels as allocated synergy points", () => {
    const data = character("Fire Bolt", 1, 1);
    data.realSkills!.push({ skill: "Fire Ball", level: 20, baseLevel: undefined });
    expect(baseProfile(data, "Fire Bolt").totalElementalDamage.fire)
      .toEqual({ min: 3, max: 6 });
  });

  it("keeps raw elemental weapon stats local to the striking hand", () => {
    const data = character();
    const left = weapon("left", "Left Hand");
    left.modifiers = [{ name: "firemindam", values: [100, 200] }] as IItem["modifiers"];
    data.items.push(left);
    expect(baseProfile(data).totalElementalDamage.fire).toBeUndefined();
    const leftHit = calculateDamage(data).profiles.find((profile) =>
      profile.weaponId.startsWith("primary:left:one_handed") &&
      profile.skillId === "Basic Attack" && profile.playerAuraId === "none"
    );
    expect(leftHit?.totalElementalDamage.fire).toEqual({ min: 100, max: 200 });
  });

  it("applies elemental mastery to item damage on a melee hit", () => {
    const data = character("Fire Mastery", 1, 1);
    data.items[0].properties.push("Adds 10-20 Fire Damage");
    // S13 Fire Mastery level 1 adds 20%; melee elemental weapon stats use it.
    expect(baseProfile(data).totalElementalDamage.fire).toEqual({ min: 12, max: 24 });
  });

  it("adds minimum-only damage without manufacturing maximum damage", () => {
    const data = character();
    data.items.push({
      ...weapon("ring", "Right Ring"), category: "ring",
      properties: ["+12 to Minimum Damage"],
    });
    expect(baseProfile(data).totalPhysicalDamage).toEqual({ min: 112, max: 200 });
  });

  it("combines elemental min/max stats across items before normalizing", () => {
    const data = character();
    data.items[0].modifiers = [{ name: "firemindam", values: [10, 50] }] as IItem["modifiers"];
    data.items.push({
      ...weapon("ring", "Right Ring"), category: "ring",
      modifiers: [{ name: "firemindam", values: [20] }] as IItem["modifiers"],
    });
    expect(baseProfile(data).totalElementalDamage.fire).toEqual({ min: 30, max: 50 });
  });

  it("ignores stored gear when deriving attributes and skill levels", () => {
    const data = character("Fire Bolt", 1, 1);
    delete data.realSkills;
    data.items.push({
      ...weapon("stored", "Body Armor"), category: "armor",
      location: { zone: "Stored", storage: "Stash", equipment: "Body Armor" } as IItem["location"],
      properties: ["+100 to Strength", "+10 to All Skills", "+100% to Fire Skill Damage"],
    });
    const profile = baseProfile(data, "Fire Bolt");
    expect(profile.skillLevel).toBe(1);
    expect(profile.totalElementalDamage.fire).toEqual({ min: 3, max: 6 });
    expect(baseProfile(data).totalPhysicalDamage).toEqual({ min: 100, max: 200 });
  });

  it("applies SrcDam to off-weapon physical and elemental damage", () => {
    const data = character("Guided Arrow", 1, 1);
    data.items = [weapon("bow", "Right Hand", "bow"), {
      ...weapon("ring", "Right Ring"), category: "ring",
      properties: ["Adds 10-20 Damage", "Adds 20-40 Fire Damage"],
    }];
    data.items[0].damage = {
      one_handed: {}, two_handed: {}, missile: { minimum: 100, maximum: 200 },
    };
    // Guided Arrow SrcDam=64/128, +25% skill ED: (100+10)*.5*1.25.
    const profile = baseProfile(data, "Guided Arrow");
    expect(profile.totalPhysicalDamage).toEqual({ min: 68, max: 137 });
    expect(profile.totalElementalDamage.fire).toEqual({ min: 10, max: 20 });
  });

  it("uses weapon base stat coefficients from the armory", () => {
    const data = character();
    data.character.attributes.strength = 100;
    data.character.attributes.dexterity = 40;
    data.items[0].base!.stat_bonus = { strength: 75, dexterity: 75 };
    expect(baseProfile(data).totalPhysicalDamage).toEqual({ min: 205, max: 410 });
    data.character.attributes.strength = 101;
    data.character.attributes.dexterity = 41;
    // The engine truncates EACH attribute's percent before summing them.
    expect(baseProfile(data).totalPhysicalDamage).toEqual({ min: 205, max: 410 });
    data.items[0].base!.stat_bonus = { strength: 0, dexterity: 0 };
    expect(baseProfile(data).totalPhysicalDamage).toEqual({ min: 100, max: 200 });
  });

  it("emits one aura pulse regardless of weapon cycle hit count", () => {
    const data = character("Double Swing", 1, 1);
    data.character.class = { id: 4, name: "Barbarian" };
    data.items.push(weapon("left", "Left Hand"));
    const profiles = calculateDamage(data).profiles;
    const single = profiles.find((profile) =>
      profile.skillId === "Basic Attack" && profile.weaponId.startsWith("primary:right:") &&
      profile.selectedPlayerAura?.name === "Holy Fire" && profile.playerAuraCarrier === "self"
    );
    const cycle = profiles.find((profile) =>
      profile.skillId === "Double Swing" && profile.sequenceHits?.length === 2 &&
      profile.selectedPlayerAura?.name === "Holy Fire" && profile.playerAuraCarrier === "self"
    );
    expect(single?.auraPulseDamageTotals).toBeDefined();
    expect(cycle?.auraPulseDamageTotals).toEqual(single?.auraPulseDamageTotals);
  });

  it("uses allocated Battle Command levels for its all-skills bonus", () => {
    const data = character("Fire Bolt", 10, 10);
    data.realSkills!.push({ skill: "Battle Command", level: 35, baseLevel: 20 });
    const calculation = calculateDamage(data);
    const option = calculation.playerAuraOptions.find((aura) => aura.id === "Battle Command")!;
    expect(option.selfLevelBonuses.find((bonus) => bonus.level === 35)?.skillLevelBonus).toBe(3);
    const profile = calculation.profiles.find((entry) =>
      entry.skillId === "Fire Bolt" && entry.weaponId.startsWith("primary:right:") &&
      entry.playerAuraId === "Battle Command" && entry.playerAuraCarrier === "self" &&
      entry.playerAuraLevel === 35
    );
    expect(profile?.skillLevel).toBe(13);
  });

  it("precomputes every distinct manual all-skills bonus", () => {
    const profiles = calculateDamage(character("Fire Bolt", 10, 10)).profiles.filter((profile) =>
      profile.skillId === "Fire Bolt" && profile.weaponId.startsWith("primary:right:") &&
      profile.playerAuraId === "Battle Command" && profile.playerAuraCarrier === "self"
    );
    expect(profiles.map((profile) => [profile.playerAuraLevel, profile.skillLevel]))
      .toEqual(expect.arrayContaining([[1, 11], [10, 12], [20, 13]]));
  });

  it.each([
    // Raise Skeletal Mage 20 + Skeleton Mastery 20 assigns missile level 29.
    // Missiles.txt tier sums at 29, multiplied by 1 + 20*10/100 mastery.
    ["fire", 624, 705], ["cold", 540, 609],
    ["lightning", 87, 1350], ["poison", 456, 456],
  ])("uses the assigned missile level for the %s mage", (element, min, max) => {
    const data = character("Raise Skeletal Mage", 20, 20);
    data.realSkills!.push({ skill: "Skeleton Mastery", level: 20, baseLevel: 20 });
    const profile = calculateDamage(data).profiles.find((entry) =>
      entry.skillId === `Raise Skeletal Mage::${element}-mage` && entry.playerAuraId === "none"
    );
    expect(profile?.damageComponents).toHaveLength(1);
    expect(profile?.damageComponents[0].damage).toEqual({ min, max });
  });

  it("lets soft Skeleton Mastery levels improve both mage level and mastery", () => {
    const data = character("Raise Skeletal Mage", 5, 1);
    data.realSkills!.push({ skill: "Skeleton Mastery", level: 2, baseLevel: 1 });
    // Missile level = 2 + trunc((5-2)/2) = 3; fire 12-18, then +20%.
    const profile = calculateDamage(data).profiles.find((entry) =>
      entry.skillId === "Raise Skeletal Mage::fire-mage" && entry.playerAuraId === "none"
    );
    expect(profile?.totalElementalDamage.fire).toEqual({ min: 14, max: 21 });
  });

  it("applies both Skeleton Archer damage stages", () => {
    const data = character("Raise Skeleton Archer", 20, 20);
    data.realSkills!.push(
      { skill: "Skeleton Mastery", level: 20, baseLevel: 20 },
      { skill: "Raise Skeleton", level: 20, baseLevel: 20 },
    );
    // Raw 179-184, +160% source synergy -> 465-478. Add 40 flat physical,
    // then the pet's separate +160% damagepercent -> 1313-1346 per arrow.
    const profile = calculateDamage(data).profiles.find((entry) =>
      entry.skillId === "Raise Skeleton Archer" && entry.playerAuraId === "none"
    );
    expect(profile?.totalPhysicalDamage).toEqual({ min: 1313, max: 1346 });
  });

  it.each([
    ["normal", 11, 15], ["nightmare", 42, 60], ["hell", 84, 120],
  ])("uses %s difficulty for Clay Golem's base attack", (difficulty, min, max) => {
    const data = character("Clay Golem", 1, 1);
    const profile = calculateDamage(data).profiles.find((entry) =>
      entry.skillId === `Clay Golem::${difficulty}` && entry.playerAuraId === "none"
    );
    expect(profile?.totalPhysicalDamage).toEqual({ min, max });
    expect(profile?.notes.join(" ")).toContain("difficulty");
  });

  it("preserves Vengeance's fractional damage between conversion and mastery", () => {
    const data = character("Vengeance", 1, 1);
    data.items[0].properties.push("+20% to Fire Skill Damage");
    // S13 flat 6-8; +5% elemental damage. Fire then gets 20% mastery.
    // (100+6)*1.05*1.2 -> 133; (200+8)*1.05*1.2 -> 262.
    const profile = baseProfile(data, "Vengeance");
    expect(profile.totalElementalDamage).toMatchObject({
      fire: { min: 133, max: 262 },
      cold: { min: 111, max: 218 },
      lightning: { min: 111, max: 218 },
    });
  });

  it("keeps Vengeance matching elements and hard-point synergies separate from physical ED", () => {
    const data = character("Vengeance", 1, 1);
    data.items[0].properties.push("Adds 10-20 Fire Damage", "Adds 30-40 Cold Damage");
    data.realSkills!.push({ skill: "Holy Fire", level: 30, baseLevel: 1 });
    // One hard Holy Fire point adds 2% to EACH element, giving 7% total.
    const profile = baseProfile(data, "Vengeance");
    expect(profile.totalElementalDamage).toMatchObject({
      fire: { min: 124, max: 243 },
      cold: { min: 145, max: 265 },
      lightning: { min: 113, max: 222 },
    });
    data.character.attributes.strength = 200;
    data.items.push({ ...weapon("armor", "Body Armor"), category: "armor", properties: ["+300% Enhanced Damage"] });
    const enhanced = baseProfile(data, "Vengeance");
    expect(enhanced.totalPhysicalDamage.min).toBeGreaterThan(profile.totalPhysicalDamage.min);
    expect(enhanced.totalElementalDamage).toEqual(profile.totalElementalDamage);
  });

  it("does not turn Call to Arms soft levels into Battle Command hard points", () => {
    const data = character("Fire Bolt", 10, 10);
    data.items[0].name = "Call to Arms";
    data.items[0].properties.push("+15 to Battle Command");
    const calculation = calculateDamage(data);
    const option = calculation.playerAuraOptions.find((aura) => aura.id === "Battle Command");
    expect(option?.selfLevelBonuses.find((bonus) => bonus.level === 15)?.skillLevelBonus).toBe(1);
    const profile = calculation.profiles.find((entry) =>
      entry.skillId === "Fire Bolt" && entry.playerAuraId === "Battle Command" &&
      entry.playerAuraCarrier === "self" && entry.playerAuraLevel === 15
    );
    expect(profile?.skillLevel).toBe(11);
  });

  it("keeps editable aura levels consistent with owned synergies and the weapon set", () => {
    const data = character("Holy Fire", 20, 20);
    data.character.class = { id: 3, name: "Paladin" };
    data.character.skills.push({ id: 100, name: "Resist Fire", level: 20 });
    data.realSkills!.push({ skill: "Resist Fire", level: 20, baseLevel: 20 });
    const swap = weapon("swap", "Right Hand Switch");
    swap.properties.push("+100% to Fire Skill Damage");
    data.items.push(swap);
    const calculation = calculateDamage(data);
    const option = calculation.playerAuraOptions.find((aura) => aura.id === "Holy Fire")!;
    for (const set of ["primary", "secondary"] as const) {
      const profile = calculation.profiles.find((entry) =>
        entry.weaponId.startsWith(`${set}:right:`) && entry.skillId === "Basic Attack" &&
        entry.playerAuraId === "Holy Fire" && entry.playerAuraLevel === 20 && entry.playerAuraCarrier === "self"
      )!;
      expect(option.selfLevelBonusesByWeaponSet?.[set].find((bonus) => bonus.level === 20)?.elementalDamage.fire)
        .toEqual(profile.totalElementalDamage.fire);
    }
    expect(option.selfLevelBonusesByWeaponSet!.secondary[19].elementalDamage.fire!.min)
      .toBe(option.selfLevelBonusesByWeaponSet!.primary[19].elementalDamage.fire!.min * 2);
    expect(option.selfLevelBonusesByWeaponSet!.primary[9].elementalDamage.fire!.min)
      .toBeGreaterThan(option.selfLevelBonuses[9].elementalDamage.fire!.min);
  });

  it("keeps Meteor ground-fire rates out of impact totals", () => {
    const profile = baseProfile(character("Meteor", 20, 20), "Meteor");
    const ground = profile.damageComponents.find((component) =>
      component.sourceRefs.some((ref) => ref.row === "meteorfire")
    );
    expect(ground?.damage.max).toBeGreaterThan(0);
    expect(ground?.includedInTotal).toBe(false);
    expect(ground?.notes.join(" ")).toContain("per second");
    expect(profile.damageTotals.overTimeDamage).toEqual({ min: 0, max: 0 });
    expect(profile.damageScope.label).toBe("per impact");
  });

  it("uses Fists of Fire meteor hit damage without a time multiplier", () => {
    const data = character("Fists of Fire", 20, 20);
    data.items[0].base!.type_code = "h2h";
    const profile = calculateDamage(data).profiles.find((entry) =>
      entry.skillId === "Fists of Fire" && entry.chargeNumber === 3 && entry.playerAuraId === "none"
    );
    const meteor = profile?.damageComponents.find((component) => component.damageType === "fire" &&
      component.sourceRefs.some((ref) => ref.row === "fofmeteor")
    );
    // Missiles.txt: 1+7*1+8*1+4*9 and 2+7*1+8*2+4*10.
    expect(meteor?.damage).toEqual({ min: 52, max: 65 });
    expect(meteor?.timing).toBe("instant");
  });

  // Synthetic allocations intentionally exercise all source-backed paths in
  // each class. This is an invariant stress test, not an in-game build oracle.
  it.each([
    ["ama", "Amazon"], ["sor", "Sorceress"], ["nec", "Necromancer"],
    ["pal", "Paladin"], ["bar", "Barbarian"], ["dru", "Druid"], ["ass", "Assassin"],
  ])("keeps all %s profile totals finite and reconciled", (classCode, className) => {
    const [header, ...lines] = fs.readFileSync(path.resolve(
      "src/game-data/pd2/season-13/Skills.txt"
    ), "utf8").trimEnd().split(/\r?\n/).map((line) => line.split("\t"));
    const data = character();
    data.character.class.name = className;
    data.realSkills = lines.filter((row) =>
      row[header.indexOf("charclass")] === classCode && row[header.indexOf("InGame")] === "1"
    ).map((row) => ({ skill: row[header.indexOf("skill")], level: 40, baseLevel: 20 }));
    data.character.skills = data.realSkills.map((skill, id) => ({ id, name: skill.skill, level: 20 }));
    const left = weapon("left", "Left Hand", classCode === "ass" ? "h2h" : "swor");
    if (classCode === "ass") data.items[0].base!.type_code = "h2h";
    data.items.push(left);
    const bow = weapon("switch", "Right Hand Switch", "bow");
    bow.damage = { one_handed: {}, two_handed: {}, missile: { minimum: 10, maximum: 20 } };
    data.items.push(bow);
    const formulaCalls = jest.spyOn(gameFormula, "evaluateIntegerFormula");
    const calculation = calculateDamage(data);
    const failures = formulaCalls.mock.results.flatMap((result, index) =>
      result.type === "throw" ? [formulaCalls.mock.calls[index][0]] : []
    );
    formulaCalls.mockRestore();
    expect(failures).toEqual([]);
    expect(calculation.profiles.length).toBeGreaterThan(0);
    expect(calculation.skillOptions.length).toBeGreaterThan(1);
    for (const profile of calculation.profiles) {
      const sum = { min: 0, max: 0 };
      const ids = new Set<string>();
      for (const component of profile.damageComponents) {
        expect(ids.has(component.id)).toBe(false);
        ids.add(component.id);
        expect(Number.isFinite(component.damage.min)).toBe(true);
        expect(Number.isFinite(component.damage.max)).toBe(true);
        expect(component.damage.min).toBeGreaterThanOrEqual(0);
        expect(component.damage.max).toBeGreaterThanOrEqual(component.damage.min);
        if (component.includedInTotal !== false) {
          sum.min += component.damage.min;
          sum.max += component.damage.max;
        }
      }
      expect(profile.damageTotals.combinedDamage.min).toBeCloseTo(sum.min, 6);
      expect(profile.damageTotals.combinedDamage.max).toBeCloseTo(sum.max, 6);
      for (const strike of profile.strikeBreakdowns) {
        expect(strike.physicalComponentIds.every((id) => ids.has(id))).toBe(true);
      }
    }
  });
});
