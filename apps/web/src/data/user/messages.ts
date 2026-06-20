'use server';

import { authActionClient } from '@/lib/safe-action';
import { generateVoiceNote } from '@/lib/integrations/elevenlabs';
import { sendEmail } from '@/lib/integrations/resend';
import { sendSms } from '@/lib/integrations/twilio';
import { createSupabaseClient } from '@/supabase-clients/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const messageIdSchema = z.object({
  messageId: z.uuid(),
});

export const generateVoiceNoteAction = authActionClient
  .schema(messageIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { messageId } = parsedInput;
    const supabase = await createSupabaseClient();

    // Obtener mensaje con verificación de ownership
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*, leads!inner(installer_id)')
      .eq('id', messageId)
      .eq('leads.installer_id', ctx.userId)
      .single();

    if (messageError || !message) {
      throw new Error('Message not found');
    }

    if (message.channel_type !== 'voice') {
      throw new Error('Invalid channel type');
    }

    // Generar audio con ElevenLabs
    const audioBuffer = await generateVoiceNote(message.content);

    // Subir a Supabase Storage
    const fileName = `${ctx.userId}/${messageId}.mp3`;
    const { error: uploadError } = await supabase.storage
      .from('voice-notes')
      .upload(fileName, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error('Failed to upload audio');
    }

    // Actualizar mensaje con audio_path
    const { error: updateError } = await supabase
      .from('messages')
      .update({ audio_path: fileName })
      .eq('id', messageId);

    if (updateError) {
      throw new Error('Failed to update message');
    }

    revalidatePath(`/leads/${message.lead_id}`);
    revalidatePath(`/leads/${message.lead_id}/strategy`);

    return { audioPath: fileName };
  });

export const sendEmailAction = authActionClient
  .schema(messageIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { messageId } = parsedInput;
    const supabase = await createSupabaseClient();

    // Obtener mensaje con verificación de ownership
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*, leads!inner(installer_id, email)')
      .eq('id', messageId)
      .eq('leads.installer_id', ctx.userId)
      .single();

    if (messageError || !message) {
      throw new Error('Message not found');
    }

    if (message.channel_type !== 'email') {
      throw new Error('Invalid channel type');
    }

    if (!message.subject) {
      throw new Error('Email subject is required');
    }

    // Enviar email
    const result = await sendEmail(
      message.leads.email,
      message.subject,
      message.content
    );

    // Actualizar status del mensaje
    const { error: updateError } = await supabase
      .from('messages')
      .update({
        status: result.success ? 'sent' : 'failed',
        sent_at: result.success ? new Date().toISOString() : null,
        provider_message_id: result.messageId || null,
        error_message: result.error || null,
      })
      .eq('id', messageId);

    if (updateError) {
      throw new Error('Failed to update message status');
    }

    revalidatePath(`/leads/${message.lead_id}`);
    revalidatePath(`/leads/${message.lead_id}/strategy`);

    return {
      success: result.success,
      mock: result.mock || false,
      error: result.error,
    };
  });

export const sendSmsAction = authActionClient
  .schema(messageIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { messageId } = parsedInput;
    const supabase = await createSupabaseClient();

    // Obtener mensaje con verificación de ownership
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('*, leads!inner(installer_id, phone)')
      .eq('id', messageId)
      .eq('leads.installer_id', ctx.userId)
      .single();

    if (messageError || !message) {
      throw new Error('Message not found');
    }

    if (message.channel_type !== 'sms') {
      throw new Error('Invalid channel type');
    }

    // Enviar SMS
    const result = await sendSms(message.leads.phone, message.content);

    // Actualizar status del mensaje
    const { error: updateError } = await supabase
      .from('messages')
      .update({
        status: result.success ? 'sent' : 'failed',
        sent_at: result.success ? new Date().toISOString() : null,
        provider_message_id: result.messageId || null,
        error_message: result.error || null,
      })
      .eq('id', messageId);

    if (updateError) {
      throw new Error('Failed to update message status');
    }

    revalidatePath(`/leads/${message.lead_id}`);
    revalidatePath(`/leads/${message.lead_id}/strategy`);

    return {
      success: result.success,
      mock: result.mock || false,
      error: result.error,
    };
  });
