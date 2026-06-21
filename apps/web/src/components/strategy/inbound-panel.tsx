'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { processInboundAction } from '@/data/user/inbound';
import { Inbox } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

const CATEGORY_STYLES: Record<string, string> = {
  interested: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  objection: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ghost_risk: 'bg-red-500/15 text-red-400 border-red-500/30',
  ready_to_close: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

type LatestInbound = {
  body: string;
  category: string;
  confidence: number | null;
  reasoning: string | null;
  suggested_next_step: string | null;
} | null;

export function InboundPanel({
  leadId,
  latestInbound,
}: {
  leadId: string;
  latestInbound: LatestInbound;
}) {
  const router = useRouter();
  const { t } = useTranslation('pages');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<LatestInbound>(latestInbound);
  const [rewritten, setRewritten] = useState<number | null>(null);

  const { execute, status } = useAction(processInboundAction, {
    onSuccess: ({ data }) => {
      if (data) {
        setResult({
          body,
          category: data.category,
          confidence: data.confidence,
          reasoning: data.reasoning,
          suggested_next_step: data.suggestedNextStep,
        });
        setRewritten(data.rewritten ?? 0);
        const categoryLabel = t(`strategy.category.${data.category}`, {
          defaultValue: data.category,
        });
        toast.success(
          data.rewritten
            ? t('inbound.toastRewritten', {
                category: categoryLabel,
                count: data.rewritten,
              })
            : t('inbound.toastCategorized', { category: categoryLabel }),
        );
        setBody('');
        router.refresh();
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t('inbound.processFailed'));
    },
  });

  const isProcessing = status === 'executing';
  const catStyle = result ? CATEGORY_STYLES[result.category] : null;
  const catLabel = result
    ? t(`strategy.category.${result.category}`, { defaultValue: result.category })
    : null;

  return (
    <div className="rounded-xl border bg-card p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Inbox className="size-5 text-muted-foreground" />
        <div>
          <h2 className="font-semibold">{t('inbound.title')}</h2>
          <p className="text-xs text-muted-foreground">
            {t('inbound.description')}
          </p>
        </div>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder={t('inbound.placeholder')}
        disabled={isProcessing}
        className="resize-y text-sm"
      />

      <Button
        size="sm"
        disabled={isProcessing || body.trim().length === 0}
        onClick={() => execute({ leadId, body: body.trim() })}
      >
        {isProcessing ? t('inbound.processing') : t('inbound.process')}
      </Button>

      {result ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('inbound.categorizedAs')}</span>
            {catStyle ? (
              <Badge variant="outline" className={catStyle}>
                {catLabel}
              </Badge>
            ) : (
              <Badge variant="outline">{result.category}</Badge>
            )}
            {result.confidence !== null ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('inbound.confidenceShort', { pct: Math.round(Number(result.confidence) * 100) })}
              </span>
            ) : null}
          </div>
          {result.reasoning ? (
            <p className="text-sm">
              <span className="text-muted-foreground">{t('inbound.why')}</span>
              {result.reasoning}
            </p>
          ) : null}
          {result.suggested_next_step ? (
            <p className="text-sm">
              <span className="text-muted-foreground">{t('inbound.suggestedNextStep')}</span>
              {result.suggested_next_step}
            </p>
          ) : null}
          {rewritten && rewritten > 0 ? (
            <p className="text-sm font-medium text-primary">
              {t(rewritten === 1 ? 'inbound.updatedOne' : 'inbound.updatedOther', { count: rewritten })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
