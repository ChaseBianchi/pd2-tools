import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Card, Checkbox, Collapse, Group, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Switch, Table, Text, Button } from "@mantine/core";
import { apiClient } from "../../api";
import type { DamageProfile, DamageRange } from "../../types/damage";
import type { DamageTargetCatalog, TargetDifficulty } from "../../types/damage-target";
import { averageTargetDamage, calculateTargetDamage, DAMAGE_ELEMENTS, EMPTY_TARGET_CONDITIONS } from "../../utils/target-damage";

const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });
const range = (value?: DamageRange) => value ? `${number(value.min)} – ${number(value.max)}` : "0";
const title = (value: string) => value[0].toUpperCase() + value.slice(1);

export function DamageTargetSection({ profile }: { profile: DamageProfile }) {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState("monster");
  const [monsterId, setMonsterId] = useState<string | null>(null);
  const [mapId, setMapId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<TargetDifficulty>("hell");
  const [advanced, setAdvanced] = useState(false);
  const [conditions, setConditions] = useState(EMPTY_TARGET_CONDITIONS);
  const [convictionOverride, setConvictionOverride] = useState<number | undefined>();
  const catalog = useQuery({
    queryKey: ["damage-targets", 13, 1],
    queryFn: () => apiClient.get<DamageTargetCatalog>("/damage-targets?model=1"),
    enabled, staleTime: 60 * 60 * 1000, retry: false,
  });
  const monsters = useMemo(() => new Map(catalog.data?.monsters.map((monster) => [monster.id, monster])), [catalog.data]);
  const map = catalog.data?.maps.find((candidate) => candidate.id === mapId);
  const selectedMonster = monsterId ? monsters.get(monsterId) : undefined;
  const activeDifficulty = mode === "map" ? "hell" : difficulty;
  const convictionLevel = convictionOverride ?? profile.targetModifiers?.convictionLevel ?? 0;
  // Skills.txt Conviction aurastatcalc2 = -min(12 + 2*(lvl-1),150).
  const activeConditions = {
    ...conditions, protected: mode === "monster" && conditions.protected,
    immunityAura: mode === "monster" && conditions.immunityAura,
    conviction: convictionLevel > 0 ? Math.min(150, 10 + 2 * convictionLevel) : 0,
  };
  const results = enabled && profile.targetModifiers ? (mode === "map" ? map?.monsterIds || [] : selectedMonster ? [selectedMonster.id] : [])
    .map((id) => monsters.get(id)!)
    .filter(Boolean)
    .map((monster) => ({ monster, result: calculateTargetDamage(profile, monster, monster.difficulties[activeDifficulty], activeConditions) })) : [];
  const total = mode === "map" ? averageTargetDamage(results.map(({ result }) => result)) : results[0]?.result.totals;
  const pulseTotal = mode === "map" ? averageTargetDamage(results.filter(({ result }) => result.pulseTotals)
    .map(({ result }) => ({ ...result, totals: result.pulseTotals! }))) : results[0]?.result.pulseTotals;
  const selectedStats = selectedMonster?.difficulties[activeDifficulty];
  const monsterOptions = useMemo(() => {
    if (!catalog.data) return [];
    const counts = new Map<string, number>();
    catalog.data.monsters.forEach((monster) => counts.set(monster.name, (counts.get(monster.name) || 0) + 1));
    return ["boss", "superunique", "monster"].map((kind) => ({
      group: kind === "boss" ? "Bosses" : kind === "superunique" ? "Named monsters" : "Monsters",
      items: catalog.data!.monsters.filter((monster) => monster.kind === kind).map((monster) => ({
        value: monster.id,
        label: (counts.get(monster.name) || 0) > 1
          ? `${monster.name} · ${monster.areas[0] || monster.monsterId} [${monster.monsterId}]` : monster.name,
      })),
    }));
  }, [catalog.data]);

  return <Card withBorder padding="md" radius="md">
    <Stack gap="sm">
      <Switch label="Apply damage to a target" description="Compare damage against a monster or a map's monster pool."
        checked={enabled} onChange={(event) => setEnabled(event.currentTarget.checked)} />
      {enabled && <>
        <SegmentedControl aria-label="Target mode" value={mode} onChange={setMode}
          data={[{ value: "monster", label: "Single monster" }, { value: "map", label: "Map average" }]} />
        {catalog.isPending ? <Text size="sm">Loading monster and map data…</Text> : catalog.isError ?
          <Alert color="red" title="Target data could not be loaded"><Button size="xs" onClick={() => catalog.refetch()}>Retry</Button></Alert> : <>
          <SimpleGrid cols={{ base: 1, sm: mode === "monster" ? 2 : 1 }}>
            {mode === "monster" ? <Select label="Monster" placeholder="Search monsters or bosses"
              searchable clearable nothingFoundMessage="No matching monster" limit={60}
              data={monsterOptions} value={monsterId} onChange={(id) => { setMonsterId(id); setConditions((previous) => ({ ...previous, protected: false, immunityAura: false })); }} /> :
              <Select label="Map or dungeon area" description="Hell difficulty · unmodified spawn pool"
                placeholder="Search maps" searchable clearable nothingFoundMessage="No matching map"
                data={catalog.data?.maps.map((map) => ({ value: map.id, label: map.name })) || []}
                value={mapId} onChange={setMapId} />}
            {mode === "monster" && <Select label="Difficulty" value={difficulty}
              data={[{ value: "normal", label: "Normal" }, { value: "nightmare", label: "Nightmare" }, { value: "hell", label: "Hell" }]}
              allowDeselect={false} onChange={(value) => setDifficulty(value as TargetDifficulty)} />}
          </SimpleGrid>
          {!profile.targetModifiers && <Alert color="yellow">This character's cached damage data does not include resistance pierce. Reload the character before using target results.</Alert>}
          {total && <>
            <Group gap="xs">
              <Badge variant="light">Season {catalog.data?.season}</Badge>
              <Text fw={600}>{mode === "map" ? map?.name : selectedMonster?.name}</Text>
              {mode === "monster" && selectedMonster?.creatureType !== "other" && <Badge variant="outline">{selectedMonster?.creatureType}</Badge>}
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <div><Text size="xs" c="dimmed">{mode === "map" ? "Average damage per monster type" : "Effective damage"} · {profile.damageScope.label}</Text>
                <Text size="xl" fw={700} c="teal.3">{range(total.combinedDamage)}</Text>
                <Text size="sm">Mean {number(total.averageCombinedDamage)}</Text></div>
              <div><Text size="xs" c="dimmed">Immediate damage</Text><Text fw={600}>{range(total.instantDamage)}</Text></div>
              <div><Text size="xs" c="dimmed">Damage over time</Text><Text fw={600}>{range(total.overTimeDamage)}</Text>
                {total.poisonDamage && <Text size="xs" c="dimmed">Poison over {total.poisonDamage.durationSeconds.toLocaleString(undefined, { maximumFractionDigits: 2 })}s</Text>}</div>
            </SimpleGrid>
            {pulseTotal && <Text size="sm">Separate aura pulse{mode === "map" ? " (average per monster type)" : ""}: {range(pulseTotal.combinedDamage)}</Text>}
            {mode === "monster" && <>
              <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>
                {DAMAGE_ELEMENTS.map((element) => <div key={element}>
                  <Text size="xs" c="dimmed">{title(element)} resistance</Text>
                  <Text fw={600}>{selectedStats?.resistances[element]}% → {results[0].result.resistances[element]}%</Text>
                  {results[0].result.resistances[element] >= 100 && <Badge color="red" size="xs">Immune</Badge>}
                  <Text size="sm">{range(total.byElement[element])} damage</Text>
                </div>)}
              </SimpleGrid>
              {selectedStats && <Text size="xs" c="dimmed">
                Physical reduction: {selectedStats.flatPhysicalReduction} flat · Magic reduction: {selectedStats.flatMagicReduction} flat · Poison length reduction: {selectedStats.poisonLengthReduction}% · Curse duration reduction: {selectedStats.curseResistance}% · Curse effect reduction: {selectedStats.curseEffectReduction}% · Block: {selectedStats.block}% (landed hits only)
              </Text>}
              {results[0].result.absorptionHealing.max > 0 && <Alert color="yellow">Absorption is deducted from the damage above and can also heal {range(results[0].result.absorptionHealing)} life before damage is applied, depending on the target's missing life.</Alert>}
              {(results[0].result.pulseAbsorptionHealing?.max || 0) > 0 && <Text size="xs" c="dimmed">The separate aura pulse can also heal {range(results[0].result.pulseAbsorptionHealing)} life through absorption.</Text>}
              {[...(selectedMonster?.notes || []), ...(selectedStats?.notes || [])].map((note) => <Text size="xs" c="dimmed" key={note}>{note}</Text>)}
            </>}
            {mode === "map" && <>
              <Text size="sm" c="dimmed">{map?.notes.join(" ")}</Text>
              <Table.ScrollContainer minWidth={640}>
                <Table striped><Table.Thead><Table.Tr><Table.Th>Monster type</Table.Th><Table.Th>Immunities after reduction</Table.Th><Table.Th>Effective damage</Table.Th><Table.Th>Mean</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>{results.map(({ monster, result }) => <Table.Tr key={monster.id}>
                    <Table.Td><Text size="sm">{monster.name}</Text></Table.Td>
                    <Table.Td>{DAMAGE_ELEMENTS.filter((element) => result.resistances[element] >= 100).map(title).join(", ") || "None"}</Table.Td>
                    <Table.Td>{range(result.totals.combinedDamage)}</Table.Td><Table.Td>{number(result.totals.averageCombinedDamage)}</Table.Td>
                  </Table.Tr>)}</Table.Tbody></Table>
              </Table.ScrollContainer>
            </>}
            <Button variant="subtle" size="xs" onClick={() => setAdvanced((value) => !value)} aria-expanded={advanced}>
              {advanced ? "Hide" : "Show"} target conditions
            </Button>
            <Collapse in={advanced}><Stack gap="sm">
              <Text size="sm" c="dimmed">Enter active debuff strengths before the immunity penalty. Gear and passive pierce are included automatically. Curse duration and effectiveness reductions are applied separately; a curse-immune target ignores curses.</Text>
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                <NumberInput label="Conviction level" min={0} max={99} allowDecimal={false} value={convictionLevel}
                  description="Includes equipped / mercenary aura" onChange={(value) => setConvictionOverride(Number(value) || 0)} />
                {([ ["lowerResist", "Lower Resist (%)"], ["amplifyDamage", "Amplify Damage (%)"], ["battleCry", "Battle Cry (%)"],
                  ["decrepify", "Decrepify (%)"], ["sanctuary", "Sanctuary (%)"], ["staticField", "Static Field debuff (%)"], ["inferno", "Inferno debuff (%)"] ] as const).map(([key, label]) =>
                  <NumberInput key={key} label={label} min={0} max={200} allowDecimal={false} value={conditions[key]}
                    onChange={(value) => setConditions((previous) => ({ ...previous, [key]: Number(value) || 0 }))} />)}
              </SimpleGrid>
              <Text size="sm">Additional monster resistance (map rolls or other active effects)</Text>
              <SimpleGrid cols={{ base: 2, sm: 3, lg: 6 }}>{DAMAGE_ELEMENTS.map((element) =>
                <NumberInput key={element} label={`${title(element)} (%)`} min={0} max={300} allowDecimal={false}
                  value={conditions.addedResistances[element] || 0} onChange={(value) => setConditions((previous) => ({
                    ...previous, addedResistances: { ...previous.addedResistances, [element]: Number(value) || 0 },
                  }))} />)}</SimpleGrid>
              {mode === "monster" && <Checkbox label="Target is in a protected / invulnerable phase" checked={conditions.protected}
                onChange={(event) => { const checked = event.currentTarget.checked; setConditions((previous) => ({ ...previous, protected: checked })); }} />}
              {mode === "monster" && selectedStats?.receivesImmunityAura && <Checkbox label="Nearby immunity aura is active (+200% all resistances)" checked={conditions.immunityAura}
                onChange={(event) => { const checked = event.currentTarget.checked; setConditions((previous) => ({ ...previous, immunityAura: checked })); }} />}
              <Button variant="default" size="xs" onClick={() => { setConditions(EMPTY_TARGET_CONDITIONS); setConvictionOverride(undefined); }}>Reset target conditions</Button>
            </Stack></Collapse>
            <Text size="xs" c="dimmed">Uses the same damage unit as the selected skill; no attack rate, hit chance, clear time, or crushing blow. Raw damage remains below for comparison.</Text>
          </>}
        </>}
      </>}
    </Stack>
  </Card>;
}
