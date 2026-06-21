import { Button } from '@/components/ui/button';
import { T } from '@/components/ui/Typography';
import { getServerTranslation } from '@/i18n/server';
import { PlusCircle } from 'lucide-react';
import Link from 'next/link';

export async function DashboardHeading() {
  const { t } = await getServerTranslation('pages');
  return (
    <>
      <T.H1>{t('dashboard.title')}</T.H1>
      <Link href="/dashboard/new">
        <Button className="flex items-center gap-2">
          <PlusCircle className="h-4 w-4" /> {t('dashboard.newPrivateItem')}
        </Button>
      </Link>
    </>
  );
}
