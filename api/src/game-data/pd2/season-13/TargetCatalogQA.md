# Season 13 monster target QA

Reviewed 2026-09-09 against the installed PD2 archive, committed game tables,
English string tables, and the local calculator. The selector was reduced from
1,116 entries to 1,016. All 50 map pools retain the same Hell defensive profiles,
creature types, and averaging weights.

## Findings and corrections

| Finding | Correction |
| --- | --- |
| Blank `window1` / `window2` options | Require a nonempty display name. |
| Invisible portals, helper holes, spell Hydras, and unused zero-life monsters | Require attackable/selectable MonStats2 flags and positive maximum life in at least one difficulty. |
| Doors, barricades, catapults, Bone Prison segments, generic traps/turrets | Exclude these scenery families. Keep combat constructs, including map Fire Towers and Flying Scimitars. |
| Duplicate Smith, Summoner, Griswold, Radament, Hephasto, Nihlathak, and Ancients | Keep their actual named encounter with fixed SuperUniques modifiers; retain area associations. Ordinary species used by named monsters remain available. |
| Canight shown with two different defensive profiles | MonPreset places `willowispboss` directly. Exclude the unreferenced `Wisp Boss` SuperUniques template, which otherwise adds Stone Skin and Magic Resistant. |
| `DungeonTest3`, `cantorboss`, legacy `diabloclone` | Exclude the reviewed test/prototype and superseded clone definitions. Cantor Boss has no English string-table entry; the test boss borrows Radament's name. Keep the current `uberdiablonew` encounter. |
| Equivalent spawn IDs cluttering the list | Consolidate entries only when name, kind, creature type, every modeled defense in all three difficulties, fixed modifiers, and encounter notes match. Union their areas and resolve map references to the retained ID. |
| Ambiguous encounter labels | Label Cistern boss/minion, Uber Talic/Madawc/Korlic, and the Guardian of Fate clone explicitly. Avoid printing the same internal ID twice in fallback labels. |

Examples of consolidated profiles include the ordinary Minions of Destruction,
equivalent Council Member rows, Rat/Rat2 variants, Ureh/Zhar variants, and Outer
Void spawn/unique-map variants. Different names or defensive profiles remain
separate. Matching Hell resistances alone is insufficient: Nihlathak's mage
minions can match in Hell while differing in Normal.

## Ancient Cistern Hydras

| Target | Source ID | Block | Hell resistances: physical / magic / fire / cold / lightning / poison |
| --- | --- | --- | --- |
| Boss | `lernaeanhydra2` | 27% | 20 / 20 / 50 / 50 / 50 / 50 |
| Minion | `lernaeanhydra1` | 24% | 20 / 20 / 50 / 50 / 50 / 50 |

The boss explicitly spawns `lernaeanhydra1` as its minion. Life, missile, and loot
fields also differ. Keep both with clear labels. Their current per-landed-hit
damage results agree because their resistances agree; displayed block and their
actual encounter roles differ.

## Verification

- Fresh extraction matched the committed MonStats bytes. New MonStats2 and
  MonPreset files are unmodified archive bytes, and the extraction script now
  includes both for subsequent updates.
- All seven API damage QA suites passed. The final catalog regression suite has
  18 passing tests, including invalid targets, duplicate profiles, fixed boss
  modifiers, difficulty differences, Cistern block differences, and map links.
- Both web damage QA suites passed (49 tests). API/web lint, type checks, and
  production builds passed.
- Compared the full before/after map defense multisets. Decaying Swamplands,
  The City of Ureh, and The Outer Void use canonical IDs after consolidation;
  every pool retains its original profiles and weights.
- Verified the rebuilt local API returns 1,016 monsters and 50 maps. Browser QA
  confirmed no matching windows/generic trap, one Smith option, both new Hydra
  labels, and the correct 27% / 24% block display.

## Scope of the evidence

This is a source-table and calculator audit, not an in-game playthrough of every
encounter. Enabled/killable flags do not prove that a definition is used. The
small curated exclusion list records reviewed leftovers; absence from Levels
alone is never a general exclusion rule because scripted bosses and summons
often have no ambient spawn entry. Revisit these exceptions when importing a
new season. Inert flags also do not imply invalidity: nests, the Target Dummy,
and The Tainted Hive remain valid targets.
