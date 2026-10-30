import { attrTier, type AttrTier } from '@/domain/attrThresholds'
import { lineOf } from '@/domain/lineup'
import { getAttrThresholds } from '@/lib/attrThresholds'
import type { Position } from '@/domain/positions'
import type { PlayerStatus } from '@/domain/types'

/** Couleurs partagées de l'appli : notes, attributs, familiarité, statuts, poids des rôles. */

/** Couleur d'une note sur 100 : élite (88+), très bon (75+), correct (60+), moyen (45+), faible. */
export function scoreColor(score: number): string {
  if (score >= 88) return 'bg-cyan-400/20 text-cyan-200 ring-cyan-400/50'
  if (score >= 75) return 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
  if (score >= 60) return 'bg-lime-500/15 text-lime-300 ring-lime-500/40'
  if (score >= 45) return 'bg-amber-500/15 text-amber-300 ring-amber-500/40'
  return 'bg-rose-500/15 text-rose-300 ring-rose-500/40'
}

/** Seule la couleur du texte d'une note (pour les chiffres sans fond). */
export function scoreText(score: number): string {
  return scoreColor(score).split(' ').find((c) => c.startsWith('text-')) ?? ''
}

/** Note sur fond plein (cartes du terrain) : plus lisible sur une photo ou un fond coloré. */
export function scoreSolid(score: number): string {
  if (score >= 88) return 'bg-cyan-400 text-cyan-950 ring-cyan-300'
  if (score >= 75) return 'bg-emerald-500 text-emerald-950 ring-emerald-400'
  if (score >= 60) return 'bg-lime-400 text-lime-950 ring-lime-300'
  if (score >= 45) return 'bg-amber-400 text-amber-950 ring-amber-300'
  return 'bg-rose-500 text-white ring-rose-400'
}

/** Couleurs d'une ligne du terrain (comme dans FM) : gardien, défense, milieu, attaque. */
export type LineColorKey = 'goalkeeper' | 'defence' | 'midfield' | 'attack'

export const LINE_COLORS: Record<LineColorKey, { bar: string; chip: string; soft: string; accent: string }> = {
  goalkeeper: { bar: 'bg-amber-500 text-amber-950', chip: 'bg-amber-500 text-amber-950', soft: 'bg-amber-500/15 text-amber-200', accent: 'border-t-amber-400' },
  defence: { bar: 'bg-sky-600 text-white', chip: 'bg-sky-600 text-white', soft: 'bg-sky-500/15 text-sky-200', accent: 'border-t-sky-400' },
  midfield: { bar: 'bg-emerald-600 text-white', chip: 'bg-emerald-600 text-white', soft: 'bg-emerald-500/15 text-emerald-200', accent: 'border-t-emerald-400' },
  attack: { bar: 'bg-rose-600 text-white', chip: 'bg-rose-600 text-white', soft: 'bg-rose-500/15 text-rose-200', accent: 'border-t-rose-400' },
}

/** Couleur de ligne d'un poste (le gardien a la sienne). */
export function lineColorOf(position: Position): LineColorKey {
  return position === 'GK' ? 'goalkeeper' : lineOf(position)
}

/** Bordure gauche d'une carte selon la note du titulaire. */
export function scoreBorder(score: number): string {
  if (score >= 88) return 'border-l-cyan-400'
  if (score >= 75) return 'border-l-emerald-500'
  if (score >= 60) return 'border-l-lime-500'
  if (score >= 45) return 'border-l-amber-500'
  return 'border-l-rose-500'
}

/** Classe de couleur d'un niveau d'attribut (les seuils se règlent dans Settings). */
export const ATTR_TIER_COLORS: Record<AttrTier, string> = {
  excellent: 'text-emerald-400',
  good: 'text-lime-400',
  average: 'text-amber-300',
  poor: 'text-rose-400',
}

export function attrColor(v: number | undefined): string {
  if (v === undefined) return 'text-slate-600'
  return ATTR_TIER_COLORS[attrTier(v, getAttrThresholds())]
}

/** Couleur d'un niveau de familiarité au poste (1-20, absent = jamais joué). */
export function familiarityColor(v: number | undefined): string {
  if (!v) return 'text-rose-400'
  if (v >= 20) return 'text-emerald-400'
  if (v >= 17) return 'text-lime-400'
  if (v >= 14) return 'text-amber-300'
  return 'text-orange-400'
}

/** Pastille pleine d'un poste sur le mini-terrain de la fiche joueur (absent = poste non joué). */
export function familiaritySolid(v: number | undefined): string {
  if (!v) return 'bg-black/25 text-white/35 ring-1 ring-white/10'
  if (v >= 20) return 'bg-emerald-500 text-emerald-950 ring-2 ring-emerald-300/60 shadow-md shadow-emerald-500/30'
  if (v >= 17) return 'bg-lime-400 text-lime-950 shadow-md'
  if (v >= 14) return 'bg-amber-400 text-amber-950 shadow-md'
  return 'bg-orange-500 text-orange-950 shadow-md'
}

/** Fond d'un poste dans le sélecteur de postes, selon la familiarité. */
export function familiarityFill(v: number | undefined): string {
  if (!v) return 'border-slate-700 bg-slate-900/80 text-slate-500 hover:border-slate-500'
  if (v >= 20) return 'border-emerald-500 bg-emerald-500/25 text-emerald-100'
  if (v >= 17) return 'border-lime-500/80 bg-lime-500/15 text-lime-100'
  if (v >= 14) return 'border-amber-400/80 bg-amber-400/15 text-amber-100'
  return 'border-orange-500/70 bg-orange-500/10 text-orange-100'
}

export const STATUS_STYLES: Record<PlayerStatus, string> = {
  key: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  rotation: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  prospect: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  for_sale: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  unavailable: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
}

/** Joueur prêté (hors effectif). */
export const LOAN_STYLE = 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30'

/** Bouton de poids d'attribut dans l'écran Rôles (×5 / ×3 / ×1 / ×0). */
export function weightStyle(weight: number): string {
  // teintes franches pour repérer d'un coup d'œil : essentiel (ambre) > clé (vert) > préféré (bleu) > non compté (effacé)
  if (!weight) return 'border-transparent text-slate-600 hover:border-slate-700 hover:text-slate-400'
  if (weight >= 5) return 'border-amber-400 bg-amber-400/30 font-semibold text-amber-50 shadow-[inset_3px_0_0_var(--color-amber-400)]'
  if (weight >= 3) return 'border-emerald-500/70 bg-emerald-500/20 font-medium text-emerald-100 shadow-[inset_3px_0_0_var(--color-emerald-500)]'
  return 'border-sky-800/70 bg-sky-900/20 text-sky-300'
}
