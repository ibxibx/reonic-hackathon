import { Resend } from 'resend';

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  mock?: boolean;
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<SendEmailResult> {
  // Mock mode si no hay API key
  if (process.env.MOCK_EMAIL === 'true' || !process.env.RESEND_API_KEY) {
    console.log('[MOCK] Email sent:', { to, subject });
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
      mock: true,
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from =
      process.env.RESEND_FROM_EMAIL || 'Solar Copilot <sales@example.com>';

    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html: `<div style="font-family: sans-serif; line-height: 1.6;">${body.replace(/\n/g, '<br>')}</div>`,
    });

    if (error) {
      console.error('Resend error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    console.error('Email send error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
