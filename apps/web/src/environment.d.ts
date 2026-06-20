declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SUPABASE_URL: string;
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
      NODE_ENV: 'development' | 'production';
      SUPABASE_PROJECT_REF: string;
      SUPABASE_SERVICE_ROLE_KEY?: string;

      // AI (Anthropic)
      ANTHROPIC_API_KEY?: string;
      ANTHROPIC_MODEL?: string;

      // ElevenLabs (Text-to-Speech)
      ELEVENLABS_API_KEY?: string;
      ELEVENLABS_VOICE_ID?: string;

      // Resend (Email)
      RESEND_API_KEY?: string;
      RESEND_FROM_EMAIL?: string;
      MOCK_EMAIL?: string;

      // Twilio (SMS)
      TWILIO_ACCOUNT_SID?: string;
      TWILIO_AUTH_TOKEN?: string;
      TWILIO_PHONE_NUMBER?: string;
      MOCK_SMS?: string;
    }
  }
}

// eslint-disable-next-line prettier/prettier
export { };

