'use client';

import { DeleteLeadButton } from '@/components/leads/delete-lead-button';
import { StatusBadge } from '@/components/leads/status-badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LEAD_STATUSES, formatCurrency, type LeadStatus } from '@/lib/solar';
import type { Table as DbTable } from '@/types';
import { format } from 'date-fns';
import { Eye, Plus, Search, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Lead = DbTable<'leads'>;

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const { t } = useTranslation('pages');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesTerm =
        !term ||
        lead.name.toLowerCase().includes(term) ||
        lead.email.toLowerCase().includes(term);
      const matchesStatus =
        statusFilter === 'all' || lead.status === statusFilter;
      return matchesTerm && matchesStatus;
    });
  }, [leads, search, statusFilter]);

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-muted">
            <Users className="size-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-medium">{t('leads.emptyTitle')}</p>
            <p className="text-sm text-muted-foreground">
              {t('leads.emptyDescription')}
            </p>
          </div>
          <Button asChild>
            <Link href="/leads/new">
              <Plus className="mr-1 h-4 w-4" />
              {t('leads.createLead')}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('leads.allLeads')}</CardTitle>
          <CardDescription>
            {t('leads.countSummary', { shown: filtered.length, total: leads.length })}
          </CardDescription>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('leads.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as LeadStatus | 'all')}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t('leads.filterByStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('leads.allStatuses')}</SelectItem>
              {LEAD_STATUSES.map((status) => (
                <SelectItem key={status} value={status} className="capitalize">
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('leads.colHomeowner')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('leads.colAddress')}</TableHead>
                <TableHead className="text-right">{t('leads.colMonthlyBill')}</TableHead>
                <TableHead>{t('leads.colStatus')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('leads.colCreated')}</TableHead>
                <TableHead className="text-right">{t('leads.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {t('leads.noMatch')}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium hover:underline"
                      >
                        {lead.name}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {lead.email}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {lead.address}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(Number(lead.monthly_bill))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={lead.status} />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {format(new Date(lead.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button asChild variant="ghost" size="icon">
                          <Link href={`/leads/${lead.id}`} aria-label={t('leads.viewLead')}>
                            <Eye className="h-4 w-4" />
                          </Link>
                        </Button>
                        <DeleteLeadButton
                          leadId={lead.id}
                          leadName={lead.name}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('leads.deleteLead')}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
