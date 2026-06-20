'use server';

import { authActionClient } from '@/lib/safe-action';
import { createSupabaseClient } from '@/supabase-clients/server';
import type { Table } from '@/types';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export async function getMyProfile(): Promise<Table<'profiles'> | null> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return data;
}

const updateProfileSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(120),
});

export const updateProfileAction = authActionClient
  .schema(updateProfileSchema)
  .action(async ({ parsedInput, ctx }) => {
    const supabase = await createSupabaseClient();

    const { error } = await supabase
      .from('profiles')
      .update({ company_name: parsedInput.companyName })
      .eq('id', ctx.userId);

    if (error) {
      throw new Error('Failed to update profile');
    }

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    return { success: true };
  });
