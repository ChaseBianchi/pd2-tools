import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Accordion,
  Alert,
  Badge,
  Checkbox,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from "@mantine/core";
import { apiClient } from "../../api";
import type {
  CombatCatalog,
  CombatSettings,
  DamageCalculation,
  DamageElement,
  DamageProfile,
} from "../../types";
import {
  calculateEffectiveDamage,
  defaultCombatSettings,
} from "../../utils/effective-damage";

const elements: DamageElement[] = [
  "physical",
  "fire",
  "cold",
  "lightning",
  "poison",
  "magic",
];
const format = (n: number | null) =>
  n === null
    ? "Needs inputs"
    : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const range = (r: { min: number; max: number }) =>
  `${format(r.min)} – ${format(r.max)}`;
const effectNames = [
  "Amplify Damage",
  "Decrepify",
  "Lower Resist",
  "Battle Cry",
  "Inner Sight",
  "Burst of Speed",
  "Poison Creeper",
  "Static Field",
  "Arctic Blast",
  "Inferno",
];

export function EffectiveDamageSection({
  calculation,
  profile,
}: {
  calculation: DamageCalculation;
  profile: DamageProfile;
}) {
  const [mode, setMode] = useState("none");
  const [settings, setSettings] = useState<CombatSettings>(
    defaultCombatSettings
  );
  const [detailId, setDetailId] = useState<string | null>(null);
  const catalog = useQuery({
    queryKey: ["damage-targets", "season-14-v3"],
    queryFn: () => apiClient.get<CombatCatalog>("/characters/damage-targets"),
    enabled: mode !== "none",
    staleTime: Infinity,
  });
  const update = <K extends keyof CombatSettings>(
    key: K,
    value: CombatSettings[K]
  ) => setSettings((old) => ({ ...old, [key]: value }));
  const results = useMemo(
    () =>
      calculation.combat &&
      catalog.data &&
      mode !== "none" &&
      (mode !== "map" || settings.areaId)
        ? calculateEffectiveDamage(
            profile,
            calculation.combat,
            catalog.data,
            settings
          )
        : [],
    [profile, calculation.combat, catalog.data, mode, settings]
  );
  const selected = results.find((r) => r.monster.id === detailId) || results[0];
  const averageLanded = results.length ? {
    min: results.reduce((sum, result) => sum + result.landed.min, 0) / results.length,
    max: results.reduce((sum, result) => sum + result.landed.max, 0) / results.length,
  } : null;
  const averageDps = results.length && results.every((result) => result.dps !== null)
    ? results.reduce((sum, result) => sum + result.dps!, 0) / results.length : null;
  const selectedStats = selected?.monster.target?.difficulties[["normal", "nightmare", "hell"][settings.difficulty] as "hell"];
  const numeric = (
    key:
      | "attackSlow"
      | "castSlow"
      | "players"
      | "levelBonus"
      | "defenseBonus"
      | "lifeBonus"
      | "uptime"
      | "overlap"
      | "summonCount"
      | "currentLifePercent",
    label: string,
    min: number,
    max: number
  ) => (
    <NumberInput
      label={label}
      value={settings[key]}
      min={min}
      max={max}
      allowDecimal={false}
      clampBehavior="strict"
      onChange={(value) => update(key, typeof value === "number" ? value : min)}
    />
  );
  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Text fw={600}>Damage against a target</Text>
        <Select
          label="Target comparison"
          value={mode}
          allowDeselect={false}
          onChange={(value) => {
            const next = value || "none";
            setMode(next);
            setDetailId(null);
            setSettings((old) => ({ ...old, areaId: next !== "map" ? null : old.areaId, protected: false, immunityAura: false }));
          }}
          data={[
            { value: "none", label: "No target — raw damage" },
            { value: "monster", label: "Monster" },
            { value: "map", label: "Area / map" },
          ]}
        />
        {mode === "none" ? (
          <Text size="sm" c="dimmed">
            Raw values above are the baseline. Select a target to compare
            resistances, landed damage, hit chance, and sustained DPS.
          </Text>
        ) : !calculation.combat ? (
          <Alert color="yellow">
            Reload the character to obtain combat stats.
          </Alert>
        ) : catalog.isError ? (
          <Alert color="red">Target data could not be loaded.</Alert>
        ) : !catalog.data ? (
          <Text>Loading targets…</Text>
        ) : (
          <>
            <SimpleGrid cols={{ base: 1, sm: 3 }}>
              <Select
                label="Difficulty"
                value={String(settings.difficulty)}
                allowDeselect={false}
                onChange={(value) => {
                  update("difficulty", Number(value));
                  setDetailId(null);
                }}
                data={[
                  { value: "0", label: "Normal" },
                  { value: "1", label: "Nightmare" },
                  { value: "2", label: "Hell" },
                ]}
                disabled={
                  mode === "map" &&
                  Boolean(
                    catalog.data.areas.find((a) => a.id === settings.areaId)
                      ?.map
                  )
                }
              />
              {mode === "monster" ? (
                <Select
                  label="Monster"
                  searchable
                  value={settings.monsterId}
                  allowDeselect={false}
                  onChange={(value) => setSettings((old) => ({ ...old, monsterId: value || "diablo", protected: false, immunityAura: false }))}
                  data={catalog.data.monsters.map((m) => ({
                    value: m.id,
                    label: `${m.name} (${m.id})`,
                  }))}
                />
              ) : (
                <Select
                  label="Area / map"
                  searchable
                  value={settings.areaId}
                  allowDeselect={false}
                  placeholder="Choose an area or map"
                  onChange={(value) => {
                    update("areaId", value);
                    setDetailId(null);
                    if (catalog.data!.areas.find((a) => a.id === value)?.map)
                      update("difficulty", 2);
                  }}
                  data={catalog.data.areas.map((a) => ({
                    value: a.id,
                    label: `${a.name}${a.map ? " — map" : ""} (${a.id})`,
                  }))}
                />
              )}
              {numeric("players", "Players in game", 1, 8)}
            </SimpleGrid>
            <Accordion variant="contained">
              <Accordion.Item value="settings">
                <Accordion.Control>
                  Combat assumptions and map modifiers
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="sm">
                    <SimpleGrid cols={{ base: 2, sm: 3 }}>
                      {numeric("levelBonus", "Monster level bonus", 0, 100)}
                      {numeric(
                        "defenseBonus",
                        "Monster defense bonus %",
                        -100,
                        1000
                      )}
                      {numeric("lifeBonus", "Monster life bonus %", 0, 1000)}
                      {numeric("attackSlow", "Attack speed penalty", 0, 200)}
                      {numeric("castSlow", "Faster cast rate penalty", 0, 200)}
                      {elements.map((element) => (
                        <NumberInput
                          key={element}
                          label={`${element[0].toUpperCase()}${element.slice(1)} resistance bonus`}
                          value={settings.resistanceBonus[element]}
                          min={-100}
                          max={300}
                          clampBehavior="strict"
                          onChange={(value) =>
                            update("resistanceBonus", {
                              ...settings.resistanceBonus,
                              [element]: typeof value === "number" ? value : 0,
                            })
                          }
                        />
                      ))}
                    </SimpleGrid>
                    {mode === "monster" && <>
                      <Checkbox label="Target is in a protected / invulnerable phase" checked={Boolean(settings.protected)}
                        onChange={(event) => update("protected", event.currentTarget.checked)} />
                      {selected?.monster.target?.difficulties[["normal", "nightmare", "hell"][settings.difficulty] as "hell"].receivesImmunityAura &&
                        <Checkbox label="Nearby immunity aura is active (+200% all resistances)" checked={Boolean(settings.immunityAura)}
                          onChange={(event) => update("immunityAura", event.currentTarget.checked)} />}
                    </>}
                    <Button variant="default" size="xs" onClick={() => setSettings((old) => ({ ...defaultCombatSettings(), monsterId: old.monsterId, areaId: old.areaId, difficulty: old.difficulty }))}>Reset target conditions</Button>
                    <Checkbox
                      label="Use special map-boss Crushing Blow rules"
                      checked={settings.mapBoss}
                      onChange={(event) =>
                        update("mapBoss", event.currentTarget.checked)
                      }
                    />
                    <Text size="sm" c="dimmed">
                      Curses and debuffs are assumed active. Use only
                      combinations the party can maintain simultaneously.
                    </Text>
                    <SimpleGrid cols={{ base: 2, sm: 3 }}>
                      {effectNames.map((name) => (
                        <NumberInput
                          key={name}
                          label={`${name} ${name === "Burst of Speed" ? "hard points" : "level"}`}
                          value={
                            settings.debuffs.find((d) => d.name === name)
                              ?.level || 0
                          }
                          min={0}
                          max={name === "Burst of Speed" ? 20 : 60}
                          allowDecimal={false}
                          clampBehavior="strict"
                          onChange={(value) =>
                            update("debuffs", [
                              ...settings.debuffs.filter(
                                (d) => d.name !== name
                              ),
                              ...(typeof value === "number" && value > 0
                                ? [{ name, level: value }]
                                : []),
                            ])
                          }
                        />
                      ))}
                    </SimpleGrid>
                    <SimpleGrid cols={{ base: 2, sm: 3 }}>
                      <NumberInput
                        label="Actions / cycles per second"
                        description="Blank: automatic. Set observed rates for AI or movement skills."
                        value={settings.rateOverride ?? ""}
                        min={0}
                        max={100}
                        decimalScale={3}
                        clampBehavior="strict"
                        onChange={(value) =>
                          update(
                            "rateOverride",
                            typeof value === "number" ? value : null
                          )
                        }
                      />
                      <NumberInput
                        label="Hit chance override %"
                        description="Before monster block. Blank: calculated attack accuracy."
                        value={settings.hitChanceOverride ?? ""}
                        min={0}
                        max={100}
                        clampBehavior="strict"
                        onChange={(value) =>
                          update(
                            "hitChanceOverride",
                            typeof value === "number" ? value : null
                          )
                        }
                      />
                      {numeric("uptime", "Damage uptime %", 0, 100)}
                      <NumberInput
                        label="Monster block override %"
                        description="Blank: source table. Set zero for an unblockable payload."
                        value={settings.blockChanceOverride ?? ""}
                        min={0}
                        max={100}
                        clampBehavior="strict"
                        onChange={(value) =>
                          update(
                            "blockChanceOverride",
                            typeof value === "number" ? value : null
                          )
                        }
                      />
                      {numeric(
                        "overlap",
                        "Overlapping payloads on target",
                        1,
                        100
                      )}
                      {numeric(
                        "summonCount",
                        "Active summons hitting target",
                        1,
                        100
                      )}
                      {numeric(
                        "currentLifePercent",
                        "Current target life %",
                        0,
                        100
                      )}
                    </SimpleGrid>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
            {["Corpse Explosion", "Death Sentry"].includes(
              profile.sourceSkillName || profile.skillName
            ) ? (
              <Alert color="yellow">
                This comparison covers the source profile's fixed payload.
                Corpse-life explosion damage is not included, so DPS is
                incomplete.
              </Alert>
            ) : null}
            {results.length ? (
              <>
                {mode === "map" && averageLanded && <Text data-testid="effective-map-average">
                  Average per monster type: {range(averageLanded)} · Effective DPS: {format(averageDps)}
                </Text>}
                <Table.ScrollContainer minWidth={720}>
                  <Table striped withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Target</Table.Th>
                        <Table.Th>Raw baseline</Table.Th>
                        <Table.Th>After target modifiers</Table.Th>
                        <Table.Th>Landed hit chance</Table.Th>
                        <Table.Th>Effective DPS</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {results.map((result) => (
                        <Table.Tr
                          key={result.monster.id}
                          data-testid="effective-target-row"
                          onClick={() => setDetailId(result.monster.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <Table.Td>
                            {result.monster.name}{" "}
                            <Badge size="xs">Level {result.level}</Badge>
                          </Table.Td>
                          <Table.Td>{range(result.raw)}</Table.Td>
                          <Table.Td>{range(result.landed)}</Table.Td>
                          <Table.Td>
                            {result.hitChance === null
                              ? "Needs input"
                              : `${format(result.hitChance * 100)}%`}
                          </Table.Td>
                          <Table.Td>{format(result.dps)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
                {mode === "map" ? (
                  <Text size="sm" c="dimmed">
                    Each row compares the same raw profile against an enemy
                    species in this area. Spawn counts, routes, and pack overlap
                    are not assumed. Select a row for its breakdown.
                  </Text>
                ) : null}
                {selected ? (
                  <>
                    <Text fw={600}>
                      {selected.monster.name}: effective breakdown
                    </Text>
                    <Group gap="sm">
                      <Badge>Defense {format(selected.defense)}</Badge>
                      <Badge>Life {range(selected.life)}</Badge>
                      <Badge>
                        Attack rating {format(selected.attackRating)}
                      </Badge>
                      <Badge>
                        Actions/sec {format(selected.actionsPerSecond)}
                      </Badge>
                    </Group>
                    <Group gap="sm">
                      {elements.map((element) => (
                        <Badge
                          key={element}
                          color={
                            selected.resistances[element] >= 100
                              ? "red"
                              : "blue"
                          }
                        >
                          {element} {format(selected.resistances[element])}%
                        </Badge>
                      ))}
                    </Group>
                    {selectedStats && <Text size="xs" c="dimmed">
                      Flat physical reduction: {selectedStats.flatPhysicalReduction} · Flat magic reduction: {selectedStats.flatMagicReduction} · Poison length reduction: {selectedStats.poisonLengthReduction}% · Curse duration reduction: {selectedStats.curseResistance}% · Curse effect reduction: {selectedStats.curseEffectReduction}% · Block: {selectedStats.block}%
                    </Text>}
                    <SimpleGrid cols={{ base: 2, sm: 4 }}>
                      <Text>Instant DPS: {format(selected.instantDps)}</Text>
                      <Text>DoT DPS: {format(selected.dotDps)}</Text>
                      <Text>
                        Aura pulse DPS: {format(selected.auraPulseDps)}
                      </Text>
                      <Text>
                        Crushing Blow DPS: {format(selected.crushingDps)}
                      </Text>
                      <Text>
                        Open Wounds DPS: {format(selected.openWoundsDps)}
                      </Text>
                    </SimpleGrid>
                    <Table.ScrollContainer minWidth={600}>
                      <Table>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Component</Table.Th>
                            <Table.Th>Before target</Table.Th>
                            <Table.Th>After target</Table.Th>
                            <Table.Th>Resistance multiplier</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {selected.components.map((component) => (
                            <Table.Tr key={component.id}>
                              <Table.Td>
                                {profile.damageComponents.find(
                                  (c) => c.id === component.id
                                )?.label || component.element}
                              </Table.Td>
                              <Table.Td>{range(component.raw)}</Table.Td>
                              <Table.Td>{range(component.landed)}</Table.Td>
                              <Table.Td>
                                {format(component.multiplier)}×
                              </Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                    {selected.notes.map((note) => (
                      <Text size="sm" c="dimmed" key={note}>
                        {note}
                      </Text>
                    ))}
                  </>
                ) : null}
              </>
            ) : (
              <Text size="sm" c="dimmed">
                Choose a target with a monster population for this difficulty.
              </Text>
            )}
          </>
        )}
      </Stack>
    </Paper>
  );
}
