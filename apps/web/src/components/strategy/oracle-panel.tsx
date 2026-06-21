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
  RefreshCw,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
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

/** Safely parse the jsonb `factors` column into OracleFactor[] (empty on failure). */
function parseFactors(raw: Prediction['factors']): OracleFactor[] {
  if (!raw) return [];
  try {
    const arr = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => f && typeof f === 'object' && typeof f.feature === 'string')
      .map((f) => ({
        feature: String(f.feature),
        direction: f.direction === 'decreases' ? 'decreases' : 'increases',
        weight: Number.isFinite(f.weight) ? Number(f.weight) : 0,
        target: f.target === 'ghost' ? 'ghost' : 'sign',
        plainText:
          typeof f.plainText === 'string' && f.plainText.length > 0
            ? f.plainText
            : `${f.feature} ${f.direction ?? 'affects'} ${f.target ?? 'outcome'}`,
      })) as OracleFactor[];
  } catch {
    return [];
  }
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

/** Tiny trend chart of sign_prob + ghost_risk over prediction history. */
function TrendSparkline({ history }: { history: Prediction[] }) {
  const data = history.map((p, i) => ({
    i,
    sign: clamp0to100(Math.round(Number(p.sign_prob))),
    ghost: clamp0to100(Math.round(Number(p.ghost_risk))),
  }));
  return (
    <div className="h-20 w-full" aria-label="Sign and ghost probability trend over time" role="img">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="i" hide />
          <YAxis domain={[0, 100]} hide />
          <Tooltip
            cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
            contentStyle={{ fontSize: 11 }}
            formatter={(v: number, name: string) => [`${v}%`, name === 'sign' ? 'Sign' : 'Ghost']}
            labelFormatter={() => ''}
          />
          <Line
            type="monotone"
            dataKey="sign"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="ghost"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
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
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-primary" />
            The Oracle
          </CardTitle>
          <CardDescription>
            A calibrated close-risk signal and the one best next move.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {prediction ? (
            <Badge
              variant="outline"
              className={
                calibrated
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700'
              }
              aria-label={calibrated ? 'Calibrated model' : 'Uncalibrated model'}
            >
              {calibrated ? (
                <BadgeCheck className="mr-1 size-3.5" aria-hidden />
              ) : (
                <ShieldAlert className="mr-1 size-3.5" aria-hidden />
              )}
              {calibrated ? 'Calibrated' : 'Uncalibrated'}
            </Badge>
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

            <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
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
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Top drivers
                    </p>
                    <ul className="space-y-1">
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
          <div className="rounded-lg border border-dashed bg-background/50 p-5 text-sm text-muted-foreground">
            Run the Oracle to identify the most likely blocker and the next
            outreach move for this lead.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
