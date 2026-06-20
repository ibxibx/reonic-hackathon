'use server';

import { createSupabaseClient } from '@/supabase-clients/server';
import type { Table } from '@/types';
import type { LeadStatus } from '@/lib/solar';

export async function getLeads(): Promise<Array<Table<'leads'>>> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getRecentLeads(
  limit = 5
): Promise<Array<Table<'leads'>>> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

export async function getLeadWithQuote(leadId: string): Promise<{
  lead: Table<'leads'>;
  quote: Table<'quotes'> | null;
}> {
  const supabase = await createSupabaseClient();

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (leadError) throw leadError;

  const { data: quote } = await supabase
    .from('quotes')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  return { lead, quote: quote ?? null };
}

export async function getStrategyForLead(
  leadId: string
): Promise<Table<'strategies'> | null> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getLatestPredictionForLead(
  leadId: string
): Promise<Table<'predictions'> | null> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getMessagesForLead(
  leadId: string
): Promise<Array<Table<'messages'>>> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('sequence_order', { ascending: true });

  if (error) throw error;
  return data;
}

export async function getOrchestrationForLead(
  leadId: string
): Promise<Table<'lead_orchestration'> | null> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('lead_orchestration')
    .select('*')
    .eq('lead_id', leadId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getLatestInboundForLead(
  leadId: string
): Promise<Table<'inbound_messages'> | null> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('inbound_messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getInboundForLead(
  leadId: string
): Promise<Array<Table<'inbound_messages'>>> {
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase
    .from('inbound_messages')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

export interface LeadStats {
  total: number;
  byStatus: Record<LeadStatus, number>;
  negotiating: number;
  ghosted: number;
  strategiesThisWeek: number;
}

export async function getLeadStats(): Promise<LeadStats> {
  const supabase = await createSupabaseClient();

  const { data: leads, error: leadsError } = await supabase
    .from('leads')
    .select('status');
  if (leadsError) throw leadsError;

  const byStatus: Record<LeadStatus, number> = {
    new: 0,
    contacted: 0,
    negotiating: 0,
    closed: 0,
    ghosted: 0,
  };
  for (const lead of leads) {
    const status = lead.status as LeadStatus;
    if (status in byStatus) byStatus[status] += 1;
  }

  const weekAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { count: strategiesThisWeek } = await supabase
    .from('strategies')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', weekAgo);

  return {
    total: leads.length,
    byStatus,
    negotiating: byStatus.negotiating,
    ghosted: byStatus.ghosted,
    strategiesThisWeek: strategiesThisWeek ?? 0,
  };
}

/**
 * Creates a short-lived signed URL for a private voice-note object.
 * Returns null if the path is missing or the object can't be signed.
 */
export async function getVoiceNoteSignedUrl(
  audioPath: string | null
): Promise<string | null> {
  if (!audioPath) return null;
  const supabase = await createSupabaseClient();
  const { data, error } = await supabase.storage
    .from('voice-notes')
    .createSignedUrl(audioPath, 60 * 60);

  if (error) return null;
  return data.signedUrl;
}
