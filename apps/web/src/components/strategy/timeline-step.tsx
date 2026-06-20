'use client';

import { MessageStatusBadge } from '@/components/leads/status-badge';
import { VoiceNotePlayer } from '@/components/strategy/voice-note-player';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { sendEmailAction, sendSmsAction } from '@/data/user/messages';
import { CHANNEL_CONFIG, type MessageChannel } from '@/lib/solar';
import { cn } from '@/lib/utils';
import type { Table } from '@/types';
import {
  Copy,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  Send,
  type LucideIcon,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

const ICONS: Record<MessageChannel, LucideIcon> = {
  email: Mail,
  sms: MessageSquare,
  call: Phone,
  voice: Mic,
};

type Message = Table<'messages'>;

export function TimelineStep({
  message,
  isLast,
  voiceSignedUrl,
}: {
  message: Message;
  isLast: boolean;
  voiceSignedUrl: string | null;
}) {
  const channel = message.channel_type as MessageChannel;
  const Icon = ICONS[channel] ?? Mail;
  const label = CHANNEL_CONFIG[channel]?.label ?? channel;
  const [expanded, setExpanded] = useState(false);
  const isLong = message.content.length > 180;

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted text-foreground">
          <Icon className="size-4" />
        </div>
        {!isLast ? <div className="my-1 w-px flex-1 bg-border" /> : null}
      </div>

      <Card className="mb-6 flex-1">
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">
                  Day {message.sequence_order}
                </span>
              </div>
              {message.goal ? (
                <p className="text-xs text-muted-foreground">
                  Goal: {message.goal}
                </p>
              ) : null}
            </div>
            <MessageStatusBadge status={message.status} />
          </div>

          {message.subject ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Subject: </span>
              <span className="font-medium">{message.subject}</span>
            </p>
          ) : null}

          <div>
            <p
              className={cn(
                'whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground',
                !expanded && isLong && 'line-clamp-3'
              )}
            >
              {message.content}
            </p>
            {isLong ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-1 text-xs font-medium text-primary hover:underline"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {channel === 'email' || channel === 'sms' ? (
              <SendButton message={message} channel={channel} />
            ) : null}

            {channel === 'call' ? (
              <CopyButton content={message.content} />
            ) : null}

            {channel === 'voice' ? (
              <VoiceNotePlayer
                messageId={message.id}
                initialAudioPath={message.audio_path}
                initialSignedUrl={voiceSignedUrl}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SendButton({
  message,
  channel,
}: {
  message: Message;
  channel: 'email' | 'sms';
}) {
  const router = useRouter();
  const toastRef = useRef<string | number | undefined>(undefined);
  const action = channel === 'email' ? sendEmailAction : sendSmsAction;

  const { execute, status } = useAction(action, {
    onExecute: () => {
      toastRef.current = toast.loading(
        `Sending ${channel === 'email' ? 'email' : 'SMS'}...`
      );
    },
    onSuccess: ({ data }) => {
      if (data?.mock) {
        toast.success('Simulated send (mock mode)', { id: toastRef.current });
      } else if (data?.success) {
        toast.success('Sent', { id: toastRef.current });
      } else {
        toast.error(data?.error ?? 'Send failed', { id: toastRef.current });
      }
      toastRef.current = undefined;
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Send failed', { id: toastRef.current });
      toastRef.current = undefined;
    },
  });

  const isSending = status === 'executing';
  const alreadySent = message.status === 'sent';

  return (
    <Button
      size="sm"
      variant={alreadySent ? 'outline' : 'default'}
      disabled={isSending}
      onClick={() => execute({ messageId: message.id })}
    >
      <Send className="mr-1 h-4 w-4" />
      {isSending ? 'Sending...' : alreadySent ? 'Resend' : 'Send'}
    </Button>
  );
}

function CopyButton({ content }: { content: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard
          .writeText(content)
          .then(() => toast.success('Script copied'))
          .catch(() => toast.error('Could not copy'));
      }}
    >
      <Copy className="mr-1 h-4 w-4" />
      Copy script
    </Button>
  );
}
