'use client';

import { TimelineStep } from '@/components/strategy/timeline-step';
import { InboundTimelineEntry } from '@/components/strategy/inbound-timeline-entry';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Table } from '@/types';
import { Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Message = Table<'messages'>;
type Inbound = Table<'inbound_messages'>;

// A unified timeline entry — either an outbound step or an inbound reply.
type TimelineEntry =
  | { kind: 'outbound'; sortKey: number; data: Message }
  | { kind: 'inbound'; sortKey: number; data: Inbound };

/**
 * Merge outbound steps and inbound replies into one chronological timeline.
 * - A sent outbound message is placed at its sent_at time.
 * - An inbound reply is placed at its created_at time (so it lands AFTER the
 *   message it replied to).
 * - An unsent outbound message keeps its planned sequence_order at the end,
 *   after everything that has actually happened.
 */
function buildTimeline(
  messages: Message[],
  inbound: Inbound[]
): TimelineEntry[] {
  const FUTURE = Number.MAX_SAFE_INTEGER;

  const outboundEntries: TimelineEntry[] = messages.map((m) => ({
    kind: 'outbound' as const,
    // sent messages sort by sent_at; unsent ones sit at the end in plan order
    sortKey: m.sent_at
      ? new Date(m.sent_at).getTime()
      : FUTURE - (1000 - m.sequence_order),
    data: m,
  }));

  const inboundEntries: TimelineEntry[] = inbound.map((r) => ({
    kind: 'inbound' as const,
    sortKey: new Date(r.created_at).getTime(),
    data: r,
  }));

  return [...outboundEntries, ...inboundEntries].sort(
    (a, b) => a.sortKey - b.sortKey
  );
}

export function StrategyTimeline({
  messages,
  inbound,
  voiceSignedUrl,
}: {
  messages: Array<Message>;
  inbound: Array<Inbound>;
  voiceSignedUrl: string | null;
}) {
  const { t } = useTranslation('pages');
  const entries = buildTimeline(messages, inbound);

  return (
    <Card id="outreach-timeline">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          <CardTitle>{t('strategy.timelineTitle')}</CardTitle>
        </div>
        <CardDescription>
          {t('strategy.timelineDescription')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('strategy.noMessages')}
          </p>
        ) : (
          <div>
            {entries.map((entry, i) => {
              const isLast = i === entries.length - 1;
              if (entry.kind === 'inbound') {
                return (
                  <InboundTimelineEntry
                    key={`inbound-${entry.data.id}`}
                    inbound={entry.data}
                    isLast={isLast}
                  />
                );
              }
              return (
                <div
                  id={`timeline-step-${entry.data.channel_type}`}
                  key={entry.data.id}
                >
                  <TimelineStep
                    message={entry.data}
                    isLast={isLast}
                    voiceSignedUrl={
                      entry.data.channel_type === 'voice'
                        ? voiceSignedUrl
                        : null
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
