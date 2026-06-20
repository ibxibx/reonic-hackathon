'use server';

import { authActionClient } from '@/lib/safe-action';
import { createSupabaseClient } from '@/supabase-clients/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const leadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email'),
  phone: z.string().min(5, 'Phone is required'),
  address: z.string().min(1, 'Address is required'),
  roofType: z.string().optional(),
  monthlyBill: z.number().min(0, 'Monthly bill must be >= 0'),
  systemSizeKw: z.number().min(0.1, 'System size must be > 0'),
  totalCost: z.number().min(0, 'Total cost must be >= 0'),
  financingType: z.string().min(1, 'Financing type is required'),
  notes: z.string().optional(),
});

export type CreateLeadInput = z.infer<typeof leadSchema>;

export const createLeadAction = authActionClient
  .schema(leadSchema)
  .action(async ({ parsedInput, ctx }) => {
    const supabase = await createSupabaseClient();

    // Crear lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        installer_id: ctx.userId,
        name: parsedInput.name,
        email: parsedInput.email,
        phone: parsedInput.phone,
        address: parsedInput.address,
        roof_type: parsedInput.roofType || null,
        monthly_bill: parsedInput.monthlyBill,
        status: 'new',
      })
      .select()
      .single();

    if (leadError || !lead) {
      throw new Error('Failed to create lead');
    }

    // Crear quote
    const { error: quoteError } = await supabase.from('quotes').insert({
      lead_id: lead.id,
      system_size_kw: parsedInput.systemSizeKw,
      total_cost: parsedInput.totalCost,
      financing_type: parsedInput.financingType,
      notes: parsedInput.notes || null,
    });

    if (quoteError) {
      // Rollback: eliminar lead si falla quote
      await supabase.from('leads').delete().eq('id', lead.id);
      throw new Error('Failed to create quote');
    }

    revalidatePath('/leads');
    revalidatePath(`/leads/${lead.id}`);

    return { leadId: lead.id };
  });
