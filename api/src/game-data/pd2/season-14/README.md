# Provisional Season 14 game data

This snapshot applies the explicit numeric and formula changes in the [Season 14 Alliance tentative patch notes](https://docs.google.com/document/d/1-ynVRb-5s4gTHAN86t1qQ6Yu6sdjS3F_WY09v6qoAGU/mobilebasic), retrieved on October 16, 2026, to the committed Season 13 tables at `9a33075`. It is a partial, manually mapped snapshot, not an official Season 14 game-file extract. Replace or reconcile it with the released tables before treating it as complete.

The calculator, item-stat expansion, and armor enrichment now read this directory. The original `season-13` directory is preserved. Calculations use one global game-data snapshot, as before; selecting an older character season does not select historical mechanics. This change does not roll over the database season, ingestion jobs, or UI season defaults.

## Applied mappings

| Patch area | Source rows and columns |
| --- | --- |
| Class growth | `CharStats.txt`: the explicit mana-per-energy changes for all seven classes, mana-per-level changes for Druid, Necromancer, Paladin, and Sorceress, and Sorceress life-per-level. These columns use quarter points; Paladin mana-per-level already equals the new value. Armory life/mana totals are not rewritten. |
| Weapon sockets | `Weapons.txt`: `amf` (Matriarchal Javelin) maximum sockets increases from two to three. |
| Amazon damage and synergies | `Skills.txt`: Jab `Param4/8`; Multiple Shot `calc1`, `Param1/5/6`; Power Strike, Charged Strike, Lightning Strike `Param8`. Power Strike's independent `powerstrikenova2` missile synergy is also updated. |
| Phoenix Strike | `Missiles.txt`: `royalstrikemeteor` tier increments and synergy; `royalstrikechaosice` base and upper-tier increments. Lightning and ground-fire payloads are unchanged. The skill's internal name is `Royal Strike`. |
| Trap timing | `MonStats.txt`: `lightningsentry` and `chainlightningsentry` `aidel`, `aidel(N)`, `aidel(H)`. The separate inactive stall parameters remain unchanged. AI timing is not multiplied into calculator hit totals. |
| Barbarian scaling | `Skills.txt`: `Two Hand Mastery` damage parameters; `One Hand Mastery` critical cap; Leap Attack scaling and synergy; Natural Resistance diminishing-return cap. |
| Dire Wolves | `Skills.txt`: `Summon Fenris` pet passive slot 4 uses the existing `passive_phys_pierce` stat with `min(5 + lvl/2,20)`. Target resistance and pierce are not applied to the calculator's pre-resistance totals. |
| Druid spell damage | `Skills.txt`: Fissure is `Eruption`; its upper elemental tiers change. Twister and Tornado use physical damage columns. Hurricane changes its maximum elemental increments and synergy. |
| Poison Nova | `Skills.txt`: synergy parameter and highest elemental tier. The 10% tier reduction changes raw increments from 10 to 9; duration is unchanged. |
| Player curses | `Skills.txt`: `AmpDmg` and `LowRes` base parameters account for the formulas already adding one at skill level 1. Decrepify movement slow is capped and its physical-resistance divisor changes. Monster curse rows and the dedicated `Decrepify Proc` row are preserved. |
| Concentration | `Skills.txt`: uninterruptible chance parameter and formula. Physical aura damage is unchanged. |
| Sorceress | `Skills.txt`: Blaze velocity uses `min(25 + lvl,60)` through its parameters; Shiver Armor and Chilling Armor replace their Cold Enchant damage synergy; Frost Nova synergy changes; Combustion changes synergy and cooldown. |
| Hydra projectiles | `Missiles.txt`: `hydra` and `hydrafireball` velocity and maximum velocity increase by 25%. |
| Armor sockets | `Armor.txt`: nine bases change from two sockets to three. Tigulated Mail, Mesh Armor, Cuirass, Russet Armor, and Templar Coat already have three in the baseline and remain unchanged. |
| Formula descriptions | `SkillDesc.txt`: Multiple Shot count, Phoenix meteor synergy, Decrepify, Concentration, Blaze, cold armor synergy names, and Combustion cooldown stay aligned with the changed skill data. |

Twister has `HitShift=7`, so its half-point values require doubled raw damage entries. Its baseline top-tier raw increments are 61/63, which differ from the patch notes' stated old values; the explicit new 42/44 increments are represented as 84/88. Other unaffected fields retain their baseline values, including any pre-existing inaccuracies. Cooldowns use 25 frames per second, making Combustion's new two-second delay 50 frames.

## Deferred mappings

| Patch area | Reason |
| --- | --- |
| Fire Claws rework | New damage values and splash/trail implementation are unspecified. Existing values remain provisional. |
| Multishot on-hit effects, poison/bleed source stacking, Power Strike hidden damage bug, Fire Ball double-hit bug | These require game-engine changes or event behavior outside the modeled per-hit formulas. The calculator already adds no hidden Power Strike enhanced damage. |
| Blades of Ice wave range/deceleration and Twister acceleration | Exact new movement values are absent. |
| Concentrate magic splash, Smite splash/leech, Blessed Hammer wall behavior, Fist of the Heavens pierce, Chilling Armor area damage, Blaze phasing | Runtime behavior or new payload wiring cannot be reconstructed reliably from these notes. Do not infer missile function IDs, collision flags, splash radii, or phasing stats. |
| Thorns second open-wounds stack | Requires the actual new stat/event wiring. Existing open-wounds chance is not the new second-stack chance and is left unchanged. |
| Curse proc compensation and Decrepify proc slow fix | Item proc levels and the implementation of the slow fix are unspecified. `UniqueItems.txt` and `Runes.txt` are absent. Do not apply player formula changes to dedicated monster/proc rows. |
| Rune socket bonuses, unique/set/runeword rolls, crafting, affixes, corruptions | The corresponding `Gems.txt`, `UniqueItems.txt`, `SetItems.txt`, `Runes.txt`, `CubeMain.txt`, and affix/corruption sources are absent. Item modifiers are read from armory payloads rather than synthesized from item names. New items with image-only details also require source data. |
| Shadow behavior/tooltips, Penetrate/Teleport wording, pet leash, boss fixes | Engine/AI or localization changes lack exact source fields or text. |
| New map layouts/events, guilds, stash, controller, chat, cosmetic artwork | New content and runtime events are outside the source-table scope. The effective-damage extension uses extracted baseline monster populations and explicit numeric map modifiers; it does not invent Season 14 map populations. |

## Verification

`season-14.test.ts` checks source schemas, row order, unrelated rows, socket limits, timing fields, formula descriptions, and unchanged property/stat definitions. The damage calculator regressions independently check patch-note values at skill-tier boundaries, hard-point synergies, projectile caps, separate missile payloads, mastery bonuses, and removed synergies. Run the API tests from `api/` with `npm test -- --runInBand`; database integration tests require the test PostgreSQL instance configured by the existing suites.


## Target comparison extension

The full calculator can compare its unchanged raw profile against a monster or every species in an area's population table. See [EFFECTIVE_DAMAGE.md](EFFECTIVE_DAMAGE.md) for formulas, source provenance, validation, and the limits of AI/collision-dependent rates. `MonLvl.txt`, `Levels.txt`, `Weapons.txt`, and `CharStats.txt` were recovered from the installed PD2 data archive after the initial patch mapping. The same archive's `MonStats.txt` exactly matches the committed Season 13 baseline. These are baseline extracts with the explicit class/socket changes above, rather than released Season 14 files.
