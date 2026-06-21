import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { T } from '@/components/ui/Typography';
import { Github } from 'lucide-react';
import Link from 'next/link';

export function AboutHero() {
  return (
    <div className="text-center space-y-4">
      <Badge variant="outline" className="mb-4">
        About RayCiprocity
      </Badge>
      <T.H1 className="text-4xl sm:text-5xl md:text-6xl">
        The{' '}
        <span className="bg-gradient-to-r from-primary to-primary bg-clip-text text-transparent">
          Closing Layer
        </span>{' '}
        for Solar Sales
      </T.H1>
      <T.P className="mx-auto max-w-[700px] text-lg text-muted-foreground">
        Solar installers lose deals in the silence after the quote. RayCiprocity reads the customer, diagnoses why they're stalling, and generates a multi-channel persuasion strategy — so installers close more, faster.
      </T.P>
      <div className="flex flex-wrap justify-center gap-4 pt-4">
        <Button size="lg" asChild>
          <Link href="/sign-up">Get Started</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link
            href="https://github.com/ibxibx/reonic-hackathon"
            target="_blank"
          >
            <Github className="mr-2 h-5 w-5" />
            View on GitHub
          </Link>
        </Button>
      </div>
    </div>
  );
}
