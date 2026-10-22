# Merged beta validation — October 22, 2026

This report supersedes the provisional October 16 and pre-merge October 21 results. PR #44 combines the Season 14 calculator update with monster/map targets and has been reconciled with main's Season 14 site update (`ff6ebbb`).

## Current game files

The calculator uses **15 unchanged text tables** extracted from the installed beta, including PR #44's `MonStats2`, `MonProp`, `MonPreset` and `SuperUniques`. [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json) records raw and normalized hashes, schemas and row counts. The active installation and `Live` archives/DLLs match each other and all four corresponding checksums in the launcher's local metadata. The stale 2025 `Beta` directory was excluded.

After the reported October 22 patch update, a fresh extraction found all 15 committed tables **byte-identical**. Regenerating the English names and animation catalogs produced identical content. The archive/DLL hashes remain those in the manifest. This verifies the installed files; it does not claim a newer remote patch was installed when the local bytes have not changed.

The fresh `MonStats.txt` again matches the shipped `MonStats.bin` across **57,735 values in 1,283 compiled records**, including resistance, block, life, level, defense and attack bases. The reproducible validator is `api/tools/validate-monster-data.py`; no game installation files were modified.

The merged catalog contains **1,073 curated targets**, including **66 named monsters**, and **179 populated areas**, of which **54 are map/dungeon pools**. Maps expose Hell only. The new pools are The Bitter Depths (207, seven selectable species), The Poisoned Well (208, nine), The Dark Temple (209, eight) and The Descent from Mount Arreat (210, ten). The unselectable Bitter Depths sarcophagus helper is excluded. Library uses Hell level 87.

## Automated checks

- **638 backend tests across 14 suites**, including isolated PostgreSQL integration tests, pass on the combined implementation.
- **53 frontend tests across three files** pass. The dedicated TypeScript check includes the actual calculator component, target UI, adjustment/mitigation helpers and their tests.
- Backend TypeScript, both ESLint runs and both production builds pass. Existing Fast Refresh export, bundle-size and Jest shutdown connection warnings remain.
- Full application TypeScript has **112 existing diagnostics**, compared with **113 on current main (`ff6ebbb`)**, after normalizing paths/line offsets. No new diagnostic was introduced. Removing the unsupported Mantine theme `colorScheme` option resolves one; the provider already controls that preference.

The effective-model matrix covers **126 snapshots: 123 captured real characters and three controlled respecs**, **107,744 profiles**, **128 source skills including Basic Attack**, and **172 skill/charge/difficulty variants**. It completed **3,104,688 target results with zero assertion failures or flagged outliers**.

| Matrix category | Results/checks |
| --- | ---: |
| Every catalog monster and difficulty | 553,668 |
| Populated areas and applicable difficulties | 1,158,936 |
| Self/party aura levels 1, 20 and 60 | 241,488 |
| Curse/debuff combinations | 255,420 |
| Rate/contact/block/uptime/overlap/count boundaries | 247,680 |
| Automatic timing checks | 1,720 |
| Slow-effect monotonicity checks | 860 |
| Raw profile preservation fingerprints | 2,222,844 |

Categories overlap and must not be summed as independent observations. Invalid Normal/Nightmare map pools are excluded. API/browser pure models and contracts remain byte-equivalent under regression assertions. Shared-model agreement establishes integration; independently transcribed numeric fixtures and compiled-table comparisons supply separate arithmetic/source evidence.

## Browser and manual QA

Browser testing through the actual calculator completed **458 passing comparisons**, including **1,469 target rows and 132 map-average comparisons**, with no unresolved numeric mismatch. The latest base-case CSV contains **1,296 rows for 144 skill/charge/weapon selections** on **67 captured real characters plus three controlled respecs**. These cover all **128 supported skill families**, all four mage elements, summon difficulty variants, charge states and single/paired Blade Dance.

Each base case reads the no-target raw cards, compares the API component total with their displayed rounding, checks adjusted ranges/contact/DPS against Hell Diablo and all eight Arreat Battlefield species, then restores no-target mode and verifies identical raw cards. Controlled inputs are two complete actions/cycles per second and 75% contact before block. They are not measured combat cadence; automatic timing/accuracy are checked separately.

Additional browser checks include owned/party Heart of Wolverine and Spirit of Barbs at levels 20/60, party and owned Battle Command combinations, automatic Sorceress Warmth accuracy, every species in all four new maps, map averages after individual mitigation, localized Shenk/Lister names, distinct Cistern Hydra boss/minion block (27%/24%), protected-phase zero damage, monster-switch protection reset, nearby immunity aura on/off, reset restoring automatic timing/accuracy, search recovery and Normal campaign to Hell-only map transitions. Current-main reload and numeric map/condition checks also pass.

Two preliminary reference-harness errors used an incorrect protection field or retained controlled overrides after Reset; both were corrected and repeated successfully. Two early Fire Claws rows precede the ground-per-hit correction and are superseded by its successful current-code repeat. All four observations are excluded from the passing counts and final CSV. The local evidence ledger retains them with the exclusion record.

[`beta-validation-skills.csv`](beta-validation-skills.csv) contains the latest passing base-case rows. The QA database holds copies of captured armory payloads; production records were not modified. `QA-*` respecs preserve captured equipment and skill budgets and are explicitly controlled examples, not naturally allocated characters.

## Adversarial review findings and independent fixtures

- Game formulas truncate per operation; fixed-point damage stages and fractional Vengeance scaling have independent numeric fixtures.
- Battle Command uses invested hard points: 20 invested gives +3 even at soft level 60, while an uninvested owned Call to Arms gives +1. Warmth level 20 supplies 210 flat AR, with 10 additional flat AR per added soft level before percentage multipliers.
- Fire Claws level 1 has **11–17 direct fire** and **12–22 ground DPS**; level 20 has **104–137** and **130–167** without synergies/mastery. Ground follows SkillDesc's explicit 5/2 convention, stays outside per-hit raw totals and is included separately in effective DPS. Attack rate does not multiply that already-per-second component.
- Poison Strike's temporary pierce, Split Throw/Double Swing temporary IAS and owned Spirit of Barbs hard-point cap are read from their beta source fields. Unknown party-owner hard points are not invented.
- Target reduction is applied to damage events and critical outcomes before averaging. Regression cases cover per-hit flat reduction, absorption, poison length/coverage, curses, summon pierce restrictions and negative base resistance. For example, -40 base resistance plus 20 pierce reaches -50, rather than moving back toward zero.
- Target deduplication preserves differing life, level, defense and scaling flags. SuperUniques-only English names are regenerated from shipped strings. Target data uses the existing character endpoint category, and payload/catalog cache versions are updated to `damage-model-v15` / `season-14-v3`.
- Stored gear is excluded from active stats/skills while equipped items and active inventory charms retain their effects. Tests cover equipment metadata on stored items and weapon-set ownership.

A separate **256-scenario** high/low audit uses all 128 source skills against Diablo and an ordinary quill rat at controlled rates. It found no unexplained extremes or zero-DPS cases for those two targets. The largest case is CartBlast's Arctic Blast: a 100,455-per-second raw payload becomes 157,714.3 DPS against -57 cold resistance, with no extra ×25 conversion. The smallest is controlled QA-SplitThrow against Diablo: 372.81 raw, 45% physical resistance, 50% block and two events/second yield 205.0 DPS. These examples are scenario outputs, not realm measurements.

The beta `ProjectDiablo.dll` Crushing Blow routine at `0x103469b0` was inspected read-only: normal denominator 8, special map-boss denominator 30, prime-evil `70 + 10 × missing-life-percent`, and ranged multiplier 1.5 remain unchanged. The October 22 DLL hash still matches that audit. This targeted check does not establish every runtime hook's behavior.

## Limits and retained evidence

This work validates calculator behavior, source values and browser integration; it does not include Diablo-client gameplay or realm damage measurement. Spell collision, secondary overlap, travel time, AI cadence, reactive Thorns bleed, corpse-life explosions, generated summon equipment and runtime pack/encounter modifiers retain the limits in [EFFECTIVE_DAMAGE.md](EFFECTIVE_DAMAGE.md). Map averages give equal weight to species, not population-weighted clear speed. Unverified runtime events are explicit scenario inputs.

The complete merged matrix, outlier audit, isolated database, source comparison, test logs, browser ledger, exclusion summary and screenshots are retained locally in `%TEMP%/pd2-merged-pr44-2026-10-21`; the fresh October 22 source extraction is in `%TEMP%/pd2-merged-pr44-refresh-2026-10-22`. Historical October 16 reports/CSVs remain labeled as historical; the obsolete Season 13 target QA document and duplicate extraction/name scripts were removed from the PR.
