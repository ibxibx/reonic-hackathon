import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { StatusBadge } from '@/components/leads/status-badge';
import { formatCurrency } from '@/lib/solar';
import type { Table } from '@/types';
import { ArrowRight, Plus, Users } from 'lucide-react';
import Link from 'next/link';

export function RecentLeads({ leads }: { leads: Array<Table<'leads'>> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent leads</CardTitle>
          <CardDescription>Your 5 most recently added leads</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/leads">
            View all
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Users className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No leads yet</p>
              <p className="text-sm text-muted-foreground">
                Create your first lead to start generating strategies.
              </p>
            </div>
            <Button asChild>
              <Link href="/leads/new">
                <Plus className="mr-1 h-4 w-4" />
                Create your first lead
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {leads.map((lead) => (
              <li
                key={lead.id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{lead.name}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {lead.address}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="hidden text-sm text-muted-foreground sm:inline tabular-nums">
                    {formatCurrency(Number(lead.monthly_bill))}/mo
                  </span>
                  <StatusBadge status={lead.status} />
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/leads/${lead.id}`}>View</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
