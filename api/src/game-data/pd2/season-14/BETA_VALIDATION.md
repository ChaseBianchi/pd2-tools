# Beta source validation — October 21, 2026

This report supersedes the provisional October 16 validation. The calculator now uses an unchanged extraction of the installed beta's eleven relevant text tables and regenerated names/animation catalogs. [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json) records source hashes, schemas and row counts; its normalized hashes are checked in the test suite. The active installation and `Live` data archive matched; the stale 2025 `Beta` directory was excluded.

The active `pd2data.mpq`, `pd2assets.mpq`, `D2Common.dll` and `ProjectDiablo.dll` also match all four checksums in the launcher's downloaded-file metadata. The resulting catalog has **1,087 targetable monster records and 185 populated areas**. The new source records correspond to The Bitter Depths (207, eight species), The Poisoned Well (208, nine), The Dark Temple (209, eight), and The Descent from Mount Arreat (210, ten).

## Verification

- **530 backend tests pass** across all eleven suites, including isolated PostgreSQL integration tests.
- **Seven frontend tests pass**, both production builds pass, and backend ESLint/TypeScript pass. Changed frontend files have no lint errors; the existing Fast Refresh export warnings remain.
- The application TypeScript check has **113 pre-existing diagnostics**, identical to the archived baseline after normalizing paths/line offsets; none were introduced or resolved.
- Existing bundle-size, Fast Refresh export and Jest shutdown connection warnings remain; Jest reports all suites passing before the isolated database shuts down.
- The current 126-snapshot matrix covers **123 captured real characters plus three controlled respecs**, **118,771 profiles**, **128 supported source skills including Basic Attack**, and **162 charge/variant selections**. It completed **3,443,460 target results with zero assertion failures**. These are scenario/invariant checks, not measured realm-server results.

| Matrix category | Results/checks |
| --- | ---: |
| Every catalog monster and difficulty | 528,282 |
| Populated areas and applicable difficulties | 1,544,022 |
| Self/party aura levels 1, 20 and 60 | 227,448 |
| Curse/debuff combinations | 196,830 |
| Rate/contact/block/uptime/overlap/count boundaries | 233,280 |
| Automatic timing checks | 1,620 |
| Slow-effect monotonicity checks | 810 |
| Raw profile preservation fingerprints | 2,169,168 |

Categories overlap; they should not be summed as independent observations. The API/browser pure models and contracts remain byte-equivalent under a regression assertion. UI agreement with that shared model establishes integration; independently transcribed numeric assertions establish separate arithmetic checks.

Browser verification completed **293 passing comparisons**, covering **133 base skill/charge selections**, all **128 supported source skills**, and all four mage elements on **67 captured real characters plus three controlled respecs**. Each base case reads the no-target raw cards first, compares their totals with the API component values, checks adjusted ranges/probability/DPS against Hell Diablo and all eight Arreat Battlefield species, and restores no-target mode to verify identical raw cards. Checks use displayed rounding precision, not exact floating-point string equality.

Additional browser cases cover every species in all four new maps, single/paired Blade Dance, self/party Heart of Wolverine, owned Spirit of Barbs at levels 20/60 on a character with 20 hard points, party attribution, Battle Command combinations and automatic Warmth accuracy on a real Sorceress. There are **1,339 passing target-row comparisons**. **Two preliminary Blade Dance observations used the offhand reference while the UI selected the primary hand**; those harness mismatches were retained as invalidated evidence and both single/paired selections were repeated successfully. No unresolved numeric mismatch remains.

[`beta-validation-skills.csv`](beta-validation-skills.csv) contains **1,197 latest passing base-case rows**. These use two actions/cycles per second and 75% contact before monster block as controlled inputs; they are not measured combat cadence. Automatic timing and AR are checked separately. The local QA database contains copies of the captured armory payloads; production records and game installation files are not modified. The three controlled respecs are labeled `QA-*`, preserve captured equipment and skill budgets, and are not represented as naturally allocated examples.

## Independently checked beta behavior

- Fire Claws at level 1 has **11–17 melee fire** and **12–22 displayed ground DPS**. At level 20, with no synergies/mastery, these are **104–137** and **130–167**. Ground damage follows `SkillDesc.txt`'s explicit `(enma * 5)/2` / `(exma * 5)/2` convention, not the old generic ×75 fire-missile conversion. Melee and ground contributions remain separate, and attack rate does not multiply the already-per-second ground component. Actual server contact/overlap remains a scenario input.
- Warmth at level 20 grants **210 flat AR**, not 210% AR. Battle Command increases the learned passive by **10 flat AR per added soft level**, before percentage multipliers. The independent fixture yields 660 base AR for 100-dexterity Sorceress; a separate effective-model fixture checks the order and immutability.
- Poison Strike at levels 20/60 has **24/50 poison pierce**, read from its temporary aura. This does not become a permanent weapon passive.
- Split Throw and Double Swing use **10/50 skill attack speed** from their beta temporary aura fields.
- Owned Spirit of Barbs uses the summoner's captured hard points for the extra Deadly Strike cap. A level-20 hard-point fixture supplies **+5 cap**; generic party curves omit the unknown owner's hard-point bonus and the UI states that limitation.
- Numeric tier assertions were reconciled to the extracted Twister, Tornado, Eruption, Combustion, Multiple Shot and Phoenix Strike values. Old expected values were changed only after checking the source and hand arithmetic. Source formulas, including their quote characters, were not edited to make an expectation pass.
- Map IDs **207–210** have populated comparisons and are marked as maps. Empty guild halls **202–206** are absent. Library uses the beta Hell level **87**.

The beta `ProjectDiablo.dll` has a new hash. Its Crushing Blow routine was located at **0x103469b0** by its previous function prologue and inspected read-only. The core constants remain normal denominator **8**, special map-boss denominator **30**, prime-evil **70 + 10 × missing-life-percent**, and ranged multiplier **1.5**. `D2Common.dll` and the generated animation catalog are unchanged. This targeted native check does not establish that every beta runtime hook is unchanged.

## Review and limits

Review focused on integration failures hidden by a table-only replacement: moved conditional pierce, flat versus percent AR, owner hard points, quoted formulas, newly damage-bearing Fire Claws children, temporary skill IAS, obsolete map-ID bounds and cache invalidation. Payload version v13 and the target-catalog query key invalidate prior calculator/catalog caches.

A separate **248-scenario** audit checks high/low outputs at controlled rates against Diablo and an ordinary quill rat. Large sustained payloads retain their source per-second units; low summon results remain bounded by the underlying profile's equipment limitations. Raw data, logs, scripts, native disassembly, outlier results and browser evidence are retained locally in `%TEMP%/pd2-beta-2026-10-21`.

The source snapshot is beta-specific. Spell collisions, secondary overlaps, travel time, reactive Thorns bleed, pack affixes, corpse-life explosions and generated summon equipment retain the limitations in [EFFECTIVE_DAMAGE.md](EFFECTIVE_DAMAGE.md). Monster/map rows are species comparisons rather than population-weighted clear-speed predictions. Imported source definitions do not justify guessing unverified server event behavior.
