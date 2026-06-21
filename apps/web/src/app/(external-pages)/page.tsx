import { Separator } from '@/components/ui/separator';
import { Brain, Mail, MessageSquare, Mic, Phone, Target } from 'lucide-react';
import { HomeCTA } from './home-cta';
import { HomeFeatures, type HomeFeature } from './home-features';
import { HomeHero } from './home-hero';

const features: HomeFeature[] = [
  {
    icon: Brain,
    title: 'Problem-Code Diagnosis',
    description: 'AI identifies exactly why each deal is stalling — from price shock to spouse hesitation — using a 40-code taxonomy across 7 families.',
  },
  {
    icon: Target,
    title: 'Persona Detection',
    description: 'Classifies every homeowner as family, investor, environmentalist, or skeptic — then tailors tone, channel, and timing to match.',
  },
  {
    icon: Mail,
    title: 'Multi-Channel Outreach',
    description: 'Generates a complete follow-up strategy across email, SMS, call scripts, and voice notes — each step with a clear rationale.',
  },
  {
    icon: Mic,
    title: 'AI Voice Notes',
    description: 'Synthesizes personalized voice notes via ElevenLabs that deliver human warmth at scale — the demo wow-moment.',
  },
  {
    icon: MessageSquare,
    title: 'Inbound Triage & Pivot',
    description: 'When a customer replies with an objection, every remaining unsent message rewrites itself to address their specific concern.',
  },
  {
    icon: Phone,
    title: 'The "Oracle" Predictor',
    description: 'Scores sign-vs-ghost probability for every lead and recommends the single next-best action with evidence.',
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <HomeHero />
      <Separator />
      <HomeFeatures features={features} />
      <Separator />
      <HomeCTA />
    </div>
  );
}
