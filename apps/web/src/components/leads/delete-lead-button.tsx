'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { deleteLeadAction } from '@/data/user/leads';
import { Trash2 } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useRef, type ReactNode } from 'react';
import { toast } from 'sonner';

export function DeleteLeadButton({
  leadId,
  leadName,
  redirectTo,
  trigger,
}: {
  leadId: string;
  leadName: string;
  /** If provided, navigate here after deletion; otherwise refresh in place. */
  redirectTo?: string;
  /** Custom trigger element. Defaults to an outline "Delete" button. */
  trigger?: ReactNode;
}) {
  const router = useRouter();
  const toastRef = useRef<string | number | undefined>(undefined);

  const { execute, status } = useAction(deleteLeadAction, {
    onExecute: () => {
      toastRef.current = toast.loading('Deleting lead...');
    },
    onSuccess: () => {
      toast.success('Lead deleted', { id: toastRef.current });
      toastRef.current = undefined;
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Failed to delete lead', {
        id: toastRef.current,
      });
      toastRef.current = undefined;
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {leadName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the lead, its quote, strategy and all
            generated messages. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={status === 'executing'}
            onClick={() => execute({ leadId })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
