import { StatsCard } from '@/components/dashboard/stats-card';
import { RecentLeads } from '@/components/dashboard/recent-leads';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { getLeadStats, getRecentLeads } from '@/data/user/leads-read';
import { getMyProfile } from '@/data/user/profile';
import { getCachedLoggedInVerifiedSupabaseUser } from '@/rsc-data/supabase';
import { AlertTriangle, Handshake, Plus, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

async function WelcomeHeading() {
  const [profile, { user }] = await Promise.all([
    getMyProfile(),
    getCachedLoggedInVerifiedSupabaseUser(),
  ]);
  const companyName =
    profile?.company_name?.trim() || user.email?.split('@')[0] || 'there';

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, {companyName}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here&apos;s what&apos;s happening with your solar pipeline.
        </p>
      </div>
      <Button asChild>
        <Link href="/leads/new">
          <Plus className="mr-1 h-4 w-4" />
          New Lead
        </Link>
      </Button>
    </div>
  );
}

async function StatsSection() {
  const stats = await getLeadStats();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatsCard title="Total leads" value={stats.total} icon={Users} />
      <StatsCard
        title="Negotiating"
        value={stats.negotiating}
        icon={Handshake}
        iconClassName="text-amber-400"
      />
      <StatsCard
        title="Ghosted (at risk)"
        value={stats.ghosted}
        icon={AlertTriangle}
        iconClassName="text-red-400"
      />
      <StatsCard
        title="Strategies this week"
        value={stats.strategiesThisWeek}
        icon={Sparkles}
        iconClassName="text-primary"
      />
    </div>
  );
}

async function RecentLeadsSection() {
  const leads = await getRecentLeads(5);
  return <RecentLeads leads={leads} />;
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <Suspense fallback={<Skeleton className="h-12 w-72" />}>
        <WelcomeHeading />
      </Suspense>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <RecentLeadsSection />
      </Suspense>
    </div>
  );
}
