# Season 14 damage validation — 2026-10-16

This validates the tentative table snapshot described in [README.md](README.md), the calculator, and the rendered UI. It does not establish agreement with the unreleased game engine.

## Data and isolation

Read 123 distinct Season 13 character payloads from the public production API: the first 100 characters at level 85 or higher, plus 23 distinct characters found by targeted skill-allocation queries. The original API and React frontend ran locally against an isolated PostgreSQL database containing those copies. Production was read-only. Calculations used the Season 14 tables with the real characters' existing equipment, attributes, allocations, and mercenaries.

The browser covered 68 unchanged database characters and three explicitly named controlled respec copies. No sampled allocated build supplied Shattering Arrow, Split Throw, or Blade Dance. For those, the local copies transferred 20 hard points from Ice Arrow on Solzone, Concentrate on TorbePutero, and Blade Fury on CareYaps respectively, keeping the existing gear and point budget. These are controlled tests, not naturally occurring builds.

[validation-skills.csv](validation-skills.csv) records a passing browser comparison for every supported damage skill, including all four skeletal mage variants and Basic Attack: 127 named source skills and 131 UI skill IDs. Holy Sword is a buff and was removed from the direct-damage selector. Six unused temporary table rows are excluded from named player-skill coverage. Utility skills without modeled damage are outside this denominator.

## Results

| Check | Count | Result |
| --- | ---: | --- |
| Real-character profiles and transformation variants | 122,742 | No invalid ranges or component-sum failures |
| Damage component checks | 478,612 | Finite, nonnegative, ordered min/max |
| API versus frontend single-aura calculations, excluding Battle Command | 90,246 | No differences beyond 2.1 damage units per endpoint, allowing integer-rounding order |
| Repeated/stronger/weaker aura checks | 82,992 | No stacking/replacement failures |
| Two-aura order checks, self and party | 165,984 | No order-dependent failures |
| Transformation checks at levels 1, 20, 60 | 6,384 | Component arithmetic passed; spells gained no attack damage |
| Final browser comparisons | 356 | Exact agreement after UI integer rounding |
| Backend tests, including database integration | 438 | Passed |
| Frontend regression tests | 7 | Passed |

Browser comparisons covered every supported damage skill; all 27 aura/buff options at levels 1, 20, and 60 for self and party carriers; Battle Command tier boundaries on Multiple Shot and War Cry; both orders of Might plus Battle Command; stacked elemental and strike auras; owned Enchant/Cold Enchant on primary and swapped weapons; independent dual-wield hits; summons; martial charge variants; and Maul stacks 1, 10, and 20. API component checks also verified Critical Strike before Deadly Strike and probability caps.

The browser oracle used API base components and aura-level data, independently summed physical and elemental payloads, and recomputed expected strike bonuses. Battle Command used the API profile for the matching all-skills tier and independently adjusted enhanced damage inside that tier. The broad matrix additionally compared the actual frontend calculation helpers to API profiles. These checks establish internal consistency; shared source-table mistakes still require independent game evidence.

Six preliminary browser observations were invalidated and repeated: a development refresh restored default auras, two comparisons selected an offhand-only reference while the UI selected the main hand, and three poison expectations mistakenly used average damage instead of the min/max range. The saved local ledger retains those observations and their explanations separately from final passing comparisons.

## Bugs found and fixed

- **Battle Command:** Arbitrary levels previously lost the all-skills recalculation, and a preceding physical aura could prevent using a precomputed skill profile. Profiles now cover seven distinct skill-bonus tiers, with within-tier physical adjustment. All levels 1–60 have an independent tier assertion. Queen_OfArrows now retains Multiple Shot level 26 at Battle Command 8 and shows 6,787–23,060; adding Might 20 gives 9,340–31,679 in either row order.
- **Owned elemental buffs:** Adding Might previously changed or reduced Enchant/Cold Enchant damage because the UI substituted a generic payload or used a different weapon-set level. The API now supplies caster-aware payloads for the relevant weapon set and summon carrier. Janes_Cupidon's Enchant 41 yields 1,404–2,038 combined damage; Might 1 increases it to 1,439–2,121 in either order while preserving the fire payload.
- **Summon physical damage:** Frontend aura adjustment could apply already-baked summon synergies again. Components now retain the physical percentage actually applied to them.
- **Dual-wield physical damage:** Aura adjustment reused the first hand's multiplier for both hits. Each hit now retains its own multiplier. AAaaAAaHhhHH's Double Swing remains 16,428–23,071 with nondamaging Prayer, and Might 20 plus party Fanaticism 20 yields 21,367–29,504 in either order.
- **Poison Strike:** Live character names were not mapped to the historical Poison Dagger table row. This omitted the attack and its hard-point Poison Nova synergy. Both paths now have regressions.
- **Holy Sword:** Buff fields were incorrectly presented as direct spell damage. It is excluded from the direct-damage selector, like Holy Shield.

## High/low output audit and DPS limits

- TheChud's Poison Creeper shows 124,551–124,694 damage over four seconds. This is a poison application total, approximately 31.1k per second over that duration, before target mitigation. It is not 124k DPS or repeated summon attacks.
- CartBlast's Arctic Blast shows 97,846–103,062 **per second** at effective level 53. It agrees with the source-table stream conversion and is unchanged by the patch tables. Actual engine hit cadence remains unverified.
- Jim_ColdBeaver's Shiver Armor rises by about 4.17× on the primary set (1,129–1,224 to 4,711–5,103). The large change traces to replacing the unallocated Cold Enchant synergy with allocated Frost Nova, rather than unintended multiplicative stacking.
- KenKen's swapped-set Teeth at effective level 20 shows 52–78 per projectile on a poison specialist without bone synergies. Projectile count is not multiplied into the single-projectile total.
- Low Iron Golem and Valkyrie profiles need caution: the current model uses the exposed summon table payload and does not reconstruct consumed/generated summon equipment. UI/API agreement cannot prove their complete in-game damage. No guessed gear multipliers were added.

Full effective DPS is not implemented: attack/cast timing, hit chance, target resistance, crushing blow, target overlap, repeated summon attacks, AI, and uptime are omitted. Conviction therefore does not change the raw outgoing damage total. Per-hit, per-projectile, per-cycle, poison-duration, and explicitly per-second outputs were checked with their stated scopes. Corpse Explosion still requires target/corpse information for its conditional contribution. These limitations were preserved rather than filled with assumptions.

## Verification and retained evidence

API lint, TypeScript checking/build, frontend tests, and the Vite production build passed. Focused frontend lint has no errors and two Fast Refresh warnings for exported calculation helpers used by regression tests. The existing bundle-size warning remains. PostgreSQL integration tests used a temporary test cluster; database connection messages during cluster shutdown occurred after the passing Jest run.

The local evidence directory `%TEMP%/pd2-s14-real-qa` contains the read-only character captures, controlled respec provenance, `analysis.json`, comparison scripts, `browser-results.json`, and `browser-verification.jpg`. Raw character payloads and temporary infrastructure are not committed.

Review challenged aura order, nondamaging auras changing damage, stronger/weaker replacement, caster versus external payloads, weapon swaps, independent hand scaling, all-skills tier boundaries, poison total versus rate, duplicate summon synergies, strike caps, and buff-versus-attack classification. The resulting changes are limited to demonstrated calculator defects and regression coverage; no unrelated mechanics were inferred.
