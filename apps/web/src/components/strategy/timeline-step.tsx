'use client';

import { MessageStatusBadge } from '@/components/leads/status-badge';
import { VoiceNotePlayer } from '@/components/strategy/voice-note-player';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  sendEmailAction,
  sendSmsAction,
  updateMessageAction,
} from '@/data/user/messages';
import { CHANNEL_CONFIG, type MessageChannel } from '@/lib/solar';
import { cn } from '@/lib/utils';
import type { Table } from '@/types';
import {
  Check,
  Copy,
  Mail,
  MessageSquare,
  Mic,
  Pencil,
  Phone,
  Send,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('pages');
  const channel = message.channel_type as MessageChannel;
  const Icon = ICONS[channel] ?? Mail;
  const label = CHANNEL_CONFIG[channel]?.label ?? channel;
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const isLong = message.content.length > 180;
  const alreadySent = message.status === 'sent';
  const canEdit = !alreadySent;

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
                  {t('strategy.day', { n: message.sequence_order })}
                </span>
              </div>
              {message.goal ? (
                <p className="text-xs text-muted-foreground">
                  {t('strategy.goal', { goal: message.goal })}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <MessageStatusBadge status={message.status} />
              {canEdit && !editing ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground"
                  aria-label={t('strategy.editMessage')}
                  onClick={() => setEditing(true)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          {editing ? (
            <MessageEditor
              message={message}
              channel={channel}
              onDone={() => setEditing(false)}
            />
          ) : (
            <>
              {message.subject ? (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t('strategy.subject')}</span>
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
                    {expanded ? t('common.showLess') : t('common.showMore')}
                  </button>
                ) : null}
              </div>
            </>
          )}

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
  const { t } = useTranslation('pages');
  const router = useRouter();
  const toastRef = useRef<string | number | undefined>(undefined);
  const action = channel === 'email' ? sendEmailAction : sendSmsAction;

  const { execute, status } = useAction(action, {
    onExecute: () => {
      toastRef.current = toast.loading(
        channel === 'email' ? t('strategy.sendingEmail') : t('strategy.sendingSms')
      );
    },
    onSuccess: ({ data }) => {
      if (data?.mock) {
        toast.success(t('strategy.sentMock'), { id: toastRef.current });
      } else if (data?.success) {
        toast.success(t('strategy.sent'), { id: toastRef.current });
      } else {
        toast.error(data?.error ?? t('strategy.sendFailed'), { id: toastRef.current });
      }
      toastRef.current = undefined;
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t('strategy.sendFailed'), { id: toastRef.current });
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
      {isSending ? t('strategy.sending') : alreadySent ? t('strategy.resend') : t('strategy.send')}
    </Button>
  );
}

function CopyButton({ content }: { content: string }) {
  const { t } = useTranslation('pages');
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard
          .writeText(content)
          .then(() => toast.success(t('strategy.scriptCopied')))
          .catch(() => toast.error(t('strategy.copyFailed')));
      }}
    >
      <Copy className="mr-1 h-4 w-4" />
      {t('strategy.copyScript')}
    </Button>
  );
}


function MessageEditor({
  message,
  channel,
  onDone,
}: {
  message: Message;
  channel: MessageChannel;
  onDone: () => void;
}) {
  const { t } = useTranslation('pages');
  const router = useRouter();
  const isEmail = channel === 'email';
  const [subject, setSubject] = useState(message.subject ?? '');
  const [content, setContent] = useState(message.content);

  const { execute, status } = useAction(updateMessageAction, {
    onSuccess: () => {
      toast.success(t('strategy.messageUpdated'));
      onDone();
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t('strategy.updateFailed'));
    },
  });

  const isSaving = status === 'executing';
  const trimmed = content.trim();
  const unchanged =
    trimmed === message.content.trim() &&
    (!isEmail || subject.trim() === (message.subject ?? '').trim());

  return (
    <div className="space-y-2">
      {isEmail ? (
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('strategy.subjectLabel')}</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('strategy.emailSubjectPlaceholder')}
            disabled={isSaving}
          />
        </div>
      ) : null}

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">{t('strategy.messageLabel')}</label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={6}
          className="resize-y text-sm leading-relaxed"
          disabled={isSaving}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={isSaving || trimmed.length === 0 || unchanged}
          onClick={() =>
            execute({
              messageId: message.id,
              subject: isEmail ? subject : undefined,
              content: trimmed,
            })
          }
        >
          <Check className="mr-1 h-4 w-4" />
          {isSaving ? t('strategy.saving') : t('strategy.save')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isSaving}
          onClick={onDone}
        >
          <X className="mr-1 h-4 w-4" />
          {t('strategy.cancel')}
        </Button>
      </div>
    </div>
  );
}
