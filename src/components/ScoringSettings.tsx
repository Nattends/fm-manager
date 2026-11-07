import { PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { askConfirm } from '@/lib/confirm'
import {
  resetMoneyballSettings, resetRatingSettings, setMoneyballSettings, setRatingSettings, useMoneyballSettings, useRatingSettings,
} from '@/lib/scoringParams'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Panel } from '@/components/layout'
import {
  DEFAULT_MONEYBALL_PARAMS, OUTPUT_GROUPS, OUTPUT_STATS, type FeeParams, type MoneyballParams, type MoneyballWeights, type OutputGroup, type OutputStat,
} from '@/domain/moneyball'
import { DEFAULT_RATING_PARAMS } from '@/domain/rating'
import { useI18n } from '@/i18n'

const fmt = (v: number) => String(Math.round(v * 1000) / 1000)

/**
 * Champ numérique : le texte saisi reste tel quel pendant la frappe (« 0, » ou « - » ne sont pas encore des nombres),
 * chaque nombre valide est appliqué aussitôt ; en quittant le champ, il affiche la valeur retenue.
 */
function NumberField({ value, onChange, def, className, placeholder }: {
  value: number | undefined
  onChange: (v: number | undefined) => void
  /** Valeur par défaut : le champ est surligné quand il s'en écarte. */
  def?: number
  className?: string
  placeholder?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const changed = def !== undefined && value !== def
  return (
    <Input inputMode="decimal" placeholder={placeholder}
      className={cn('h-8 w-24 tabular-nums', changed && 'border-amber-400/70 bg-amber-400/10 text-amber-100', className)}
      value={draft ?? (value === undefined ? '' : fmt(value))}
      onFocus={(e) => e.target.select()}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      onChange={(e) => {
        setDraft(e.target.value)
        const s = e.target.value.trim().replace(',', '.')
        if (s === '') onChange(undefined)
        else if (Number.isFinite(Number(s))) onChange(Number(s))
      }} />
  )
}

/** Ligne de réglage : libellé et explication à gauche, champ et valeur par défaut à droite. */
function ParamRow({ label, help, def, children }: { label: string; help?: string; def?: string; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-t border-border/60 py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm text-slate-200">{label}</div>
        {help && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{help}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {def !== undefined && <span className="w-20 text-[11px] text-muted-foreground">{t.scoring.defaultValue(def)}</span>}
      </div>
    </div>
  )
}

/** Titre et méthode d'une partie du calcul. */
function Section({ title, method, children }: { title: string; method?: string; children: ReactNode }) {
  return (
    <div className="mt-5 first:mt-0">
      <h3 className="text-sm font-semibold text-emerald-300">{title}</h3>
      {method && <p className="mt-1 mb-1 text-[13px] leading-relaxed text-slate-400">{method}</p>}
      <div>{children}</div>
    </div>
  )
}

/** Points d'une courbe (x → y), modifiables ; triés à l'enregistrement. */
function CurveEditor({ points, def, xLabel, yLabel, onChange }: {
  points: [number, number][]
  def: [number, number][]
  xLabel: string
  yLabel: string
  onChange: (next: [number, number][]) => void
}) {
  const { t } = useI18n()
  // ordre de saisie gardé pendant l'édition (sinon la ligne en cours bougerait en changeant son abscisse)
  const [rows, setRows] = useState(points)
  const commit = (next: [number, number][]) => {
    setRows(next)
    onChange(next)
  }
  const defY = (x: number) => def.find((p) => p[0] === x)?.[1]
  return (
    <div className="mt-2">
      <div className="grid grid-cols-[6.5rem_6.5rem_auto] gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        <span>{xLabel}</span><span>{yLabel}</span><span />
        {rows.map(([x, y], i) => (
          <div key={i} className="contents">
            <NumberField value={x} className="w-26" onChange={(v) => v !== undefined && commit(rows.map((p, j) => (j === i ? [v, p[1]] : p)))} />
            <NumberField value={y} def={defY(x)} className="w-26" onChange={(v) => v !== undefined && commit(rows.map((p, j) => (j === i ? [p[0], v] : p)))} />
            <Button variant="ghost" size="icon-sm" title={t.scoring.removePoint} aria-label={t.scoring.removePoint} disabled={rows.length <= 2}
              onClick={() => commit(rows.filter((_, j) => j !== i))}>
              <XIcon />
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" className="mt-1" onClick={() => {
        const [x, y] = rows[rows.length - 1] ?? [0, 0]
        commit([...rows, [x + 1, y]])
      }}>
        <PlusIcon />{t.scoring.addPoint}
      </Button>
    </div>
  )
}

/** Bornes des tranches d'âge, saisies séparées par des virgules. */
function BandsField({ value, def, onChange }: { value: number[]; def: number[]; onChange: (v: number[]) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = (v: number[]) => v.join(', ')
  return (
    <Input className={cn('h-8 w-48 tabular-nums', text(value) !== text(def) && 'border-amber-400/70 bg-amber-400/10 text-amber-100')}
      value={draft ?? text(value)}
      onBlur={() => {
        if (draft !== null) onChange(draft.split(/[,;\s]+/).filter(Boolean).map(Number).filter(Number.isFinite))
        setDraft(null)
      }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      onChange={(e) => setDraft(e.target.value)} />
  )
}

function ResetButton({ onReset }: { onReset: () => void }) {
  const { t } = useI18n()
  return (
    <Button variant="outline" size="sm" onClick={async () => { if (await askConfirm(t.scoring.resetConfirm)) onReset() }}>
      <RotateCcwIcon />{t.scoring.reset}
    </Button>
  )
}

/** Paramètres de la note des joueurs (toutes les pages). */
export function RatingParamsPanel() {
  const { t } = useI18n()
  const p = useRatingSettings()
  const d = DEFAULT_RATING_PARAMS
  const s = t.scoring.rating
  // remonte les éditeurs de courbe après une remise à zéro (leur ordre de saisie local est oublié)
  const [resets, setResets] = useState(0)
  return (
    <Panel title={s.title} className="col-span-2"
      actions={<ResetButton onReset={() => { resetRatingSettings(); setResets((n) => n + 1) }} />}>
      <p className="mb-3 text-[13px] leading-relaxed text-slate-400">{s.method}</p>
      <ParamRow label={s.otherShare} help={s.otherShareHelp} def={fmt(d.otherShare)}>
        <NumberField value={p.otherShare} def={d.otherShare} onChange={(v) => v !== undefined && setRatingSettings({ ...p, otherShare: v })} />
      </ParamRow>
      <ParamRow label={s.neverPlayed} help={s.neverPlayedHelp} def={fmt(d.neverPlayed)}>
        <NumberField value={p.neverPlayed} def={d.neverPlayed} onChange={(v) => v !== undefined && setRatingSettings({ ...p, neverPlayed: v })} />
      </ParamRow>
      <div className="grid grid-cols-2 gap-6 border-t border-border/60 pt-3">
        <div>
          <div className="text-sm text-slate-200">{s.ratingCurve}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.ratingCurveHelp}</p>
          <CurveEditor key={`r${resets}`} points={p.ratingCurve} def={d.ratingCurve} xLabel={s.average} yLabel={s.score}
            onChange={(ratingCurve) => setRatingSettings({ ...p, ratingCurve })} />
        </div>
        <div>
          <div className="text-sm text-slate-200">{s.familiarityCurve}</div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.familiarityCurveHelp}</p>
          <CurveEditor key={`f${resets}`} points={p.familiarityCurve} def={d.familiarityCurve} xLabel={s.familiarity} yLabel={s.factor}
            onChange={(familiarityCurve) => setRatingSettings({ ...p, familiarityCurve })} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{t.scoring.pointsHint}</p>
    </Panel>
  )
}

/** Réglages du Moneyball : poids, gain, marché, rendement, contrat, niveau des clubs et mode réaliste. */
export function MoneyballParamsPanel() {
  const { t } = useI18n()
  const p = useMoneyballSettings()
  const d = DEFAULT_MONEYBALL_PARAMS
  const s = t.scoring.moneyball
  const set = (patch: Partial<MoneyballParams>) => setMoneyballSettings({ ...p, ...patch })
  /** Champ d'un réglage numérique de premier niveau. */
  const num = (key: 'minGain' | 'depthShare' | 'outputMinMinutes' | 'outputPriorMinutes' | 'outputPointsPerSd' | 'outputCap'
    | 'marketMinGroup' | 'clubTop' | 'clubMinPlayers' | 'reachClubMargin' | 'reachLevelMargin' | 'reachFeeTop' | 'reachWageFactor',
  label: string, help?: string) => (
    <ParamRow label={label} help={help} def={fmt(d[key])}>
      <NumberField value={p[key]} def={d[key]} onChange={(v) => v !== undefined && set({ [key]: v })} />
    </ParamRow>
  )
  const fee = (key: keyof FeeParams, label: string, help: string) => (
    <ParamRow label={label} help={help} def={fmt(d.fee[key])}>
      <NumberField value={p.fee[key]} def={d.fee[key]} onChange={(v) => v !== undefined && set({ fee: { ...p.fee, [key]: v } })} />
    </ParamRow>
  )
  const weight = (key: keyof MoneyballWeights) => (
    <label key={key} className="flex items-center gap-2 text-sm text-slate-300">
      {t.moneyball.col[key]}
      <NumberField value={p.weights[key]} def={d.weights[key]} className="w-20"
        onChange={(v) => v !== undefined && set({ weights: { ...p.weights, [key]: v } })} />
    </label>
  )
  const statWeight = (g: OutputGroup, stat: OutputStat, v: number | undefined) => {
    const group = { ...p.outputWeights[g] }
    if (v === undefined || v <= 0) delete group[stat]
    else group[stat] = v
    set({ outputWeights: { ...p.outputWeights, [g]: group } })
  }

  return (
    <Panel title={s.title} className="col-span-2" actions={<ResetButton onReset={resetMoneyballSettings} />}>
      <p className="mb-3 text-[13px] leading-relaxed text-slate-400">{s.method}</p>

      <Section title={s.weights} method={s.weightsHelp}>
        <div className="flex flex-wrap gap-4 pt-1">{(['gain', 'surplus', 'perf', 'contract'] as const).map(weight)}</div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {(['gain', 'surplus', 'perf', 'contract'] as const).map((k) => `${t.moneyball.col[k]} ${t.scoring.defaultValue(fmt(d.weights[k]))}`).join(' · ')}
        </p>
      </Section>

      <Section title={s.gain} method={s.gainMethod}>
        {num('minGain', s.minGain, s.minGainHelp)}
        {num('depthShare', s.depthShare, s.depthShareHelp)}
      </Section>

      <Section title={s.market} method={s.marketMethod}>
        <ParamRow label={s.ageBands} help={s.ageBandsHelp} def={d.ageBands.join(', ')}>
          <BandsField value={p.ageBands} def={d.ageBands} onChange={(ageBands) => set({ ageBands })} />
        </ParamRow>
        {num('marketMinGroup', s.marketMinGroup, s.marketMinGroupHelp)}
      </Section>

      <Section title={s.output} method={s.outputMethod}>
        {num('outputMinMinutes', s.outputMinMinutes, s.outputMinMinutesHelp)}
        {num('outputPriorMinutes', s.outputPriorMinutes, s.outputPriorMinutesHelp)}
        {num('outputPointsPerSd', s.outputPointsPerSd, s.outputPointsPerSdHelp)}
        {num('outputCap', s.outputCap, s.outputCapHelp)}
        <div className="border-t border-border/60 pt-2.5">
          <div className="text-sm text-slate-200">{s.outputWeights}</div>
          <p className="mt-0.5 mb-2 text-xs leading-relaxed text-muted-foreground">{s.outputWeightsHelp}</p>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th />
                  {OUTPUT_STATS.map((stat) => <th key={stat} className="px-1 pb-1 text-left font-normal">{t.moneyball.stat[stat]}</th>)}
                </tr>
              </thead>
              <tbody>
                {OUTPUT_GROUPS.map((g) => (
                  <tr key={g}>
                    <td className="pr-2 whitespace-nowrap text-slate-300">{s.groups[g]}</td>
                    {OUTPUT_STATS.map((stat) => (
                      <td key={stat} className="px-1 py-0.5">
                        <NumberField value={p.outputWeights[g][stat]} def={d.outputWeights[g][stat]} placeholder="–" className="h-7 w-14"
                          onChange={(v) => statWeight(g, stat, v)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title={s.contract} method={s.contractMethod}>
        {fee('expired', s.feeExpired, s.feeExpiredHelp)}
        {fee('shortDays', s.feeShortDays, s.feeShortDaysHelp)}
        {fee('short', s.feeShort, s.feeShareHelp)}
        {fee('yearDays', s.feeYearDays, s.feeYearDaysHelp)}
        {fee('year', s.feeYear, s.feeShareHelp)}
      </Section>

      <Section title={s.club} method={s.clubMethod}>
        {num('clubTop', s.clubTop)}
        {num('clubMinPlayers', s.clubMinPlayers)}
        {num('reachClubMargin', s.reachClubMargin, s.reachClubMarginHelp)}
        {num('reachLevelMargin', s.reachLevelMargin, s.reachLevelMarginHelp)}
        {num('reachFeeTop', s.reachFeeTop)}
        {num('reachWageFactor', s.reachWageFactor, s.reachWageFactorHelp)}
      </Section>
    </Panel>
  )
}
