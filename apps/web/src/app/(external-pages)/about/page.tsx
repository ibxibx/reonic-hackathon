import { AboutCTA } from './about-cta';
import { AboutFeaturesGrid } from './about-features-grid';
import { AboutHero } from './about-hero';
import { AboutTechStack } from './about-tech-stack';

const technologies = [
  'Next.js 16',
  'TypeScript',
  'Supabase',
  'Tailwind CSS',
  'shadcn/ui',
  'OpenAI GPT-4o',
  'ElevenLabs TTS',
  'Vercel AI SDK',
];

export default function About() {
  return (
    <div className="container mx-auto py-12 space-y-12 max-w-6xl">
      <AboutHero />
      <AboutFeaturesGrid />
      <AboutCTA />
      <AboutTechStack technologies={technologies} />
    </div>
  );
}
