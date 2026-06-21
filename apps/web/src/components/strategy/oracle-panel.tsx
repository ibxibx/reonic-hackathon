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
import type { MessageChannel } from '@/lib/solar';
import type { Table } from '@/types';
import { BrainCircuit, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

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

function ScoreGauge({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative size-28">
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
    </div>
  );
}

export function OraclePanel({
  leadId,
  prediction,
}: {
  leadId: string;
  prediction: Prediction | null;
}) {
  const router = useRouter();
  const { t } = useTranslation('pages');
  const { execute, status } = useAction(generateOracleAction, {
    onSuccess: () => {
      toast.success(prediction ? t('oracle.refreshed') : t('oracle.ready'));
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t('oracle.failed'));
    },
  });

  const isGenerating = status === 'executing';
  const channel = prediction
    ? getRecommendedChannel(prediction.recommended_action)
    : null;
  const actionHref = channel
    ? `/leads/${leadId}/strategy#timeline-step-${channel}`
    : `/leads/${leadId}/strategy#outreach-timeline`;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="size-5 text-primary" />
            {t('oracle.title')}
          </CardTitle>
          <CardDescription>
            {t('oracle.description')}
          </CardDescription>
        </div>
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
            ? t('oracle.reading')
            : prediction
              ? t('oracle.refresh')
              : t('oracle.run')}
        </Button>
      </CardHeader>
      <CardContent>
        {prediction ? (
          <div className="grid gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
            <div className="flex justify-center gap-5 sm:gap-8">
              <ScoreGauge
                label={t('oracle.likelyToSign')}
                value={Math.round(Number(prediction.sign_prob))}
                color="hsl(var(--chart-2))"
              />
              <ScoreGauge
                label={t('oracle.ghostRisk')}
                value={Math.round(Number(prediction.ghost_risk))}
                color="hsl(var(--destructive))"
              />
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{t('oracle.predictedBlocker')}</span>
                  <Badge variant="secondary" className="font-mono">
                    {prediction.predicted_code ?? t('oracle.uncoded')}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {prediction.evidence}
                </p>
              </div>

              <div className="rounded-lg border bg-background/70 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('oracle.oneAction')}
                </p>
                <p className="mt-1 text-sm font-medium leading-relaxed">
                  {prediction.recommended_action}
                </p>
                <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0">
                  <Link href={actionHref}>
                    {channel ? t('oracle.jumpToStep', { channel }) : t('oracle.openTimeline')}
                    <ChevronRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-background/50 p-5 text-sm text-muted-foreground">
            {t('oracle.emptyState')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
