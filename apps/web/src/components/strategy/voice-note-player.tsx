'use client';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { getVoiceNoteSignedUrl } from '@/data/user/leads-read';
import { generateVoiceNoteAction } from '@/data/user/messages';
import { Download, Mic, RefreshCw } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

export function VoiceNotePlayer({
  messageId,
  initialAudioPath,
  initialSignedUrl,
}: {
  messageId: string;
  initialAudioPath: string | null;
  initialSignedUrl: string | null;
}) {
  const router = useRouter();
  const toastRef = useRef<string | number | undefined>(undefined);
  const [audioPath, setAudioPath] = useState<string | null>(initialAudioPath);
  const [audioUrl, setAudioUrl] = useState<string | null>(initialSignedUrl);
  const [reloading, setReloading] = useState(false);

  const { execute, status } = useAction(generateVoiceNoteAction, {
    onExecute: () => {
      toastRef.current = toast.loading('ElevenLabs is recording...');
    },
    onSuccess: async ({ data }) => {
      toast.success('Voice note ready', { id: toastRef.current });
      toastRef.current = undefined;
      if (data?.audioPath) {
        setAudioPath(data.audioPath);
        const url = await getVoiceNoteSignedUrl(data.audioPath);
        setAudioUrl(url);
      }
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Failed to generate voice note', {
        id: toastRef.current,
      });
      toastRef.current = undefined;
    },
  });

  const isGenerating = status === 'executing';

  async function reloadUrl() {
    if (!audioPath) return;
    setReloading(true);
    const url = await getVoiceNoteSignedUrl(audioPath);
    setAudioUrl(url);
    setReloading(false);
    if (!url) toast.error('Could not refresh audio link');
  }

  if (isGenerating) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <Spinner className="h-4 w-4" />
        ElevenLabs is recording the voice note...
      </div>
    );
  }

  if (!audioPath) {
    return (
      <Button onClick={() => execute({ messageId })} variant="secondary">
        <Mic className="mr-1 h-4 w-4" />
        Generate Voice Note
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {audioUrl ? (
        <audio
          controls
          src={audioUrl}
          className="w-full"
          onError={reloadUrl}
        >
          Your browser does not support the audio element.
        </audio>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Audio link expired.</span>
          <Button
            variant="link"
            size="sm"
            className="px-0"
            onClick={reloadUrl}
            disabled={reloading}
          >
            {reloading ? 'Reloading...' : 'Reload audio'}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => execute({ messageId })}
        >
          <RefreshCw className="mr-1 h-4 w-4" />
          Regenerate
        </Button>
        {audioUrl ? (
          <Button asChild variant="ghost" size="sm">
            <a href={audioUrl} download>
              <Download className="mr-1 h-4 w-4" />
              Download
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
