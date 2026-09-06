import type { DamageElement } from "./damage";

export type TargetDifficulty = "normal" | "nightmare" | "hell";
export type TargetResistances = Record<DamageElement, number>;

export interface MonsterTargetStats {
  resistances: TargetResistances;
  poisonLengthReduction: number;
  curseResistance: number;
  curseEffectReduction: number;
  receivesImmunityAura: boolean;
  flatPhysicalReduction: number;
  flatMagicReduction: number;
  absorbPercent: Partial<TargetResistances>;
  absorbFlat: Partial<TargetResistances>;
  block: number;
  notes: string[];
}

export interface MonsterTarget {
  id: string;
  name: string;
  monsterId: string;
  kind: "monster" | "boss" | "superunique";
  creatureType: "demon" | "undead" | "other";
  difficulties: Record<TargetDifficulty, MonsterTargetStats>;
  fixedModifiers: number[];
  areas: string[];
  notes: string[];
}

export interface MapTarget {
  id: string;
  name: string;
  monsterIds: string[];
  bossIds: string[];
  notes: string[];
}

export interface DamageTargetCatalog {
  season: number;
  monsters: MonsterTarget[];
  maps: MapTarget[];
}
