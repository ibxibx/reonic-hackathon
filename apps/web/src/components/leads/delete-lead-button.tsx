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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('pages');
  const toastRef = useRef<string | number | undefined>(undefined);

  const { execute, status } = useAction(deleteLeadAction, {
    onExecute: () => {
      toastRef.current = toast.loading(t('leads.deleting'));
    },
    onSuccess: () => {
      toast.success(t('leads.deleted'), { id: toastRef.current });
      toastRef.current = undefined;
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.refresh();
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? t('leads.deleteFailed'), {
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
            {t('common.delete')}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('leads.deleteConfirmTitle', { name: leadName })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('leads.deleteConfirmDescription')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            disabled={status === 'executing'}
            onClick={() => execute({ leadId })}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
