import { describe, expect, it } from 'vitest'
import { ALL_ATTRIBUTES, isAttributeKey, type AttributeKey } from './attributes'
import { DEFAULT_ROLES, DEFAULT_ROLE_BY_POSITION, isRoleList } from './defaultRoles'
import { FORMATIONS, getFormation } from './formations'
import { hungarianMax } from './hungarian'
import {
  benchPlayer, canPlace, computeLineup, copyInPossession, defaultTacticSlots, layoutName, mergePhase, moveSlot, normalizeTacticSlots,
  patchShape, phaseSlots, placePlayer, resolveRole, summarizeLineup, widenLegacyGrid,
} from './lineup'
import { PITCH_COLS, PITCH_ROWS, formationName, positionAt } from './pitch'
import { POSITIONS, isPosition, type Position } from './positions'
import { allRoleRatings, familiarityFactor, nextWeight, rateRole, scoreFromAverage } from './rating'
import type { Attributes, Player } from './types'

let nextId = 1
function player(name: string, positions: Partial<Record<Position, number>>, attributes: Attributes = {}, caStars = 3): Player {
  return {
    id: nextId++, name, age: 25, nationality: 'FRA', clubId: 1, club: '', onLoan: false, foot: 'right', positions,
    caStars, paStars: caStars, contractEnd: null, wage: null, value: null,
    status: 'rotation', notes: '', attributes, photo: null, photoLookup: null,
  }
}

/** Tous les attributs à la même valeur. */
function level(n: number): Attributes {
  return Object.fromEntries(ALL_ATTRIBUTES.map((a) => [a, n]))
}

const role = (id: string) => DEFAULT_ROLES.find((r) => r.id === id)!

describe('données par défaut', () => {
  it('les rôles ne référencent que des attributs et postes existants, avec des poids positifs', () => {
    for (const r of DEFAULT_ROLES) {
      for (const [a, w] of Object.entries(r.weights)) {
        expect(isAttributeKey(a), `${r.id}: ${a}`).toBe(true)
        expect(w, `${r.id}: ${a}`).toBeGreaterThan(0)
      }
      for (const p of r.positions) expect(isPosition(p), `${r.id}: ${p}`).toBe(true)
    }
    expect(new Set(DEFAULT_ROLES.map((r) => r.id)).size).toBe(DEFAULT_ROLES.length)
    expect(isRoleList(DEFAULT_ROLES)).toBe(true)
  })

  it('chaque poste a un profil par défaut qui le couvre', () => {
    for (const p of POSITIONS) expect(role(DEFAULT_ROLE_BY_POSITION[p]).positions, p).toContain(p)
  })

  it('chaque formation a 11 postes avec un rôle par défaut valide pour ce poste', () => {
    for (const f of FORMATIONS) {
      expect(f.slots, f.id).toHaveLength(11)
      expect(new Set(f.slots.map((s) => s.id)).size, f.id).toBe(11)
      for (const s of f.slots) expect(role(s.defaultRole).positions, `${f.id}/${s.id}`).toContain(s.position)
    }
  })

  it('ignore les rôles enregistrés à l\'ancien format (clés / secondaires)', () => {
    expect(isRoleList([{ id: 'p', name: 'x', positions: ['ST'], key: [], secondary: [] }])).toBe(false)
  })
})

describe('poids du notebook « position score calculator »', () => {
  // Attributs pseudo-aléatoires mais déterministes.
  const attrs = Object.fromEntries(ALL_ATTRIBUTES.map((a, i) => [a, 4 + ((i * 7) % 17)])) as Record<AttributeKey, number>
  const p = player('N', { GK: 20, DL: 20, DC: 20, DM: 20, MC: 20, ML: 20, AMC: 20, ST: 20 }, attrs)
  const avg = (...keys: AttributeKey[]) => keys.reduce((s, k) => s + attrs[k], 0) / keys.length

  it('latéral : (essentiels×5 + principaux×3 + secondaires×1) / 46', () => {
    const essential = attrs.workRate + attrs.acceleration + attrs.pace + attrs.stamina
    const core = attrs.crossing + attrs.dribbling + attrs.marking + attrs.offTheBall + attrs.tackling + attrs.teamwork
    const secondary = attrs.agility + attrs.anticipation + attrs.concentration + attrs.decisions + attrs.firstTouch
      + attrs.passing + attrs.positioning + attrs.technique
    expect(rateRole(p, role('fb')).average).toBeCloseTo((essential * 5 + core * 3 + secondary) / 46, 1)
  })

  it('défenseur central : 0,75 × moyenne(principaux) + 0,25 × moyenne(secondaires)', () => {
    const core = avg('composure', 'heading', 'jumpingReach', 'marking', 'passing', 'positioning', 'strength', 'tackling', 'pace')
    const secondary = avg('aggression', 'anticipation', 'bravery', 'concentration', 'decisions', 'firstTouch', 'technique', 'vision')
    expect(rateRole(p, role('cb')).average).toBeCloseTo(core * 0.75 + secondary * 0.25, 1)
  })

  it('attaquant : 0,5 × moyenne(principaux) + 0,5 × moyenne(secondaires)', () => {
    const core = avg('composure', 'finishing', 'offTheBall', 'pace')
    const secondary = avg('acceleration', 'agility', 'anticipation', 'balance', 'decisions', 'dribbling', 'firstTouch',
      'passing', 'stamina', 'technique', 'workRate')
    expect(rateRole(p, role('str')).average).toBeCloseTo(core * 0.5 + secondary * 0.5, 1)
  })

  it('ailier : 0,75 × moyenne(principaux) + 0,25 × moyenne(secondaires)', () => {
    const core = avg('acceleration', 'crossing', 'dribbling', 'offTheBall', 'pace', 'technique')
    const secondary = avg('agility', 'firstTouch', 'passing', 'stamina', 'workRate')
    expect(rateRole(p, role('w')).average).toBeCloseTo(core * 0.75 + secondary * 0.25, 1)
  })

  it('gardien : (essentiels×5 + principaux×3 + secondaires×1) / 37', () => {
    const essential = attrs.agility + attrs.reflexes
    const core = attrs.oneOnOnes + attrs.anticipation + attrs.commandOfArea + attrs.concentration + attrs.kicking + attrs.positioning
    const secondary = attrs.acceleration + attrs.aerialReach + attrs.composure + attrs.decisions + attrs.firstTouch
      + attrs.handling + attrs.passing + attrs.throwing + attrs.vision
    expect(rateRole(p, role('gk')).average).toBeCloseTo((essential * 5 + core * 3 + secondary) / 37, 1)
  })
})

describe('rateRole', () => {
  it('ne dépend pas des étoiles', () => {
    const a = player('A', { ST: 20 }, level(15), 1)
    const b = player('B', { ST: 20 }, level(15), 5)
    expect(rateRole(a, role('str')).score).toBe(rateRole(b, role('str')).score)
  })

  it('sans attribut du rôle : pas de note', () => {
    const r = rateRole(player('C', { ST: 20 }, {}, 5), role('str'))
    expect(r.rated).toBe(false)
    expect(r.score).toBe(0)
  })

  it('ignore les attributs non renseignés et signale une note partielle', () => {
    const r = rateRole(player('D', { ST: 20 }, { finishing: 16, composure: 16 }), role('str'))
    expect(r.average).toBe(16)
    expect(r.estimated).toBe(true)
  })

  it('courbe étalée : bon joueur ≈ 77, excellent ≈ 92', () => {
    expect(scoreFromAverage(15)).toBe(75)
    expect(scoreFromAverage(15.4)).toBeCloseTo(77.3, 1)
    expect(scoreFromAverage(18)).toBe(92)
    expect(scoreFromAverage(20)).toBe(100)
    // Entre 12 et 18, chaque point d'attribut moyen vaut nettement plus que 5 points de note.
    expect(scoreFromAverage(16) - scoreFromAverage(15)).toBeGreaterThan(5)
    expect(rateRole(player('E', { ST: 20 }, level(18)), role('str')).score).toBe(92)
  })

  it('pénalité de poste allégée pour les familiarités faibles', () => {
    expect(familiarityFactor(20)).toBe(1)
    expect(familiarityFactor(17)).toBeCloseTo(0.96)
    expect(familiarityFactor(14)).toBeCloseTo(0.88)
    expect(familiarityFactor(10)).toBeCloseTo(0.8)
    expect(familiarityFactor(7)).toBeCloseTo(0.72)
    expect(familiarityFactor(3)).toBeCloseTo(0.62)
    expect(familiarityFactor(undefined)).toBe(0.5)
    const natural = rateRole(player('F', { ST: 20 }, level(16)), role('str'))
    const never = rateRole(player('G', { DC: 20 }, level(16)), role('str'))
    expect(never.score).toBeCloseTo(natural.score * 0.5, 0)
  })
})

describe('écran Rôles et fiche joueur', () => {
  it('le clic fait tourner le poids : ×0 → ×5 → ×3 → ×1 → ×0', () => {
    expect([0, 5, 3, 1].map(nextWeight)).toEqual([5, 3, 1, 0])
    // Poids du notebook hors paliers : palier inférieur le plus proche.
    expect(nextWeight(11)).toBe(5)
    expect(nextWeight(8)).toBe(5)
    expect(nextWeight(4)).toBe(3)
    expect(nextWeight(2)).toBe(1)
  })

  it('la fiche liste tous les rôles, y compris aux postes non joués', () => {
    const rows = allRoleRatings(player('H', { DC: 20 }, level(15)), DEFAULT_ROLES)
    expect(rows).toHaveLength(DEFAULT_ROLES.length)
    expect(rows[0].role.id).toBe('cb')
    expect(rows[0].playsPosition).toBe(true)
    const striker = rows.find((r) => r.role.id === 'str')!
    expect(striker.playsPosition).toBe(false)
    expect(striker.rating.familiarityFactor).toBe(0.5)
    expect(striker.rating.base).toBe(75)
  })
})

describe('grille et formations', () => {
  it('chaque formation prédéfinie occupe des cases distinctes et est reconnue', () => {
    for (const f of FORMATIONS) {
      expect(new Set(f.slots.map((s) => `${s.row}:${s.col}`)).size, f.id).toBe(11)
      expect(layoutName(defaultTacticSlots(f)).presetId).toBe(f.id)
    }
    expect(formationName(getFormation('4-2-3-1').slots)).toBe('4-2-3-1')
    expect(formationName(getFormation('4-4-2').slots)).toBe('4-4-2')
  })

  it('le poste découle de la case', () => {
    expect(positionAt(4, 0)).toBe('DL')
    expect(positionAt(3, 4)).toBe('DM')
    expect(positionAt(0, 0)).toBeNull()
    expect(positionAt(5, 2)).toBeNull()
    // Demi-espaces : postes axiaux.
    expect(positionAt(1, 1)).toBe('AMC')
    expect(positionAt(4, 7)).toBe('DC')
    expect(positionAt(0, 1)).toBe('ST')
  })

  it('déplacer une carte change le poste, garde un rôle compatible et sinon prend le profil du poste', () => {
    const slots = defaultTacticSlots(getFormation('4-2-3-1'))
    // L'ailier inversé de gauche descend en MG : rôle toujours valable.
    const a = moveSlot(slots, 'aml', 2, 0, DEFAULT_ROLES)
    expect(a.find((s) => s.slotId === 'aml')).toMatchObject({ row: 2, col: 0, roleId: 'amrl' })
    expect(layoutName(a)).toEqual({ presetId: 'custom', shape: '4-2-1-2-1' })
    // Le MOC descend en MDC : rôle incompatible → profil MDC.
    const b = moveSlot(slots, 'amc', 3, 4, DEFAULT_ROLES)
    expect(b.find((s) => s.slotId === 'amc')!.roleId).toBe('dm')
  })

  it('déposer une carte sur une case occupée échange les deux cartes', () => {
    const slots = defaultTacticSlots(getFormation('4-4-2'))
    const a = moveSlot(slots, 'ml', 2, 2, DEFAULT_ROLES)
    expect(a.find((s) => s.slotId === 'ml')).toMatchObject({ row: 2, col: 2 })
    expect(a.find((s) => s.slotId === 'mcl')).toMatchObject({ row: 2, col: 0 })
  })

  it('refuse de bouger le gardien ou d\'aller sur une case inexistante', () => {
    const slots = defaultTacticSlots(getFormation('4-4-2'))
    expect(moveSlot(slots, 'gk', 4, 4, DEFAULT_ROLES)).toBe(slots)
    expect(moveSlot(slots, 'stl', 0, 0, DEFAULT_ROLES)).toBe(slots)
    expect(moveSlot(slots, 'dcl', 5, 4, DEFAULT_ROLES)).toBe(slots)
  })

  it('place une carte dans un demi-espace si les colonnes voisines sont libres', () => {
    const slots = defaultTacticSlots(getFormation('4-3-3'))
    // Ailier gauche (colonne 0) vers le demi-espace (colonne 1) : voisin de rien sur la ligne des MO.
    const a = moveSlot(slots, 'aml', 1, 1, DEFAULT_ROLES)
    expect(a.find((s) => s.slotId === 'aml')).toMatchObject({ row: 1, col: 1 })
    expect(positionAt(1, 1)).toBe('AMC')
    // Demi-espace entre DG (0) et DCG (2) : les cartes se chevaucheraient.
    expect(canPlace(slots, 'dm', 4, 1)).toBe(false)
    expect(moveSlot(slots, 'dm', 4, 1, DEFAULT_ROLES)).toBe(slots)
  })

  it('convertit les tactiques à 5 couloirs vers la grille à 9 colonnes', () => {
    const legacy = [{ slotId: 'dl', row: 4, col: 0 }, { slotId: 'st', row: 0, col: 2, oop: { row: 1, col: 3, roleId: 'x', duty: 'auto' as const } }]
    expect(widenLegacyGrid(legacy)).toEqual([
      { slotId: 'dl', row: 4, col: 0 },
      { slotId: 'st', row: 0, col: 4, oop: { row: 1, col: 6, roleId: 'x', duty: 'auto' } },
    ])
  })

  it('complète les tactiques enregistrées sans cases', () => {
    const old = [{ slotId: 'st', roleId: 'str', duty: 'attack' as const, lockedPlayerId: 7 }]
    const slots = normalizeTacticSlots(old, '4-3-3')
    expect(slots).toHaveLength(11)
    expect(slots.find((s) => s.slotId === 'st')).toMatchObject({ row: 0, col: 4, roleId: 'str', lockedPlayerId: 7 })
  })

  it('un ancien identifiant de rôle retombe sur le profil du poste', () => {
    expect(resolveRole('cd', DEFAULT_ROLES, 'DC').id).toBe('cb')
    expect(resolveRole('af', DEFAULT_ROLES, 'ST').id).toBe('str')
  })
})

describe('hungarianMax', () => {
  it('trouve l\'affectation optimale (pas la gloutonne)', () => {
    // Glouton : ligne 0 → col 0 (10), ligne 1 → col 1 (1) = 11. Optimal : 9 + 8 = 17.
    expect(hungarianMax([[10, 9], [8, 1]])).toEqual([1, 0])
  })

  it('gère plus de colonnes que de lignes', () => {
    expect(hungarianMax([[1, 5, 3]])).toEqual([1])
  })
})

describe('computeLineup', () => {
  const f = getFormation('4-3-3')
  const squad: Player[] = [
    player('Gardien', { GK: 20 }, level(14)),
    player('DG', { DL: 20 }, level(14)), player('DD', { DR: 20 }, level(14)),
    player('DC1', { DC: 20 }, level(14)), player('DC2', { DC: 20 }, level(14)),
    player('MDC', { DM: 20 }, level(14)), player('MC1', { MC: 20 }, level(14)), player('MC2', { MC: 20 }, level(14)),
    player('AG', { AML: 20 }, level(14)), player('AD', { AMR: 20 }, level(14)),
    player('BU', { ST: 20 }, level(16)), player('BU2', { ST: 20 }, level(12)),
    player('Blessé', { ST: 20 }, level(19)),
    player('Prêté', { ST: 20 }, level(19)),
  ]
  squad[squad.length - 2].status = 'unavailable'
  squad[squad.length - 1].onLoan = true

  it('place chaque joueur à son poste naturel et exclut les indisponibles et les prêtés', () => {
    const lineup = computeLineup(defaultTacticSlots(f), squad, DEFAULT_ROLES)
    const at = (id: string) => lineup.slots.find((s) => s.slot.id === id)!.starter?.player.name
    expect(at('gk')).toBe('Gardien')
    expect(at('dl')).toBe('DG')
    expect(at('st')).toBe('BU')
    expect(lineup.bench.map((p) => p.name)).toEqual(['BU2'])
    expect(lineup.slots.find((s) => s.slot.id === 'st')!.backups[0].player.name).toBe('BU2')
  })

  it('résume le XI : âge moyen, lignes, joueurs hors poste', () => {
    const slots = defaultTacticSlots(f).map((s) => (s.slotId === 'dl' ? { ...s, lockedPlayerId: squad[11].id } : s))
    const summary = summarizeLineup(computeLineup(slots, squad, DEFAULT_ROLES))
    expect(summary.averageAge).toBe(25)
    expect(summary.outOfPosition).toBe(1)
    expect(summary.emptySlots).toBe(0)
    expect(summary.lines.attack).toBeGreaterThan(summary.lines.defence!)
  })
  it('respecte un joueur verrouillé', () => {
    const slots = defaultTacticSlots(f).map((s) => (s.slotId === 'st' ? { ...s, lockedPlayerId: squad[11].id } : s))
    const lineup = computeLineup(slots, squad, DEFAULT_ROLES)
    const st = lineup.slots.find((s) => s.slot.id === 'st')!
    expect(st.starter?.player.name).toBe('BU2')
    expect(st.locked).toBe(true)
  })

  it('n\'aligne pas un joueur écarté', () => {
    const bu = squad.find((p) => p.name === 'BU')!
    const lineup = computeLineup(defaultTacticSlots(f), squad, DEFAULT_ROLES, [bu.id])
    expect(lineup.slots.find((s) => s.slot.id === 'st')!.starter?.player.name).toBe('BU2')
    expect(lineup.bench.map((p) => p.name)).toEqual([])
  })

  it('glisser un titulaire sur un autre poste échange les deux joueurs', () => {
    const lineup = computeLineup(defaultTacticSlots(f), squad, DEFAULT_ROLES)
    const dg = squad.find((p) => p.name === 'DG')!
    const dd = squad.find((p) => p.name === 'DD')!
    const a = placePlayer(lineup, [], dg.id, 'dr')
    expect(a.slots.find((s) => s.slotId === 'dr')!.lockedPlayerId).toBe(dg.id)
    expect(a.slots.find((s) => s.slotId === 'dl')!.lockedPlayerId).toBe(dd.id)
    const after = computeLineup(a.slots, squad, DEFAULT_ROLES)
    expect(after.slots.find((s) => s.slot.id === 'dl')!.starter?.player.name).toBe('DD')
  })

  it('glisser un remplaçant sur un poste le titularise et retire l\'exclusion', () => {
    const bu2 = squad.find((p) => p.name === 'BU2')!
    const lineup = computeLineup(defaultTacticSlots(f), squad, DEFAULT_ROLES, [bu2.id])
    const a = placePlayer(lineup, [bu2.id], bu2.id, 'st')
    expect(a.excludedPlayerIds).toEqual([])
    const after = computeLineup(a.slots, squad, DEFAULT_ROLES, a.excludedPlayerIds)
    expect(after.slots.find((s) => s.slot.id === 'st')!.starter?.player.name).toBe('BU2')
    expect(after.bench.map((p) => p.name)).toEqual(['BU'])
  })

  it('renvoyer un titulaire sur le banc le déverrouille et l\'écarte', () => {
    const bu = squad.find((p) => p.name === 'BU')!
    const lineup = computeLineup(defaultTacticSlots(f), squad, DEFAULT_ROLES)
    const locked = placePlayer(lineup, [], bu.id, 'st')
    const a = benchPlayer(computeLineup(locked.slots, squad, DEFAULT_ROLES), locked.excludedPlayerIds, bu.id)
    expect(a.slots.every((s) => s.lockedPlayerId !== bu.id)).toBe(true)
    expect(a.excludedPlayerIds).toEqual([bu.id])
  })

  it('laisse des postes vides si l\'effectif est trop court', () => {
    const lineup = computeLineup(defaultTacticSlots(f), squad.slice(0, 3), DEFAULT_ROLES)
    expect(lineup.slots.filter((s) => s.starter).length).toBe(3)
  })
})

describe('phases avec et sans ballon', () => {
  const f = getFormation('4-3-3')
  const amr = () => defaultTacticSlots(f).find((s) => positionAt(s.row, s.col) === 'AMR')!
  /** Case libre du poste MD dans la vue sans ballon. */
  const mrCell = (slots: ReturnType<typeof defaultTacticSlots>) => {
    for (let row = 0; row < PITCH_ROWS; row++) {
      for (let col = 0; col < PITCH_COLS; col++) {
        if (positionAt(row, col) === 'MR' && !slots.some((s) => s.row === row && s.col === col)) return { row, col }
      }
    }
    throw new Error('aucune case MD libre')
  }
  /** Tactique dont l'ailier droit redescend milieu droit sans ballon. */
  const withMrOutOfPossession = () => {
    const slots = defaultTacticSlots(f)
    const view = phaseSlots(slots, 'oop')
    const { row, col } = mrCell(view)
    return mergePhase(slots, 'oop', moveSlot(view, amr().slotId, row, col, DEFAULT_ROLES))
  }

  it('par défaut, sans ballon = avec ballon', () => {
    const slots = defaultTacticSlots(f)
    expect(phaseSlots(slots, 'oop').map(({ row, col, roleId }) => [row, col, roleId]))
      .toEqual(slots.map(({ row, col, roleId }) => [row, col, roleId]))
  })

  it('déplacer un poste sans ballon ne change pas la disposition avec ballon', () => {
    const slots = withMrOutOfPossession()
    const moved = slots.find((s) => s.slotId === amr().slotId)!
    expect(positionAt(moved.row, moved.col)).toBe('AMR')
    expect(positionAt(moved.oop.row, moved.oop.col)).toBe('MR')
    expect(layoutName(phaseSlots(slots, 'ip')).shape).toBe(layoutName(defaultTacticSlots(f)).shape)
    expect(copyInPossession(slots).find((s) => s.slotId === moved.slotId)!.oop.row).toBe(moved.row)
  })

  it('modifie le rôle d\'une seule phase', () => {
    const slots = patchShape(defaultTacticSlots(f), 'oop', amr().slotId, { roleId: 'fm-winger', duty: 'defend' })
    const s = slots.find((x) => x.slotId === amr().slotId)!
    expect(s.oop.roleId).toBe('fm-winger')
    expect(s.oop.duty).toBe('defend')
    expect(s.roleId).toBe(amr().roleId)
  })

  it('anciennes tactiques : la phase sans ballon reprend la phase avec ballon', () => {
    const legacy = defaultTacticSlots(f).map(({ oop: _oop, ...s }) => s)
    const slots = normalizeTacticSlots(legacy, f.id)
    expect(slots.every((s) => s.oop.row === s.row && s.oop.col === s.col && s.oop.roleId === s.roleId)).toBe(true)
  })

  it('le meilleur XI tient compte des deux phases', () => {
    const squad = [player('Ailier', { AMR: 20 }, level(16)), player('Polyvalent', { AMR: 20, MR: 20 }, level(15))]
    const starterAt = (slots: ReturnType<typeof defaultTacticSlots>, phase: 'ip' | 'oop' = 'ip') =>
      computeLineup(slots, squad, DEFAULT_ROLES, [], phase).slots.find((s) => s.tacticSlot.slotId === amr().slotId)!
    expect(starterAt(defaultTacticSlots(f)).starter?.player.name).toBe('Ailier')
    const slots = withMrOutOfPossession()
    expect(starterAt(slots).starter?.player.name).toBe('Polyvalent')
    // La vue sans ballon affiche le poste MD et la note à ce poste.
    const oop = starterAt(slots, 'oop')
    expect(oop.slot.position).toBe('MR')
    expect(oop.starter!.rating.familiarityFactor).toBe(1)
  })
})
