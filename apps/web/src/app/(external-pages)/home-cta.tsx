import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function HomeCTA() {
  return (
    <section className="py-20 px-4 text-center">
      <div className="max-w-xl mx-auto flex flex-col gap-4 items-center">
        <h2 className="text-3xl font-bold tracking-tight">Stop losing deals to silence</h2>
        <p className="text-muted-foreground">
          Every day a quote sits unanswered, the deal gets colder. Let AI do the follow-up your team doesn't have time for.
        </p>
        <Button asChild size="lg">
          <Link href="/sign-up">
            Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
