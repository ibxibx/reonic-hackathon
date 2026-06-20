import { PersonaBadge } from '@/components/strategy/persona-badge';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { PERSONA_CONFIG, type Persona } from '@/lib/solar';
import type { Table } from '@/types';
import { Brain } from 'lucide-react';

export function StrategyRationale({
  strategy,
}: {
  strategy: Table<'strategies'>;
}) {
  const confidence = strategy.persona_confidence;
  const personaInfo =
    PERSONA_CONFIG[strategy.persona_detected as Persona] ??
    PERSONA_CONFIG.skeptic;

  return (
    <Card className="lg:sticky lg:top-6">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <CardTitle>AI Reasoning</CardTitle>
        </div>
        <CardDescription>
          Why this strategy was chosen for this homeowner.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Persona detected
            </span>
            <PersonaBadge persona={strategy.persona_detected} />
          </div>
          <p className="text-xs text-muted-foreground">
            {personaInfo.description}
          </p>
          {confidence !== null ? (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Confidence</span>
                <span className="font-medium tabular-nums">
                  {Math.round(Number(confidence) * 100)}%
                </span>
              </div>
              <Progress value={Number(confidence) * 100} />
            </div>
          ) : null}
        </div>

        {strategy.signals && strategy.signals.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Signals used</p>
            <div className="flex flex-wrap gap-2">
              {strategy.signals.map((signal, i) => (
                <Badge key={i} variant="secondary" className="font-normal">
                  {signal}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-medium">Recommended core message</p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {strategy.strategy_summary}
          </p>
        </div>

        <Separator />

        <div className="space-y-2">
          <p className="text-sm font-medium">Full rationale</p>
          <ScrollArea className="h-56 rounded-md border bg-muted/30 p-3">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {strategy.rationale}
            </p>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}
