import { VoiceNotePlayer } from '@/components/strategy/voice-note-player';
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
  getVoiceNoteSignedUrl,
} from '@/data/user/leads-read';
import { ArrowLeft, Mic, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function VoicePage(props: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await props.params;

  let lead;
  try {
    const result = await getLeadWithQuote(leadId);
    lead = result.lead;
  } catch {
    notFound();
  }

  const messages = await getMessagesForLead(leadId);
  const voiceMessage = messages.find((m) => m.channel_type === 'voice');
  const signedUrl = voiceMessage?.audio_path
    ? await getVoiceNoteSignedUrl(voiceMessage.audio_path)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-2xl w-full">
      <div className="flex flex-col gap-3">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit -ml-2 text-muted-foreground"
        >
          <Link href={`/leads/${leadId}/strategy`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to strategy
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Voice note for {lead.name}
        </h1>
      </div>

      {voiceMessage ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              <CardTitle>Voice script</CardTitle>
            </div>
            {voiceMessage.goal ? (
              <CardDescription>Goal: {voiceMessage.goal}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-relaxed">
              {voiceMessage.content}
            </p>
            <VoiceNotePlayer
              messageId={voiceMessage.id}
              initialAudioPath={voiceMessage.audio_path}
              initialSignedUrl={signedUrl}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>No voice script yet</CardTitle>
            </div>
            <CardDescription>
              Generate a strategy first — it includes a voice script you can turn
              into an audio note.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href={`/leads/${leadId}/strategy`}>Go to strategy</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
