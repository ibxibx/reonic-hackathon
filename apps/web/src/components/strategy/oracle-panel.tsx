'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tooltip as InfoTooltip,
  TooltipContent as InfoTooltipContent,
  TooltipProvider as InfoTooltipProvider,
  TooltipTrigger as InfoTooltipTrigger,
} from '@/components/ui/tooltip';
import { generateOracleAction } from '@/data/user/oracle';
import { BLOCKER_TAXONOMY } from '@/lib/ai/blocker-taxonomy';
import type { BlockerCode, OracleFactor } from '@/lib/oracle/contracts';
import type { MessageChannel } from '@/lib/solar';
import type { Table } from '@/types';
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  BrainCircuit,
  ChevronRight,
  Info,
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { getGhostProvenance } from './oracle-provenance';

type Prediction = Table<'predictions'>;

const channelPatterns: Array<[MessageChannel, RegExp]> = [
  ['voice', /voice(?:\s|-)?note/i],
  ['email', /email/i],
  ['sms', /sms|text message|text\b/i],
  ['call', /phone call|\bcall\b/i],
];

function getRecommendedChannel(action: string): MessageChannel | null {
  return channelPatterns.find(([, pattern]) => pattern.test(action))?.[0] ?? null;
}

/** Clamp a value into [0,100], scrubbing non-finite inputs to 0. */
function clamp0to100(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

/**
 * Safely parse the jsonb `factors` column into OracleFactor[].
 *
 * Fully defensive: tolerates null/objects/strings/garbage and NEVER throws —
 * any malformed shape (bad JSON, non-array, non-object rows, a row whose getters
 * throw) is dropped and the function returns whatever valid rows remain ([] in
 * the worst case). The panel relies on this so a corrupt jsonb blob renders as
 * "no drivers" instead of crashing the lead detail page.
 */
function parseFactors(raw: Prediction['factors']): OracleFactor[] {
  if (raw == null) return [];
  let arr: unknown;
  try {
    arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  const out: OracleFactor[] = [];
  for (const item of arr) {
    try {
      if (!item || typeof item !== 'object') continue;
      const f = item as Record<string, unknown>;
      if (typeof f.feature !== 'string' || f.feature.length === 0) continue;
      const direction: OracleFactor['direction'] =
        f.direction === 'decreases' ? 'decreases' : 'increases';
      const target: OracleFactor['target'] =
        f.target === 'ghost' ? 'ghost' : 'sign';
      const weight =
        typeof f.weight === 'number' && Number.isFinite(f.weight)
          ? f.weight
          : 0;
      const plainText =
        typeof f.plainText === 'string' && f.plainText.length > 0
          ? f.plainText
          : `${f.feature} ${direction} ${target}`;
      out.push({ feature: f.feature, direction, weight, target, plainText });
    } catch {
      // A single bad row never poisons the rest of the list.
      continue;
    }
  }
  return out;
}

function ScoreGauge({
  label,
  value,
  color,
  band,
}: {
  label: string;
  value: number;
  color: string;
  band?: { low: number; high: number } | null;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="relative size-28"
        role="img"
        aria-label={`${label}: ${value} percent${
          band ? `, confidence range ${band.low} to ${band.high} percent` : ''
        }`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            data={[{ value, fill: color }]}
            startAngle={90}
            endAngle={-270}
            innerRadius="72%"
            outerRadius="100%"
            barSize={10}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" background cornerRadius={8} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-semibold tabular-nums">{value}%</span>
        </div>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
      {band ? (
        <span className="text-[10px] tabular-nums text-muted-foreground/80">
          {band.low}–{band.high}%
        </span>
      ) : null}
    </div>
  );
}

/** One driver row: arrow by direction, tinted by whether it helps or hurts. */
function FactorRow({ factor }: { factor: OracleFactor }) {
  // For the sign target, "increases" is good (green); for ghost, "increases" is
  // bad (red). Decreases flips each.
  const helpsClose =
    factor.target === 'sign'
      ? factor.direction === 'increases'
      : factor.direction === 'decreases';
  const Arrow = factor.direction === 'increases' ? ArrowUp : ArrowDown;
  const tone = helpsClose ? 'text-emerald-600' : 'text-destructive';
  return (
    <li className="flex items-start gap-2 text-xs">
      <Arrow className={`mt-0.5 size-3.5 shrink-0 ${tone}`} aria-hidden />
      <span className="leading-snug text-muted-foreground">
        {factor.plainText}
      </span>
    </li>
  );
}

/** Tiny color-keyed legend so the two sparkline series are distinguishable. */
function SparklineLegend() {
  return (
    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-0.5 w-3 rounded-full"
          style={{ backgroundColor: 'hsl(var(--chart-2))' }}
          aria-hidden
        />
        Sign
      </span>
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-block h-0.5 w-3 rounded-full"
          style={{ backgroundColor: 'hsl(var(--destructive))' }}
          aria-hidden
        />
        Ghost
      </span>
    </div>
  );
}

/**
 * Trend chart of sign_prob + ghost_risk over prediction history. Readability:
 * a 0/50/100 gridline frame, a highlighted dot on the most recent point of each
 * series, and a hover tooltip. The screen-reader summary states the latest
 * values + direction so the chart is not purely visual.
 */
function TrendSparkline({ history }: { history: Prediction[] }) {
  const data = history.map((p, i) => ({
    i,
    sign: clamp0to100(Math.round(Number(p.sign_prob))),
    ghost: clamp0to100(Math.round(Number(p.ghost_risk))),
  }));

  const first = data[0];
  const last = data[data.length - 1];
  const trendWord = (from: number, to: number) =>
    to > from ? 'up' : to < from ? 'down' : 'flat';
  const a11ySummary =
    first && last
      ? `Trend over ${data.length} snapshots. Sign probability ${trendWord(
          first.sign,
          last.sign
        )} to ${last.sign} percent; ghost risk ${trendWord(
          first.ghost,
          last.ghost
        )} to ${last.ghost} percent.`
      : 'Sign and ghost probability trend over time.';

  return (
    <div className="space-y-1.5">
      <div className="h-24 w-full" aria-label={a11ySummary} role="img">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 6, right: 6, bottom: 0, left: 6 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="hsl(var(--border))"
              strokeOpacity={0.5}
              strokeDasharray="2 4"
            />
            <XAxis dataKey="i" hide />
            <YAxis domain={[0, 100]} ticks={[0, 50, 100]} hide />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
              contentStyle={{ fontSize: 11 }}
              formatter={(v: number, name: string) => [
                `${v}%`,
                name === 'sign' ? 'Sign' : 'Ghost',
              ]}
              labelFormatter={(i: number) => `Snapshot ${Number(i) + 1}`}
            />
            <Line
              type="monotone"
              dataKey="sign"
              name="sign"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="ghost"
              name="ghost"
              stroke="hsl(var(--destructive))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <SparklineLegend />
    </div>
  );
}

export function OraclePanel({
  leadId,
  prediction,
  predictions = [],
}: {
  leadId: string;
  prediction: Prediction | null;
  predictions?: Prediction[];
}) {
  const router = useRouter();
  const { execute, status } = useAction(generateOracleAction, {
    onSuccess: () => {
      toast.success(prediction ? 'Oracle refreshed' : 'Oracle prediction ready');
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Could not generate Oracle prediction');
    },
  });

  const isGenerating = status === 'executing';

  const channel = prediction
    ? getRecommendedChannel(prediction.recommended_action)
    : null;
  const actionHref = channel
    ? `/leads/${leadId}/strategy#timeline-step-${channel}`
    : `/leads/${leadId}/strategy#outreach-timeline`;

  // ── Derived display values (guarded) ──────────────────────────────────────
  const signValue = prediction
    ? clamp0to100(Math.round(Number(prediction.sign_prob)))
    : 0;
  const ghostValue = prediction
    ? clamp0to100(Math.round(Number(prediction.ghost_risk)))
    : 0;

  const signHalf = prediction ? Number(prediction.sign_confidence ?? 0) / 2 : 0;
  const ghostHalf = prediction ? Number(prediction.ghost_confidence ?? 0) / 2 : 0;
  const signBand =
    prediction && Number.isFinite(signHalf) && signHalf > 0
      ? {
          low: clamp0to100(Math.round(signValue - signHalf)),
          high: clamp0to100(Math.round(signValue + signHalf)),
        }
      : null;
  const ghostBand =
    prediction && Number.isFinite(ghostHalf) && ghostHalf > 0
      ? {
          low: clamp0to100(Math.round(ghostValue - ghostHalf)),
          high: clamp0to100(Math.round(ghostValue + ghostHalf)),
        }
      : null;

  const calibrated = prediction?.calibrated === true;
  const modeLabel = prediction?.mode ?? null;

  // Honest ghost provenance: when uncalibrated, the ghost number is blended with
  // real-world churn benchmarks (a cross-domain prior, not measured solar data).
  const ghostProvenance = prediction
    ? getGhostProvenance(prediction.calibrated, prediction.mode)
    : null;

  const rawCode = prediction?.blocker_code ?? prediction?.predicted_code ?? null;
  const blockerCode = rawCode as BlockerCode | null;
  const blockerName =
    blockerCode && BLOCKER_TAXONOMY[blockerCode]
      ? BLOCKER_TAXONOMY[blockerCode].name
      : null;

  const factors = prediction ? parseFactors(prediction.factors) : [];

  // History (chronological) for the sparkline — needs ≥2 points to render.
  const history = [...predictions].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
  );
  const showTrend = history.length >= 2;

  return (
    <InfoTooltipProvider delayDuration={150}>
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-primary" />
            The Oracle
          </CardTitle>
          <CardDescription>
            {calibrated
              ? 'A calibrated close-risk signal and the one best next move.'
              : 'A close-risk signal (uncalibrated, grounded in real-world benchmarks) and the one best next move.'}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {prediction ? (
            <InfoTooltip>
              <InfoTooltipTrigger asChild>
                <Badge
                  variant="outline"
                  tabIndex={0}
                  className={`cursor-help ${
                    calibrated
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-700'
                  }`}
                  aria-label={
                    calibrated
                      ? 'Calibrated model. Press for details.'
                      : 'Uncalibrated model. Press for details.'
                  }
                >
                  {calibrated ? (
                    <BadgeCheck className="mr-1 size-3.5" aria-hidden />
                  ) : (
                    <ShieldAlert className="mr-1 size-3.5" aria-hidden />
                  )}
                  {calibrated ? 'Calibrated' : 'Uncalibrated'}
                </Badge>
              </InfoTooltipTrigger>
              <InfoTooltipContent className="max-w-xs text-xs leading-relaxed">
                {calibrated
                  ? 'Fitted and calibrated on real absorbed (signed / ghosted) outcomes.'
                  : 'Not yet calibrated: too few real solar outcomes exist. Numbers are directional and the ghost risk is grounded in real-world churn benchmarks, not measured solar data.'}
              </InfoTooltipContent>
            </InfoTooltip>
          ) : null}
          <Button
            size="sm"
            variant={prediction ? 'outline' : 'default'}
            disabled={isGenerating}
            onClick={() => execute({ leadId })}
          >
            {prediction ? (
              <RefreshCw className="mr-1.5 size-4" />
            ) : (
              <Sparkles className="mr-1.5 size-4" />
            )}
            {isGenerating
              ? 'Reading lead...'
              : prediction
                ? 'Refresh Oracle'
                : 'Run Oracle'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {prediction ? (
          <div className="space-y-5">
            {(modeLabel || prediction.model_version) && (
              <p className="text-[11px] text-muted-foreground">
                {modeLabel ? `${modeLabel} mode` : null}
                {modeLabel && prediction.model_version ? ' · ' : null}
                {prediction.model_version ?? null}
              </p>
            )}

            {modeLabel === 'degraded' ? (
              <div
                role="note"
                className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5 text-[11px] leading-relaxed text-amber-700"
              >
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Degraded mode: no fitted model is available yet, so these
                  estimates are heuristic. Ghost risk is anchored to real-world
                  churn benchmarks; treat the numbers as directional.
                </span>
              </div>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
              <div className="flex flex-col items-center gap-2">
                <div className="flex justify-center gap-5 sm:gap-8">
                  <ScoreGauge
                    label="Likely to sign"
                    value={signValue}
                    color="hsl(var(--chart-2))"
                    band={signBand}
                  />
                  <ScoreGauge
                    label="Ghost risk"
                    value={ghostValue}
                    color="hsl(var(--destructive))"
                    band={ghostBand}
                  />
                </div>
                {ghostProvenance?.blendedWithChurnPrior ? (
                  <InfoTooltip>
                    <InfoTooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex max-w-[16rem] items-center gap-1 rounded text-center text-[10px] leading-tight text-muted-foreground/80 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`${ghostProvenance.caption}. Press for details.`}
                      >
                        <Info className="size-3 shrink-0" aria-hidden />
                        <span>{ghostProvenance.caption}</span>
                      </button>
                    </InfoTooltipTrigger>
                    <InfoTooltipContent className="max-w-xs text-xs leading-relaxed">
                      {ghostProvenance.tooltip}
                    </InfoTooltipContent>
                  </InfoTooltip>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Predicted blocker</span>
                    {blockerName ? (
                      <span className="text-sm text-muted-foreground">
                        {blockerName}
                      </span>
                    ) : null}
                    <Badge
                      variant="secondary"
                      className="font-mono"
                      aria-label={`Blocker code ${blockerCode ?? 'Uncoded'}`}
                    >
                      {blockerCode ?? 'Uncoded'}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {prediction.evidence}
                  </p>
                </div>

                {factors.length > 0 ? (
                  <div className="space-y-1.5">
                    <p
                      id={`oracle-drivers-${leadId}`}
                      className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                    >
                      Top drivers
                    </p>
                    <ul
                      className="space-y-1"
                      aria-labelledby={`oracle-drivers-${leadId}`}
                    >
                      {factors.slice(0, 6).map((f, i) => (
                        <FactorRow key={`${f.target}:${f.feature}:${i}`} factor={f} />
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-lg border bg-background/70 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    One recommended action
                  </p>
                  <p className="mt-1 text-sm font-medium leading-relaxed">
                    {prediction.recommended_action}
                  </p>
                  <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0">
                    <Link href={actionHref}>
                      {channel ? `Jump to ${channel} step` : 'Open outreach timeline'}
                      <ChevronRight className="ml-1 size-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {showTrend ? (
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Trend over {history.length} snapshots
                </p>
                <TrendSparkline history={history} />
              </div>
            ) : null}
          </div>
        ) : (
          <div
            role="status"
            className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-background/50 p-6 text-center"
          >
            <Sparkles className="size-6 text-primary/70" aria-hidden />
            <p className="text-sm font-medium">No prediction yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {isGenerating
                ? 'Reading this lead’s economics, engagement, and timing…'
                : 'Run the Oracle to identify the most likely blocker and the next outreach move for this lead.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
    </InfoTooltipProvider>
  );
}
