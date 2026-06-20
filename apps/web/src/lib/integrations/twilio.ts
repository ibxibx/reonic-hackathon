import twilio from 'twilio';

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  mock?: boolean;
}

export async function sendSms(to: string, body: string): Promise<SendSmsResult> {
  // Mock mode si no hay credenciales
  if (
    process.env.MOCK_SMS === 'true' ||
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    console.log('[MOCK] SMS sent:', { to, body });
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
      mock: true,
    };
  }

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const message = await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });

    return {
      success: true,
      messageId: message.sid,
    };
  } catch (error) {
    console.error('Twilio error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
