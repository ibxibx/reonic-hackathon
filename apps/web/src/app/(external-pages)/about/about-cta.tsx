import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Sun } from 'lucide-react';
import Link from 'next/link';

export function AboutCTA() {
  return (
    <Empty className="border-2 border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Sun />
        </EmptyMedia>
        <EmptyTitle>Ready to Close More Solar Deals?</EmptyTitle>
        <EmptyDescription>
          Sign up and start turning silent quotes into signed contracts — with AI that diagnoses, predicts, and persuades.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button size="lg" asChild>
            <Link href="/sign-up">Get Started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">
              Sign In
            </Link>
          </Button>
        </div>
      </EmptyContent>
    </Empty>
  );
}
