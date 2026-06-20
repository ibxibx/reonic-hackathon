'use client';

import { GenerateStrategyButton } from '@/components/strategy/generate-strategy-button';
import { StrategySkeleton } from '@/components/strategy/strategy-skeleton';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { generateStrategyAction } from '@/data/user/strategies';
import { Sparkles } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Auto-triggers strategy generation once on mount (used right after a lead is
 * created with `?autostart=1`). Falls back to a manual CTA on error.
 */
export function StrategyAutostart({ leadId }: { leadId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const toastRef = useRef<string | number | undefined>(undefined);

  const { execute, status } = useAction(generateStrategyAction, {
    onExecute: () => {
      toastRef.current = toast.loading('Generating strategy with AI...');
    },
    onSuccess: () => {
      toast.success('Strategy ready', { id: toastRef.current });
      toastRef.current = undefined;
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Failed to generate strategy', {
        id: toastRef.current,
      });
      toastRef.current = undefined;
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    execute({ leadId });
  }, [execute, leadId]);

  if (status === 'executing' || status === 'idle') {
    return <StrategySkeleton />;
  }

  // hasErrored / fallback
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Generate strategy</CardTitle>
        </div>
        <CardDescription>
          Let AI analyze this lead and build a multi-channel closing plan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GenerateStrategyButton leadId={leadId} />
      </CardContent>
    </Card>
  );
}
