import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function HomeHero() {
  return (
    <section className="flex flex-col items-center justify-center gap-6 py-28 px-4 text-center">
      <Badge variant="secondary" className="px-3 py-1">
        AI Sales Copilot for Solar Installers
      </Badge>
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl max-w-4xl">
        Turn every{' '}
        <span className="text-primary">solar quote</span>{' '}
        into a signed deal
      </h1>
      <p className="text-muted-foreground text-lg max-w-2xl">
        RayCiprocity diagnoses why each homeowner is stalling, predicts who will sign or ghost, and generates persona-matched outreach across email, SMS, call, and voice — so you close more deals without the chase.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <Button asChild size="lg">
          <Link href="/sign-up">
            Start Closing Deals <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">
            Sign In to Dashboard
          </Link>
        </Button>
      </div>
    </section>
  );
}
