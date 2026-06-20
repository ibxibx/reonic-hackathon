import { LeadsTable } from '@/components/leads/leads-table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getLeadsWithProblemCodes } from '@/data/user/leads-read';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

async function LeadsSection() {
  const leads = await getLeadsWithProblemCodes();
  return <LeadsTable leads={leads} />;
}

export default function LeadsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Manage your homeowners and their closing strategies.
          </p>
        </div>
        <Button asChild>
          <Link href="/leads/new">
            <Plus className="mr-1 h-4 w-4" />
            New Lead
          </Link>
        </Button>
      </div>

      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <LeadsSection />
      </Suspense>
    </div>
  );
}
