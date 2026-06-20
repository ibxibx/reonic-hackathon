import 'server-only';

export interface IntegrationStatus {
  /** Claude / Anthropic API configured */
  anthropic: boolean;
  /** ElevenLabs TTS configured */
  elevenlabs: boolean;
  /** Email will be simulated (no Resend key or MOCK_EMAIL=true) */
  emailMock: boolean;
  /** SMS will be simulated (no Twilio creds or MOCK_SMS=true) */
  smsMock: boolean;
}

export function getIntegrationStatus(): IntegrationStatus {
  const anthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const elevenlabs = Boolean(
    process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID
  );
  const emailMock =
    process.env.MOCK_EMAIL === 'true' || !process.env.RESEND_API_KEY;
  const smsMock =
    process.env.MOCK_SMS === 'true' ||
    !(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    );

  return { anthropic, elevenlabs, emailMock, smsMock };
}
