# Season 14 beta game data

The calculator uses the **installed beta extracted on October 21, 2026**, replacing the manually mapped tentative patch. The 15 committed text tables are unchanged extracts from `ProjectD2/pd2data.mpq`; no patch-note values are layered on top. `Armor.txt`, `Weapons.txt`, and `MonLvl.txt` already matched the downloaded data. The original Season 13 directory remains intact.

The active installation and `ProjectD2/Live/pd2data.mpq` had the same SHA-256. The directory named `Beta` still contained November 2025 files and was deliberately excluded. [`SOURCE_MANIFEST.json`](SOURCE_MANIFEST.json) records archive/DLL hashes, normalized text hashes, row counts, schemas, and generated-file provenance. The beta is a dated snapshot, not a promise that subsequent beta or release builds are identical.

## Sources used by the calculator

| File | Purpose |
| --- | --- |
| `Skills.txt` | Skill levels, damage tiers, synergies, buffs, passives, summon payloads and cooldowns |
| `Missiles.txt` | Server-reachable damage payloads, damage units, child missiles and ground effects |
| `SkillDesc.txt` | Payload/display bindings and tooltip formulas |
| `MonStats.txt`, `MonLvl.txt` | Monster targets, summon bases and difficulty scaling |
| `MonStats2.txt`, `MonProp.txt`, `SuperUniques.txt`, `MonPreset.txt` | Target eligibility, innate defenses and auras, fixed named-monster modifiers, and direct encounter placements |
| `Levels.txt` | Area levels and monster populations, including the four new populated map/event records |
| `Properties.txt`, `ItemStatCost.txt` | Armory modifier expansion, stat names and local/global stat behavior |
| `Armor.txt`, `Weapons.txt` | Base combat data, weapon speeds and socket limits |
| `CharStats.txt` | Class attack-rating constants and source growth values; armory life/mana are not rewritten |
| `CombatAnimations.json` | Player/form animation data from `pd2assets.mpq` and sequences from `D2Common.dll` |
| `TargetNames.json` | English names from the base, expansion and PD2 string tables, including named-monster keys |

Calculations still use one global mechanics snapshot. Selecting a historical character season does not select historical mechanics. Database season settings, ingestion schedules and UI season defaults are unchanged.

## Notable corrections from the tentative mapping

- Multiple Shot caps at **25 arrows**; Combustion uses a **63-frame** cooldown and **12%** synergy parameter.
- Twister's highest increments are **34/35** after HitShift; Tornado starts at **35–39**. Eruption's top elemental increments are **28/30**.
- Fire Claws now has separate weapon-hit fire and a damage-bearing ground missile. Its ground payload uses the beta SkillDesc **5/2** display multiplier, replacing the generic fire-missile multiplier. Per-hit and per-second components remain separately identified; missile count is informational.
- Fire Arrow, Phoenix Strike, Meteor ground fire, Poison Creeper, skeleton archers, wolves, Grizzly, Heart of Wolverine and curse procs use their extracted revised formulas.
- Poison Strike's conditional pierce is read from its temporary aura stat. Warmth's flat AR and Battle Command increments are applied before percentage AR. Temporary attack-speed buffs include Split Throw.
- Spirit of Barbs' additional Deadly Strike cap uses the owner's **hard points**, including owned-aura precomputed values. Unknown party hard points are not inferred from soft aura level; the UI explains the omitted extra cap.
- Quoted expressions inside formulas are handled without changing the extracted cells. A restricted integer arithmetic parser evaluates each operation without executing source formulas as JavaScript.
- New populated area IDs **207–210** are available as map comparisons; empty guild halls are excluded. Library's Hell area level is **87**.

## Reproduction and verification

Run `api/tools/extract-combat-data.ps1` using 32-bit Windows PowerShell, with `-ArchiveDirectory` pointing explicitly to the desired archive directory and `-OutputDirectory` pointing to a new scratch directory. The default archive directory is `ProjectD2/Live`. The tool reads the installation without modifying it, records extraction hashes and refuses incomplete required extracts.

Generate the derived catalogs with:

```text
python api/tools/generate-combat-data.py --extract <scratch-extract> --d2common <installation>/ProjectD2/D2Common.dll --output <scratch-generated>
```

Reconcile a new extraction deliberately; do not reuse the old manually edited tentative values. `season-14.test.ts` verifies the committed files against the source manifest and independently transcribed beta cells. Calculator tests exercise numeric tier boundaries, hard/soft-point distinctions and changed runtime metadata.

Verify fresh monster text against the shipped binary with `python api/tools/validate-monster-data.py <scratch-extract>`. The merged snapshot matched all 57,735 compared values across 1,283 compiled records.

See [BETA_VALIDATION.md](BETA_VALIDATION.md) for current verification and [EFFECTIVE_DAMAGE.md](EFFECTIVE_DAMAGE.md) for model rules and limitations. The October 16 validation reports and CSVs describe the earlier provisional implementation and remain historical evidence.

## Scope limits

The source files establish payloads and formulas, not complete realm-server behavior. Collision, travel time, secondary hit overlap, pack affixes, generated summon equipment and corpse-life explosion damage remain limited as described in the effective model. Observed rates are still required for AI, periodic and movement-controlled skills. Fire Claws ground cadence follows the beta tooltip convention; overlap and coverage remain explicit scenario assumptions, not measured server telemetry.

The beta contains runtime changes such as Thorns' reactive second bleed stack, phasing and missile collision behavior. Their source definitions are preserved, but an unverified event implementation is not guessed. The updated ProjectDiablo DLL hash is recorded; importing tables does not independently revalidate every native combat hook. Item rolls continue to come from armory payloads rather than new item-generation tables.
