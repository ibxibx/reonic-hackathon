'use client';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { generateStrategyAction } from '@/data/user/strategies';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export function GenerateStrategyButton({
  leadId,
  hasStrategy = false,
  redirectToStrategy = false,
  variant = 'default',
  size = 'default',
  className,
}: {
  leadId: string;
  hasStrategy?: boolean;
  redirectToStrategy?: boolean;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}) {
  const router = useRouter();
  const { t } = useTranslation('pages');
  const toastRef = useRef<string | number | undefined>(undefined);

  const { execute, status } = useAction(generateStrategyAction, {
    onExecute: () => {
      toastRef.current = toast.loading(t('strategy.toastGenerating'));
    },
    onSuccess: () => {
      toast.success(t('strategy.toastReady'), { id: toastRef.current });
      toastRef.current = undefined;
      if (redirectToStrategy) {
        router.push(`/leads/${leadId}/strategy`);
      }
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t('strategy.toastGenerateFailed'), {
        id: toastRef.current,
      });
      toastRef.current = undefined;
    },
  });

  const isRunning = status === 'executing';

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={isRunning}
      onClick={() => execute({ leadId })}
    >
      {isRunning ? (
        <>
          <Spinner className="mr-1 h-4 w-4" />
          {t('strategy.generating')}
        </>
      ) : hasStrategy ? (
        <>
          <RefreshCw className="mr-1 h-4 w-4" />
          {t('strategy.regenerate')}
        </>
      ) : (
        <>
          <Sparkles className="mr-1 h-4 w-4" />
          {t('strategy.generate')}
        </>
      )}
    </Button>
  );
}
