import { AppError } from '@/lib/errors';

export async function generateVoiceNote(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    throw new AppError(
      'ElevenLabs credentials not configured',
      'MISSING_ELEVENLABS_CREDENTIALS',
      500
    );
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs error:', errorText);
      throw new AppError(
        'Failed to generate voice note',
        'ELEVENLABS_ERROR',
        500
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('ElevenLabs error:', error);
    throw new AppError('Voice generation failed', 'ELEVENLABS_ERROR', 500);
  }
}
