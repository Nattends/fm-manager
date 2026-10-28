import { attributesOf, type AttributeKey } from './attributes'
import type { Position } from './positions'
import type { Attributes, Foot, NewPlayer, PlayerStatus } from './types'

/** Début des notes d'un joueur de démo : permet de retirer l'équipe de démo d'un clic. */
export const DEMO_MARKER = '[demo]'

export function isDemoPlayer(p: { notes: string }): boolean {
  return p.notes.startsWith(DEMO_MARKER)
}

type Archetype = 'gk' | 'cb' | 'fb' | 'dm' | 'mc' | 'w' | 'amc' | 'st'

/** Attributs clés de chaque profil : ils sont tirés au niveau du joueur, les autres en dessous. */
const KEY_ATTRIBUTES: Record<Archetype, AttributeKey[]> = {
  gk: ['handling', 'reflexes', 'oneOnOnes', 'aerialReach', 'commandOfArea', 'communication', 'kicking', 'positioning', 'concentration', 'agility', 'decisions'],
  cb: ['marking', 'tackling', 'heading', 'positioning', 'strength', 'jumpingReach', 'bravery', 'concentration', 'anticipation', 'composure'],
  fb: ['tackling', 'marking', 'crossing', 'pace', 'stamina', 'workRate', 'acceleration', 'positioning', 'teamwork'],
  dm: ['tackling', 'positioning', 'anticipation', 'passing', 'decisions', 'teamwork', 'workRate', 'concentration', 'stamina'],
  mc: ['passing', 'vision', 'firstTouch', 'stamina', 'workRate', 'decisions', 'teamwork', 'technique', 'offTheBall'],
  w: ['crossing', 'dribbling', 'pace', 'acceleration', 'agility', 'technique', 'flair', 'offTheBall'],
  amc: ['passing', 'vision', 'technique', 'firstTouch', 'flair', 'dribbling', 'decisions', 'longShots', 'composure', 'offTheBall'],
  st: ['finishing', 'composure', 'offTheBall', 'firstTouch', 'anticipation', 'heading', 'pace', 'acceleration', 'strength'],
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : la démo est identique à chaque chargement. */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeAttributes(archetype: Archetype, level: number, rand: () => number): Attributes {
  const keys = new Set(KEY_ATTRIBUTES[archetype])
  const groups = archetype === 'gk'
    ? (['goalkeeping', 'technical', 'mental', 'physical'] as const)
    : (['technical', 'mental', 'physical'] as const)
  const attrs: Attributes = {}
  for (const g of groups) {
    for (const a of attributesOf(g)) {
      const spread = Math.floor(rand() * 5) - 2
      const outfieldTechnicalForGk = archetype === 'gk' && g === 'technical' ? -5 : 0
      const base = keys.has(a) ? level + 1 : level - 4 + outfieldTechnicalForGk
      attrs[a] = Math.max(1, Math.min(20, base + spread))
    }
  }
  return attrs
}

interface DemoEntry {
  name: string
  age: number
  nationality: string
  foot: Foot
  positions: Partial<Record<Position, number>>
  archetype: Archetype
  /** Niveau moyen des attributs clés (1-20). */
  level: number
  status: PlayerStatus
  stars: [ca: number, pa: number]
  /** Attributs renseignés : tous, seulement quelques-uns (note partielle) ou aucun. */
  entry?: 'full' | 'partial' | 'none'
  note?: string
}

const ENTRIES: DemoEntry[] = [
  // Gardiens
  { name: 'Mike Maignan', age: 31, nationality: 'France', foot: 'right', positions: { GK: 20 }, archetype: 'gk', level: 17, status: 'key', stars: [4.5, 4.5] },
  { name: 'Jonas Halvorsen', age: 33, nationality: 'Norvège', foot: 'right', positions: { GK: 20 }, archetype: 'gk', level: 13, status: 'rotation', stars: [3, 3] },
  { name: 'Ilyes Benkhaled', age: 18, nationality: 'Algérie', foot: 'left', positions: { GK: 20 }, archetype: 'gk', level: 10, status: 'prospect', stars: [1.5, 4.5] },
  // Défenseurs centraux
  { name: 'William Saliba', age: 25, nationality: 'France', foot: 'right', positions: { DC: 20 }, archetype: 'cb', level: 18, status: 'key', stars: [5, 5] },
  { name: 'Cristian Romero', age: 28, nationality: 'Argentine', foot: 'right', positions: { DC: 20, DR: 10 }, archetype: 'cb', level: 16, status: 'key', stars: [4, 4] },
  { name: 'Kofi Asante', age: 22, nationality: 'Ghana', foot: 'right', positions: { DC: 20, DM: 14 }, archetype: 'cb', level: 13, status: 'rotation', stars: [3, 4] },
  { name: 'Lukas Brenner', age: 31, nationality: 'Allemagne', foot: 'right', positions: { DC: 17, DR: 14 }, archetype: 'cb', level: 12, status: 'for_sale', stars: [2.5, 2.5] },
  // Latéraux
  { name: 'Nuno Mendes', age: 24, nationality: 'Portugal', foot: 'left', positions: { DL: 20, WBL: 17, ML: 10 }, archetype: 'fb', level: 16, status: 'key', stars: [4, 4.5] },
  { name: 'Sami Lehtonen', age: 28, nationality: 'Finlande', foot: 'left', positions: { DL: 20, DC: 7 }, archetype: 'fb', level: 12, status: 'rotation', stars: [3, 3] },
  { name: 'Achraf Hakimi', age: 27, nationality: 'Maroc', foot: 'right', positions: { DR: 20, WBR: 20, MR: 14 }, archetype: 'fb', level: 17, status: 'key', stars: [4.5, 4.5] },
  { name: 'Nathan Cordier', age: 19, nationality: 'France', foot: 'right', positions: { DR: 17, DC: 10 }, archetype: 'fb', level: 11, status: 'prospect', stars: [2, 4.5] },
  // Milieux défensifs et centraux
  { name: 'Rodri', age: 30, nationality: 'Espagne', foot: 'right', positions: { DM: 20, MC: 17, DC: 10 }, archetype: 'dm', level: 18, status: 'key', stars: [5, 5] },
  { name: 'Moussa Diakhaté', age: 30, nationality: 'Sénégal', foot: 'right', positions: { DM: 20, DC: 14 }, archetype: 'dm', level: 14, status: 'rotation', stars: [3.5, 3.5] },
  { name: 'Jude Bellingham', age: 23, nationality: 'Angleterre', foot: 'right', positions: { MC: 20, AMC: 20, DM: 10 }, archetype: 'amc', level: 18, status: 'key', stars: [5, 5] },
  { name: 'Pedri', age: 23, nationality: 'Espagne', foot: 'right', positions: { MC: 20, AMC: 17, DM: 10 }, archetype: 'mc', level: 17, status: 'key', stars: [4.5, 5] },
  { name: 'Erwan Le Goff', age: 21, nationality: 'France', foot: 'right', positions: { MC: 17, MR: 10 }, archetype: 'mc', level: 12, status: 'prospect', stars: [2.5, 4], entry: 'partial', note: 'Seulement quelques attributs saisis : note partielle (~).' },
  // Ailiers et meneurs
  { name: 'Rodrygo', age: 25, nationality: 'Brésil', foot: 'right', positions: { AMR: 20, AML: 17, ST: 14 }, archetype: 'w', level: 17, status: 'key', stars: [4.5, 5] },
  { name: 'Yanis Haddad', age: 23, nationality: 'Maroc', foot: 'left', positions: { AMR: 20, MR: 17 }, archetype: 'w', level: 15, status: 'rotation', stars: [3.5, 4.5] },
  { name: 'Khvicha Kvaratskhelia', age: 25, nationality: 'Géorgie', foot: 'right', positions: { AML: 20, ML: 17, ST: 10 }, archetype: 'w', level: 17, status: 'key', stars: [4.5, 4.5] },
  { name: 'Pavel Novák', age: 26, nationality: 'Tchéquie', foot: 'left', positions: { ML: 20, AML: 17, DL: 7 }, archetype: 'w', level: 13, status: 'rotation', stars: [3, 3] },
  { name: 'Florian Wirtz', age: 23, nationality: 'Allemagne', foot: 'right', positions: { AMC: 20, AML: 17, MC: 14 }, archetype: 'amc', level: 17, status: 'rotation', stars: [4.5, 5] },
  // Attaquants
  { name: 'Kylian Mbappé', age: 27, nationality: 'France', foot: 'right', positions: { ST: 20, AML: 20 }, archetype: 'st', level: 19, status: 'key', stars: [5, 5] },
  { name: 'Erling Haaland', age: 26, nationality: 'Norvège', foot: 'left', positions: { ST: 20 }, archetype: 'st', level: 18, status: 'rotation', stars: [5, 5] },
  { name: 'Bram de Wit', age: 24, nationality: 'Pays-Bas', foot: 'left', positions: { ST: 20 }, archetype: 'st', level: 14, status: 'rotation', stars: [3, 4] },
  { name: 'Hugo Castell', age: 20, nationality: 'Espagne', foot: 'right', positions: { ST: 17, AMR: 10 }, archetype: 'st', level: 11, status: 'prospect', stars: [2, 4.5], entry: 'none', note: 'Aucun attribut saisi : pas de note (—).' },
  { name: 'Victor Osimhen', age: 27, nationality: 'Nigeria', foot: 'right', positions: { ST: 20 }, archetype: 'st', level: 17, status: 'unavailable', stars: [4.5, 4.5], note: 'Blessé : indisponible, jamais choisi dans le XI.' },
]

/** Équipe de démo, moitié vrais joueurs (photos Transfermarkt), moitié joueurs inventés (avatar inconnu). */
export function demoSquad(): NewPlayer[] {
  const year = new Date().getFullYear()
  return ENTRIES.map((e, i) => {
    const rand = rng(1000 + i)
    let attributes = makeAttributes(e.archetype, e.level, rand)
    if (e.entry === 'none') attributes = {}
    if (e.entry === 'partial') {
      attributes = Object.fromEntries(Object.entries(attributes).filter(([a]) => ['passing', 'stamina', 'workRate'].includes(a)))
    }
    const value = Math.round(e.stars[0] ** 3 * 1_000_000 * (e.age < 24 ? 1.5 : 1))
    return {
      name: e.name,
      age: e.age,
      nationality: e.nationality,
      foot: e.foot,
      positions: e.positions,
      caStars: e.stars[0],
      paStars: e.stars[1],
      contractEnd: `${year + 1 + (i % 4)}-06-30`,
      wage: Math.round(value / 400 / 1000) * 1000,
      value,
      status: e.status,
      notes: e.note ? `${DEMO_MARKER} ${e.note}` : DEMO_MARKER,
      attributes,
    }
  })
}
