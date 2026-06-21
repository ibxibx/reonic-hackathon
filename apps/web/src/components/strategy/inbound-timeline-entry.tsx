'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Table } from '@/types';
import { Inbox } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Inbound = Table<'inbound_messages'>;

const CATEGORY_STYLES: Record<string, string> = {
  interested: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  objection: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  ghost_risk: 'bg-red-500/15 text-red-400 border-red-500/30',
  ready_to_close: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

/**
 * A customer reply rendered inside the outreach timeline. Visually distinct
 * from installer outbound steps (customer-side accent, "Customer reply" label,
 * category badge) so the back-and-forth reads clearly in sequence.
 */
export function InboundTimelineEntry({
  inbound,
  isLast,
}: {
  inbound: Inbound;
  isLast: boolean;
}) {
  const { t } = useTranslation('pages');
  const catStyle = CATEGORY_STYLES[inbound.category];
  const catLabel = t(`strategy.category.${inbound.category}`, {
    defaultValue: inbound.category,
  });

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
          <Inbox className="size-4" />
        </div>
        {!isLast ? <div className="my-1 w-px flex-1 bg-border" /> : null}
      </div>

      <Card className="mb-6 flex-1 border-primary/30 bg-primary/5">
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium text-primary">
              {t('strategy.customerReply')}
            </span>
            {catStyle ? (
              <Badge variant="outline" className={catStyle}>
                {catLabel}
              </Badge>
            ) : (
              <Badge variant="outline">{inbound.category}</Badge>
            )}
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {inbound.body}
          </p>

          {inbound.reasoning ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">{t('strategy.categorizedBecause')}</span>
              {inbound.reasoning}
            </p>
          ) : null}

          {inbound.suggested_next_step ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">{t('strategy.suggestedNextStep')}</span>
              {inbound.suggested_next_step}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
