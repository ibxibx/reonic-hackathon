import { LeadsTable } from '@/components/leads/leads-table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getLeads } from '@/data/user/leads-read';
import { getServerTranslation } from '@/i18n/server';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

async function LeadsSection() {
  const leads = await getLeads();
  return <LeadsTable leads={leads} />;
}

export default async function LeadsPage() {
  const { t } = await getServerTranslation('pages');
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('leads.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('leads.subtitle')}
          </p>
        </div>
        <Button asChild>
          <Link href="/leads/new">
            <Plus className="mr-1 h-4 w-4" />
            {t('leads.newLead')}
          </Link>
        </Button>
      </div>

      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <LeadsSection />
      </Suspense>
    </div>
  );
}
