import { GenerateStrategyButton } from '@/components/strategy/generate-strategy-button';
import { PersonaBadge } from '@/components/strategy/persona-badge';
import { StrategyAutostart } from '@/components/strategy/strategy-autostart';
import { StrategyRationale } from '@/components/strategy/strategy-rationale';
import { StrategyTimeline } from '@/components/strategy/strategy-timeline';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  getLeadWithQuote,
  getMessagesForLead,
  getStrategyForLead,
  getVoiceNoteSignedUrl,
} from '@/data/user/leads-read';
import { getIntegrationStatus } from '@/lib/integration-status';
import { ArrowLeft, Sparkles, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function StrategyPage(props: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ autostart?: string }>;
}) {
  const { leadId } = await props.params;
  const { autostart } = await props.searchParams;

  let lead;
  try {
    const result = await getLeadWithQuote(leadId);
    lead = result.lead;
  } catch {
    notFound();
  }

  const strategy = await getStrategyForLead(leadId);

  const header = (
    <div className="flex flex-col gap-3">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="w-fit -ml-2 text-muted-foreground"
      >
        <Link href={`/leads/${leadId}`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to lead
        </Link>
      </Button>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Strategy for {lead.name}
          </h1>
          {strategy ? (
            <PersonaBadge persona={strategy.persona_detected} />
          ) : null}
        </div>
        {strategy ? (
          <GenerateStrategyButton leadId={leadId} hasStrategy variant="outline" />
        ) : null}
      </div>
    </div>
  );

  // No strategy yet
  if (!strategy) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-6xl w-full">
        {header}
        {autostart === '1' ? (
          <StrategyAutostart leadId={leadId} />
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <CardTitle>No strategy yet</CardTitle>
              </div>
              <CardDescription>
                Generate an AI closing strategy with a 4-step outreach timeline.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GenerateStrategyButton leadId={leadId} />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Strategy exists — load messages + voice URL + integration status
  const messages = await getMessagesForLead(leadId);
  const { emailMock, smsMock } = getIntegrationStatus();

  const voiceMessage = messages.find(
    (m) => m.channel_type === 'voice' && m.audio_path
  );
  const voiceSignedUrl = voiceMessage
    ? await getVoiceNoteSignedUrl(voiceMessage.audio_path)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-6xl w-full">
      {header}

      {emailMock || smsMock ? (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-200">
          <TriangleAlert className="h-4 w-4 !text-amber-400" />
          <AlertTitle>Simulated send mode</AlertTitle>
          <AlertDescription className="text-amber-200/80">
            {emailMock && smsMock
              ? 'Email and SMS'
              : emailMock
                ? 'Email'
                : 'SMS'}{' '}
            sends are simulated — add the missing API credentials to send for
            real.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
        <StrategyRationale strategy={strategy} />
        <StrategyTimeline
          messages={messages}
          voiceSignedUrl={voiceSignedUrl}
        />
      </div>
    </div>
  );
}
