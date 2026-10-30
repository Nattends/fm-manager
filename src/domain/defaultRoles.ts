import { FM_ROLE_PREFIX, FM_ROLES } from './fmRoles'
import type { Position } from './positions'
import type { Phase, RoleDefinition } from './types'

/** Rôles par défaut : les rôles FM26/FM27 (fmRoles.ts). */
export const DEFAULT_ROLES: RoleDefinition[] = FM_ROLES

/** Rôle avec ballon proposé par défaut pour chaque poste. */
export const DEFAULT_ROLE_BY_POSITION: Record<Position, string> = {
  GK: 'fm-goalkeeper',
  DL: 'fm-full-back', DC: 'fm-centre-back', DR: 'fm-full-back',
  WBL: 'fm-wing-back', DM: 'fm-defensive-midfielder', WBR: 'fm-wing-back',
  ML: 'fm-wide-midfielder', MC: 'fm-central-midfielder', MR: 'fm-wide-midfielder',
  AML: 'fm-winger', AMC: 'fm-attacking-midfielder', AMR: 'fm-winger',
  ST: 'fm-centre-forward',
}

/** Rôle sans ballon proposé par défaut pour chaque poste. */
export const DEFAULT_OOP_ROLE_BY_POSITION: Record<Position, string> = {
  GK: 'fm-line-holding-keeper',
  DL: 'fm-holding-full-back', DC: 'fm-covering-centre-back', DR: 'fm-holding-full-back',
  WBL: 'fm-holding-wing-back', DM: 'fm-screening-defensive-midfielder', WBR: 'fm-holding-wing-back',
  ML: 'fm-tracking-wide-midfielder', MC: 'fm-screening-central-midfielder', MR: 'fm-tracking-wide-midfielder',
  AML: 'fm-tracking-winger', AMC: 'fm-tracking-attacking-midfielder', AMR: 'fm-tracking-winger',
  ST: 'fm-tracking-centre-forward',
}

/** Rôle par défaut d'un poste dans une phase de jeu. */
export function defaultRoleFor(position: Position, phase: Phase): string {
  return (phase === 'oop' ? DEFAULT_OOP_ROLE_BY_POSITION : DEFAULT_ROLE_BY_POSITION)[position]
}

/** Identifiants des anciens profils du notebook « position score calculator » (retirés). */
const LEGACY_NOTEBOOK_IDS = new Set(['gk', 'fb', 'cb', 'dm', 'vol', 'box2', 'w', 'amrl', 'amc', 'str'])

/** Rôle disparu : ancien profil du notebook ou ancien rôle FM (FM24). */
function isObsoleteRole(role: RoleDefinition, current: Set<string>): boolean {
  return LEGACY_NOTEBOOK_IDS.has(role.id) || (role.id.startsWith(FM_ROLE_PREFIX) && !current.has(role.id))
}

/**
 * Liste de rôles enregistrée, sans les rôles disparus (profils du notebook, rôles FM24).
 * Renvoie null (rôles par défaut) s'il ne reste que des rôles disparus, la liste inchangée s'il n'y en avait pas.
 */
export function cleanStoredRoles(list: RoleDefinition[]): RoleDefinition[] | null {
  const current = new Set(FM_ROLES.map((r) => r.id))
  const kept = list.filter((r) => !isObsoleteRole(r, current))
  if (kept.length === list.length) return list
  return kept.length ? kept : null
}

/** Vrai si la liste de rôles est au format actuel (poids par attribut). */
export function isRoleList(value: unknown): value is RoleDefinition[] {
  return Array.isArray(value) && value.every((r) => r && typeof r === 'object' && 'weights' in r && Array.isArray(r.positions))
}
