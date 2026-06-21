'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { T } from '@/components/ui/Typography';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Textarea } from '@/components/ui/textarea';
import { insertPrivateItemAction } from '@/data/user/privateItems';
import { Shield } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().min(1, 'Description is required'),
});

type FormData = z.infer<typeof formSchema>;

const formVariants = {
  hidden: { opacity: 0, y: 50 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export const CreatePrivateItemForm: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation('pages');
  const toastRef = useRef<string | number | undefined>(undefined);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      description: '',
    },
  });

  const { execute, status } = useAction(insertPrivateItemAction, {
    onExecute: () => {
      toastRef.current = toast.loading(t('dashboard.toastCreating'));
    },
    onSuccess: ({ data }) => {
      toast.success(t('dashboard.toastCreated'), { id: toastRef.current });
      toastRef.current = undefined;
      router.refresh();
      if (data) {
        router.push(`/private-item/${data}`);
      }
    },
    onError: ({ error }) => {
      const errorMessage = error.serverError ?? t('dashboard.toastFailed');
      toast.error(errorMessage, { id: toastRef.current });
      toastRef.current = undefined;
    },
  });

  const onSubmit = (data: FormData) => {
    execute(data);
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={formVariants}
      className="container max-w-2xl mx-auto py-6"
    >
      <Card className="shadow-lg border-t-4 border-t-primary">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>
              <T.H2>{t('dashboard.createTitle')}</T.H2>
            </CardTitle>
          </div>
          <CardDescription>
            {t('dashboard.createDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('dashboard.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('dashboard.namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('dashboard.description')}</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('dashboard.descriptionPlaceholder')}
                        rows={4}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                className="w-full flex items-center justify-center gap-2"
                type="submit"
                disabled={status === 'executing' || !form.formState.isValid}
              >
                {status === 'executing' ? (
                  <>
                    <Spinner className="h-4 w-4" />
                    <span>{t('dashboard.creating')}</span>
                  </>
                ) : (
                  t('dashboard.createButton')
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </motion.div>
  );
};
