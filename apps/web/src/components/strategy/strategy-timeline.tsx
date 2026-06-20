import { TimelineStep } from '@/components/strategy/timeline-step';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { Table } from '@/types';
import { Workflow } from 'lucide-react';

export function StrategyTimeline({
  messages,
  voiceSignedUrl,
}: {
  messages: Array<Table<'messages'>>;
  voiceSignedUrl: string | null;
}) {
  return (
    <Card id="outreach-timeline">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Workflow className="h-5 w-5 text-primary" />
          <CardTitle>Outreach timeline</CardTitle>
        </div>
        <CardDescription>
          A 4-step, multi-channel sequence to close this lead.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages were generated for this strategy.
          </p>
        ) : (
          <div>
            {messages.map((message, i) => (
              <div id={`timeline-step-${message.channel_type}`} key={message.id}>
                <TimelineStep
                  message={message}
                  isLast={i === messages.length - 1}
                  voiceSignedUrl={
                    message.channel_type === 'voice' ? voiceSignedUrl : null
                  }
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
