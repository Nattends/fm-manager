import { DEMO_MARKER, makeAttributes, rng, type Archetype } from './demoSquad'
import type { Position } from './positions'
import type { Foot, NewPlayer, PlayerStatus } from './types'

/** Clubs réels (logo trouvé sur Transfermarkt) : club de l'équipe générée et clubs de prêt. */
export const RANDOM_CLUBS = [
  'Tottenham Hotspur', 'Aston Villa', 'Newcastle United', 'Brighton & Hove Albion', 'Girona FC', 'Real Sociedad',
  'Villarreal CF', 'Borussia Dortmund', 'Bayer 04 Leverkusen', 'Eintracht Frankfurt', 'Olympique Lyon', 'RC Lens',
  'LOSC Lille', 'Stade Rennais FC', 'SSC Napoli', 'Atalanta BC', 'AS Roma', 'Ajax Amsterdam', 'PSV Eindhoven',
  'SL Benfica', 'Sporting CP', 'Celtic FC', 'Club Brugge KV', 'Stade Brestois 29',
]

type Side = 'L' | 'R' | null

interface RealPlayer {
  name: string
  age: number
  nationality: string
  foot: Foot
  archetype: Archetype
  side: Side
  positions: Partial<Record<Position, number>>
  level: number
}

/** Vrais joueurs (photo Transfermarkt), répartis par profil et par côté. */
const REAL_PLAYERS: RealPlayer[] = [
  { name: 'Gianluigi Donnarumma', age: 27, nationality: 'it', foot: 'right', archetype: 'gk', side: null, positions: { GK: 20 }, level: 17 },
  { name: 'Diogo Costa', age: 27, nationality: 'pt', foot: 'right', archetype: 'gk', side: null, positions: { GK: 20 }, level: 16 },
  { name: 'Gregor Kobel', age: 28, nationality: 'ch', foot: 'right', archetype: 'gk', side: null, positions: { GK: 20 }, level: 16 },
  { name: 'Guglielmo Vicario', age: 30, nationality: 'it', foot: 'right', archetype: 'gk', side: null, positions: { GK: 20 }, level: 15 },
  { name: 'Lucas Chevalier', age: 25, nationality: 'fr', foot: 'right', archetype: 'gk', side: null, positions: { GK: 20 }, level: 15 },
  { name: 'Bart Verbruggen', age: 24, nationality: 'nl', foot: 'right', archetype: 'gk', side: null, positions: { GK: 20 }, level: 14 },

  { name: 'Virgil van Dijk', age: 35, nationality: 'nl', foot: 'right', archetype: 'cb', side: null, positions: { DC: 20 }, level: 17 },
  { name: 'Gabriel Magalhães', age: 28, nationality: 'br', foot: 'left', archetype: 'cb', side: null, positions: { DC: 20 }, level: 17 },
  { name: 'Alessandro Bastoni', age: 27, nationality: 'it', foot: 'left', archetype: 'cb', side: null, positions: { DC: 20, DL: 12 }, level: 17 },
  { name: 'Dayot Upamecano', age: 27, nationality: 'fr', foot: 'right', archetype: 'cb', side: null, positions: { DC: 20 }, level: 16 },
  { name: 'Micky van de Ven', age: 25, nationality: 'nl', foot: 'left', archetype: 'cb', side: null, positions: { DC: 20, DL: 14 }, level: 16 },
  { name: 'Leny Yoro', age: 20, nationality: 'fr', foot: 'right', archetype: 'cb', side: null, positions: { DC: 20 }, level: 14 },
  { name: 'Pau Cubarsí', age: 19, nationality: 'es', foot: 'right', archetype: 'cb', side: null, positions: { DC: 20 }, level: 15 },
  { name: 'Marc Guéhi', age: 26, nationality: 'gb-eng', foot: 'right', archetype: 'cb', side: null, positions: { DC: 20 }, level: 15 },

  { name: 'Alejandro Grimaldo', age: 31, nationality: 'es', foot: 'left', archetype: 'fb', side: 'L', positions: { DL: 20, WBL: 20, ML: 14 }, level: 16 },
  { name: 'Theo Hernández', age: 29, nationality: 'fr', foot: 'left', archetype: 'fb', side: 'L', positions: { DL: 20, WBL: 17 }, level: 16 },
  { name: 'Destiny Udogie', age: 23, nationality: 'it', foot: 'left', archetype: 'fb', side: 'L', positions: { DL: 20, WBL: 17 }, level: 14 },
  { name: 'Alphonso Davies', age: 26, nationality: 'ca', foot: 'left', archetype: 'fb', side: 'L', positions: { DL: 20, WBL: 17, ML: 14 }, level: 16 },
  { name: 'Jules Koundé', age: 28, nationality: 'fr', foot: 'right', archetype: 'fb', side: 'R', positions: { DR: 20, DC: 17 }, level: 16 },
  { name: 'Jeremie Frimpong', age: 25, nationality: 'nl', foot: 'right', archetype: 'fb', side: 'R', positions: { WBR: 20, DR: 17, MR: 14 }, level: 15 },
  { name: 'Pedro Porro', age: 27, nationality: 'es', foot: 'right', archetype: 'fb', side: 'R', positions: { DR: 20, WBR: 20 }, level: 15 },
  { name: 'Trent Alexander-Arnold', age: 28, nationality: 'gb-eng', foot: 'right', archetype: 'fb', side: 'R', positions: { DR: 20, MC: 14 }, level: 16 },

  { name: 'Declan Rice', age: 27, nationality: 'gb-eng', foot: 'right', archetype: 'dm', side: null, positions: { DM: 20, MC: 20 }, level: 17 },
  { name: 'Aurélien Tchouaméni', age: 26, nationality: 'fr', foot: 'right', archetype: 'dm', side: null, positions: { DM: 20, MC: 17, DC: 12 }, level: 16 },
  { name: 'Martín Zubimendi', age: 27, nationality: 'es', foot: 'right', archetype: 'dm', side: null, positions: { DM: 20, MC: 17 }, level: 16 },
  { name: 'Joshua Kimmich', age: 31, nationality: 'de', foot: 'right', archetype: 'dm', side: null, positions: { DM: 20, MC: 20, DR: 17 }, level: 17 },
  { name: 'Moisés Caicedo', age: 24, nationality: 'ec', foot: 'right', archetype: 'dm', side: null, positions: { DM: 20, MC: 17 }, level: 16 },
  { name: 'Manuel Ugarte', age: 25, nationality: 'uy', foot: 'right', archetype: 'dm', side: null, positions: { DM: 20 }, level: 14 },

  { name: 'Vitinha', age: 26, nationality: 'pt', foot: 'right', archetype: 'mc', side: null, positions: { MC: 20, DM: 17 }, level: 17 },
  { name: 'Federico Valverde', age: 28, nationality: 'uy', foot: 'right', archetype: 'mc', side: null, positions: { MC: 20, MR: 17, DM: 14 }, level: 17 },
  { name: 'Nicolò Barella', age: 29, nationality: 'it', foot: 'right', archetype: 'mc', side: null, positions: { MC: 20 }, level: 16 },
  { name: 'Alexis Mac Allister', age: 27, nationality: 'ar', foot: 'right', archetype: 'mc', side: null, positions: { MC: 20, DM: 17 }, level: 16 },
  { name: 'Warren Zaïre-Emery', age: 20, nationality: 'fr', foot: 'right', archetype: 'mc', side: null, positions: { MC: 20, DM: 14 }, level: 14 },
  { name: 'Frenkie de Jong', age: 29, nationality: 'nl', foot: 'right', archetype: 'mc', side: null, positions: { MC: 20, DM: 17 }, level: 16 },

  { name: 'Martin Ødegaard', age: 27, nationality: 'no', foot: 'left', archetype: 'amc', side: null, positions: { AMC: 20, MC: 17 }, level: 17 },
  { name: 'Jamal Musiala', age: 23, nationality: 'de', foot: 'right', archetype: 'amc', side: null, positions: { AMC: 20, AML: 17 }, level: 17 },
  { name: 'Cole Palmer', age: 24, nationality: 'gb-eng', foot: 'left', archetype: 'amc', side: null, positions: { AMC: 20, AMR: 17 }, level: 17 },
  { name: 'Xavi Simons', age: 23, nationality: 'nl', foot: 'right', archetype: 'amc', side: null, positions: { AMC: 20, AML: 14 }, level: 15 },
  { name: 'Rayan Cherki', age: 23, nationality: 'fr', foot: 'right', archetype: 'amc', side: null, positions: { AMC: 20, AMR: 17 }, level: 15 },

  { name: 'Vinícius Júnior', age: 26, nationality: 'br', foot: 'right', archetype: 'w', side: 'L', positions: { AML: 20, ST: 14 }, level: 18 },
  { name: 'Nico Williams', age: 24, nationality: 'es', foot: 'right', archetype: 'w', side: 'L', positions: { AML: 20, AMR: 17 }, level: 16 },
  { name: 'Bradley Barcola', age: 24, nationality: 'fr', foot: 'right', archetype: 'w', side: 'L', positions: { AML: 20, AMR: 14 }, level: 15 },
  { name: 'Rafael Leão', age: 27, nationality: 'pt', foot: 'right', archetype: 'w', side: 'L', positions: { AML: 20, ST: 14 }, level: 16 },
  { name: 'Lamine Yamal', age: 19, nationality: 'es', foot: 'left', archetype: 'w', side: 'R', positions: { AMR: 20, AMC: 14 }, level: 17 },
  { name: 'Bukayo Saka', age: 25, nationality: 'gb-eng', foot: 'left', archetype: 'w', side: 'R', positions: { AMR: 20, MR: 17 }, level: 17 },
  { name: 'Michael Olise', age: 24, nationality: 'fr', foot: 'left', archetype: 'w', side: 'R', positions: { AMR: 20, AMC: 17 }, level: 16 },
  { name: 'Mohamed Salah', age: 34, nationality: 'eg', foot: 'left', archetype: 'w', side: 'R', positions: { AMR: 20, ST: 14 }, level: 17 },

  { name: 'Harry Kane', age: 33, nationality: 'gb-eng', foot: 'right', archetype: 'st', side: null, positions: { ST: 20, AMC: 14 }, level: 18 },
  { name: 'Lautaro Martínez', age: 29, nationality: 'ar', foot: 'right', archetype: 'st', side: null, positions: { ST: 20 }, level: 17 },
  { name: 'Viktor Gyökeres', age: 28, nationality: 'se', foot: 'right', archetype: 'st', side: null, positions: { ST: 20 }, level: 16 },
  { name: 'Alexander Isak', age: 27, nationality: 'se', foot: 'right', archetype: 'st', side: null, positions: { ST: 20, AML: 14 }, level: 17 },
  { name: 'Hugo Ekitiké', age: 24, nationality: 'fr', foot: 'right', archetype: 'st', side: null, positions: { ST: 20 }, level: 15 },
  { name: 'Victor Osimhen', age: 27, nationality: 'ng', foot: 'right', archetype: 'st', side: null, positions: { ST: 20 }, level: 17 },
  { name: 'Benjamin Šeško', age: 23, nationality: 'si', foot: 'right', archetype: 'st', side: null, positions: { ST: 20 }, level: 15 },
]

/** Prénoms et noms par nationalité, pour les joueurs inventés (avatar inconnu). */
const NAMES: Record<string, [first: string[], last: string[]]> = {
  fr: [['Lucas', 'Hugo', 'Théo', 'Enzo', 'Mathis', 'Nolan', 'Rayan', 'Yanis', 'Maxime', 'Kylian'], ['Morel', 'Girard', 'Lefèvre', 'Mercier', 'Boyer', 'Garnier', 'Chevalier', 'Rousseau', 'Faure', 'Blanc']],
  es: [['Pablo', 'Álvaro', 'Iker', 'Sergio', 'Adrián', 'Marcos', 'Unai', 'Hugo'], ['Navarro', 'Ortega', 'Romero', 'Castillo', 'Vidal', 'Serrano', 'Ibáñez', 'Molina']],
  br: [['Gabriel', 'Matheus', 'Thiago', 'Vitor', 'Caio', 'Rafael', 'Igor'], ['Souza', 'Ribeiro', 'Carvalho', 'Moura', 'Teixeira', 'Barbosa', 'Pereira']],
  'gb-eng': [['Jack', 'Harry', 'Oliver', 'Charlie', 'George', 'Alfie', 'Callum'], ['Walker', 'Bennett', 'Hughes', 'Fletcher', 'Marsh', 'Turner', 'Collins']],
  de: [['Jonas', 'Lukas', 'Felix', 'Niklas', 'Leon', 'Moritz'], ['Becker', 'Hoffmann', 'Krause', 'Brandt', 'Vogel', 'Schäfer']],
  it: [['Matteo', 'Lorenzo', 'Davide', 'Riccardo', 'Tommaso', 'Andrea'], ['Esposito', 'Ferrara', 'Colombo', 'Greco', 'Rinaldi', 'Marchetti']],
  pt: [['João', 'Tiago', 'Rúben', 'Diogo', 'Nuno', 'Gonçalo'], ['Silva', 'Ferreira', 'Mendes', 'Correia', 'Pinto', 'Lopes']],
  nl: [['Daan', 'Sem', 'Bram', 'Lars', 'Jesse', 'Thijs'], ['de Vries', 'Bakker', 'Visser', 'Smit', 'Mulder', 'de Boer']],
  sn: [['Moussa', 'Cheikh', 'Ibrahima', 'Pape', 'Mamadou'], ['Diallo', 'Ndiaye', 'Sarr', 'Faye', 'Cissé']],
  ma: [['Yassine', 'Amine', 'Bilal', 'Ilias', 'Achraf'], ['El Idrissi', 'Bennani', 'Ziani', 'Amrani', 'Tahiri']],
  ar: [['Santiago', 'Nicolás', 'Thiago', 'Franco', 'Valentín'], ['Gómez', 'Sosa', 'Acosta', 'Medina', 'Herrera']],
  no: [['Magnus', 'Henrik', 'Sander', 'Eirik'], ['Hansen', 'Johansen', 'Berg', 'Haugen']],
}

/** Composition d'un effectif : profil et côté de chaque joueur. */
const TEMPLATE: [Archetype, Side][] = [
  ['gk', null], ['gk', null], ['gk', null],
  ['cb', null], ['cb', null], ['cb', null], ['cb', null],
  ['fb', 'L'], ['fb', 'L'], ['fb', 'R'], ['fb', 'R'],
  ['dm', null], ['dm', null],
  ['mc', null], ['mc', null], ['mc', null],
  ['amc', null], ['amc', null],
  ['w', 'L'], ['w', 'L'], ['w', 'R'], ['w', 'R'],
  ['st', null], ['st', null], ['st', null],
]

/** Postes d'un joueur inventé selon son profil et son côté, avec parfois un poste secondaire. */
function generatedPositions(archetype: Archetype, side: Side, rand: () => number): Partial<Record<Position, number>> {
  const extra = rand() < 0.5
  switch (archetype) {
    case 'gk': return { GK: 20 }
    case 'cb': return extra ? { DC: 20, DM: 12 } : { DC: 20 }
    case 'fb': return side === 'L' ? { DL: 20, WBL: extra ? 17 : 14 } : { DR: 20, WBR: extra ? 17 : 14 }
    case 'dm': return { DM: 20, MC: extra ? 17 : 12 }
    case 'mc': return extra ? { MC: 20, AMC: 14 } : { MC: 20, DM: 14 }
    case 'amc': return { AMC: 20, MC: extra ? 17 : 12 }
    case 'w': return side === 'L' ? { AML: 20, ML: extra ? 17 : 12 } : { AMR: 20, MR: extra ? 17 : 12 }
    case 'st': return extra ? { ST: 20, AMC: 12 } : { ST: 20 }
  }
}

function pick<T>(list: readonly T[], rand: () => number): T {
  return list[Math.floor(rand() * list.length)]
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

/** Étoiles (pas de 0,5) d'après le niveau des attributs. */
function stars(level: number): number {
  return clamp(Math.round((level - 6) / 1.3) / 2, 0.5, 5)
}

export interface RandomTeam {
  clubName: string
  players: NewPlayer[]
}

/**
 * Équipe de test aléatoire : un club réel, 25 joueurs (environ un tiers de vrais joueurs,
 * le reste inventé), un niveau d'équipe tiré au sort, des espoirs, un blessé, un joueur à
 * vendre, un joueur aux attributs partiels et deux joueurs prêtés. Tous marqués « [demo] ».
 */
export function randomTeam(seed: number, takenClubNames: string[] = []): RandomTeam {
  const rand = rng(seed)
  const taken = new Set(takenClubNames.map((n) => n.toLowerCase()))
  const freeClubs = RANDOM_CLUBS.filter((c) => !taken.has(c.toLowerCase()))
  const clubName = pick(freeClubs.length ? freeClubs : RANDOM_CLUBS, rand)
  /** Niveau moyen de l'équipe : de club modeste (10) à cador (16). */
  const tier = 10 + Math.floor(rand() * 7)
  const usedReal = new Set<string>()
  const usedNames = new Set<string>()
  const year = new Date().getFullYear()

  const invent = (archetype: Archetype, side: Side, young = false) => {
    const nation = pick(Object.keys(NAMES), rand)
    const [first, last] = NAMES[nation]
    let name = ''
    do name = `${pick(first, rand)} ${pick(last, rand)}`
    while (usedNames.has(name))
    usedNames.add(name)
    const age = young ? 17 + Math.floor(rand() * 4) : 18 + Math.floor(rand() * 16)
    const level = clamp(tier + Math.floor(rand() * 7) - 3 - (age < 20 ? 2 : 0), 6, 19)
    const foot: Foot = side === 'L' ? (rand() < 0.8 ? 'left' : 'right') : side === 'R' ? 'right' : pick(['right', 'right', 'left', 'both'] as Foot[], rand)
    return { name, age, nationality: nation, foot, archetype, positions: generatedPositions(archetype, side, rand), level }
  }

  const drafted = TEMPLATE.map(([archetype, side]) => {
    const candidates = REAL_PLAYERS.filter((p) => p.archetype === archetype && p.side === side && !usedReal.has(p.name))
    if (candidates.length && rand() < 0.35) {
      const real = pick(candidates, rand)
      usedReal.add(real.name)
      return { ...real, real: true }
    }
    return { ...invent(archetype, side), real: false }
  })

  // Statuts : les meilleurs sont cadres, les jeunes espoirs, puis un blessé et un joueur à vendre.
  const byLevel = [...drafted].sort((a, b) => b.level - a.level)
  const status = new Map<(typeof drafted)[number], PlayerStatus>()
  byLevel.slice(0, 7).forEach((p) => status.set(p, 'key'))
  for (const p of drafted) if (!status.has(p)) status.set(p, p.age <= 20 ? 'prospect' : 'rotation')
  const rotation = drafted.filter((p) => status.get(p) === 'rotation')
  if (rotation.length) status.set(pick(rotation, rand), 'unavailable')
  const forSale = drafted.filter((p) => status.get(p) === 'rotation').sort((a, b) => b.age - a.age)[0]
  if (forSale) status.set(forSale, 'for_sale')
  const partial = pick(drafted.filter((p) => !p.real), rand)

  const toPlayer = (p: (typeof drafted)[number], i: number, playerStatus: PlayerStatus, loanClub?: string): NewPlayer => {
    let attributes = makeAttributes(p.archetype, p.level, rand)
    if (p === partial) {
      attributes = Object.fromEntries(Object.entries(attributes).filter(([a]) => ['passing', 'stamina', 'workRate', 'pace'].includes(a)))
    }
    const ca = stars(p.level)
    const pa = clamp(ca + (p.age < 21 ? 1.5 : p.age < 24 ? 0.5 : 0), ca, 5)
    const value = Math.round(ca ** 3 * 1_000_000 * (p.age < 24 ? 1.5 : 1) * (p.age > 31 ? 0.4 : 1))
    const notes = [
      DEMO_MARKER,
      p.real ? '' : 'Joueur inventé.',
      p === partial ? 'Attributs partiels : note partielle (~).' : '',
      playerStatus === 'unavailable' ? 'Blessé.' : '',
    ].filter(Boolean).join(' ')
    return {
      name: p.name,
      age: p.age,
      nationality: p.nationality,
      club: loanClub ?? '',
      onLoan: loanClub !== undefined,
      foot: p.foot,
      positions: p.positions,
      caStars: ca,
      paStars: pa,
      contractEnd: `${year + 1 + (i % 5)}-06-30`,
      wage: Math.round(value / 400 / 1000) * 1000,
      value,
      status: playerStatus,
      notes,
      attributes,
    }
  }

  const players = drafted.map((p, i) => toPlayer(p, i, status.get(p)!))
  // Deux jeunes prêtés à d'autres clubs (hors effectif).
  const loanClubs = RANDOM_CLUBS.filter((c) => c !== clubName)
  for (const [archetype, side] of [pick(TEMPLATE, rand), pick(TEMPLATE, rand)]) {
    const p = { ...invent(archetype, side, true), real: false }
    players.push(toPlayer(p, players.length, 'prospect', pick(loanClubs, rand)))
  }
  return { clubName, players }
}
