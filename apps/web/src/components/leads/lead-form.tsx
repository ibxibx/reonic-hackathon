'use client';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { createLeadAction } from '@/data/user/leads';
import {
  FINANCING_TYPES,
  FINANCING_TYPE_LABELS,
  ROOF_TYPES,
  ROOF_TYPE_LABELS,
} from '@/lib/solar';
import { zodResolver } from '@hookform/resolvers/zod';
import { Home, ReceiptText, Sparkles } from 'lucide-react';
import { useAction } from 'next-safe-action/hooks';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

const numericString = (message: string, predicate: (n: number) => boolean) =>
  z
    .string()
    .min(1, 'Required')
    .refine((v) => v !== '' && !Number.isNaN(Number(v)) && predicate(Number(v)), {
      message,
    });

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Enter a valid email'),
  phone: z.string().min(5, 'Phone is required'),
  address: z.string().min(1, 'Address is required'),
  roofType: z.enum(ROOF_TYPES).optional(),
  monthlyBill: numericString('Must be 0 or more', (n) => n >= 0),
  systemSizeKw: numericString('Must be greater than 0', (n) => n > 0),
  totalCost: numericString('Must be 0 or more', (n) => n >= 0),
  financingType: z.enum(FINANCING_TYPES),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

export function LeadForm() {
  const router = useRouter();
  const toastRef = useRef<string | number | undefined>(undefined);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: 'onTouched',
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      address: '',
      roofType: undefined,
      monthlyBill: '',
      systemSizeKw: '',
      totalCost: '',
      financingType: undefined,
      notes: '',
    },
  });

  const { execute, status } = useAction(createLeadAction, {
    onExecute: () => {
      toastRef.current = toast.loading('Creating lead...');
    },
    onSuccess: ({ data }) => {
      toast.success('Lead created', { id: toastRef.current });
      toastRef.current = undefined;
      if (data?.leadId) {
        router.push(`/leads/${data.leadId}/strategy?autostart=1`);
      } else {
        router.push('/leads');
      }
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? 'Failed to create lead', {
        id: toastRef.current,
      });
      toastRef.current = undefined;
    },
  });

  const onSubmit = (data: FormData) => {
    execute({
      name: data.name,
      email: data.email,
      phone: data.phone,
      address: data.address,
      roofType: data.roofType,
      monthlyBill: Number(data.monthlyBill),
      systemSizeKw: Number(data.systemSizeKw),
      totalCost: Number(data.totalCost),
      financingType: data.financingType,
      notes: data.notes,
    });
  };

  const isSubmitting = status === 'executing';

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Home className="h-5 w-5 text-primary" />
              <CardTitle>Homeowner details</CardTitle>
            </div>
            <CardDescription>Who is this solar lead?</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Jane Homeowner" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="jane@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input type="tel" placeholder="+1 555 123 4567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Solar St, CA" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="roofType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Roof type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select roof type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROOF_TYPES.map((roof) => (
                        <SelectItem key={roof} value={roof}>
                          {ROOF_TYPE_LABELS[roof]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="monthlyBill"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monthly electricity bill (USD)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="180"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-primary" />
              <CardTitle>Quote details</CardTitle>
            </div>
            <CardDescription>The proposed solar system.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="systemSizeKw"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>System size (kW)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0.1}
                      step="0.1"
                      placeholder="8.5"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="totalCost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total cost (USD)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="24000"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="financingType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Financing type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value ?? ''}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select financing" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {FINANCING_TYPES.map((fin) => (
                        <SelectItem key={fin} value={fin}>
                          {FINANCING_TYPE_LABELS[fin]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="sm:col-span-2">
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={3}
                        placeholder="Any context about this deal..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button asChild variant="outline" type="button" disabled={isSubmitting}>
            <Link href="/leads">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Spinner className="mr-1 h-4 w-4" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="mr-1 h-4 w-4" />
                Create Lead &amp; Generate Strategy
              </>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
