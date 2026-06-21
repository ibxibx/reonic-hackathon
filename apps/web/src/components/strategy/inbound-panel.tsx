'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { processInboundAction } from '@/data/user/inbound';
import { Inbox, Mail } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

const CATEGORY_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  interested: {
    label: 'Interested',
    className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  objection: {
    label: 'Objection',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  ghost_risk: {
    label: 'Ghost risk',
    className: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  ready_to_close: {
    label: 'Ready to close',
    className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
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
        toast.success(
          data.rewritten
            ? `Categorized: ${data.category} — ${data.rewritten} messages rewritten`
            : `Reply categorized: ${data.category}`,
        );
        setBody('');
        router.refresh();
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Failed to process reply');
    },
  });

  const isProcessing = status === 'executing';
  const cat = result ? CATEGORY_CONFIG[result.category] : null;

  return (
    <div className="rounded-xl border bg-card p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Inbox className="size-5 text-muted-foreground" />
        <div>
          <h2 className="font-semibold">Inbound reply</h2>
          <p className="text-xs text-muted-foreground">
            Paste a customer reply — the dashboard categorizes it and rewrites
            the upcoming outreach to address their concern.
          </p>
        </div>
      </div>

      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder="e.g. Thanks, but I'm worried the panels won't produce enough in winter…"
        disabled={isProcessing}
        className="resize-y text-sm"
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={isProcessing || body.trim().length === 0}
          onClick={() => execute({ leadId, body: body.trim() })}
        >
          {isProcessing ? 'Processing…' : 'Process reply'}
        </Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled
              className="gap-1.5 border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300"
            >
              <Mail className="size-4" />
              Connect Email MCP
              <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-purple-400">
                Premium
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-80 text-sm space-y-2">
            <p className="font-semibold">Automate inbound with Email MCP</p>
            <p className="text-muted-foreground">
              Connect your mailbox via the Model Context Protocol so incoming
              customer replies are processed automatically — no more
              copy-pasting. Replies are categorized in real time and your
              outreach timeline updates instantly.
            </p>
            <p className="text-xs text-muted-foreground">
              Coming soon — MCP integration is in beta.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      {result ? (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Categorized as</span>
            {cat ? (
              <Badge variant="outline" className={cat.className}>
                {cat.label}
              </Badge>
            ) : (
              <Badge variant="outline">{result.category}</Badge>
            )}
            {result.confidence !== null ? (
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(Number(result.confidence) * 100)}% conf.
              </span>
            ) : null}
          </div>
          {result.reasoning ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Why: </span>
              {result.reasoning}
            </p>
          ) : null}
          {result.suggested_next_step ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Suggested next step: </span>
              {result.suggested_next_step}
            </p>
          ) : null}
          {rewritten && rewritten > 0 ? (
            <p className="text-sm font-medium text-primary">
              ✓ Outreach timeline updated — {rewritten} upcoming{' '}
              {rewritten === 1 ? 'message' : 'messages'} rewritten to address
              this concern.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
