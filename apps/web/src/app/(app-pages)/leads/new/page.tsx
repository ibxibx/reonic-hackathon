import { LeadForm } from '@/components/leads/lead-form';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewLeadPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-3xl w-full">
      <div className="flex flex-col gap-2">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="w-fit -ml-2 text-muted-foreground"
        >
          <Link href="/leads">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to leads
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">New lead</h1>
        <p className="text-sm text-muted-foreground">
          Add a homeowner and their quote, then generate a closing strategy.
        </p>
      </div>

      <LeadForm />
    </div>
  );
}
