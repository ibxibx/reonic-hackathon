'use client';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { updateProfileAction } from '@/data/user/profile';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAction } from 'next-safe-action/hooks';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const schema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(120),
});

type FormData = z.infer<typeof schema>;

export function ProfileForm({ companyName }: { companyName: string }) {
  const toastRef = useRef<string | number | undefined>(undefined);
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { companyName },
  });

  const { execute, status } = useAction(updateProfileAction, {
    onExecute: () => {
      toastRef.current = toast.loading('Saving...');
    },
    onSuccess: () => {
      toast.success('Profile updated', { id: toastRef.current });
      toastRef.current = undefined;
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Failed to update profile', {
        id: toastRef.current,
      });
      toastRef.current = undefined;
    },
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((data) => execute(data))}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="companyName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Company name</FormLabel>
              <FormControl>
                <Input placeholder="Acme Solar Co." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={status === 'executing' || !form.formState.isValid}
        >
          {status === 'executing' ? (
            <>
              <Spinner className="mr-1 h-4 w-4" />
              Saving...
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </form>
    </Form>
  );
}
