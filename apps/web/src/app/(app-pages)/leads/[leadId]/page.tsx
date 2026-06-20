import { DeleteLeadButton } from '@/components/leads/delete-lead-button';
import { StatusBadge } from '@/components/leads/status-badge';
import { GenerateStrategyButton } from '@/components/strategy/generate-strategy-button';
import { PersonaBadge } from '@/components/strategy/persona-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  getLeadWithQuote,
  getStrategyForLead,
} from '@/data/user/leads-read';
import {
  FINANCING_TYPE_LABELS,
  ROOF_TYPE_LABELS,
  formatCurrency,
  type FinancingType,
  type RoofType,
} from '@/lib/solar';
import {
  ArrowLeft,
  ArrowRight,
  DollarSign,
  Home,
  Mail,
  MapPin,
  Phone,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export default async function LeadDetailPage(props: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await props.params;

  let lead;
  let quote;
  try {
    const result = await getLeadWithQuote(leadId);
    lead = result.lead;
    quote = result.quote;
  } catch {
    notFound();
  }

  const strategy = await getStrategyForLead(leadId);
  const confidence = strategy?.persona_confidence ?? null;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-5xl w-full">
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

      {/* Hero */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {lead.name}
            </h1>
            <StatusBadge status={lead.status} />
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Mail className="h-4 w-4" /> {lead.email}
            </span>
            <span className="flex items-center gap-1.5">
              <Phone className="h-4 w-4" /> {lead.phone}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {lead.address}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {strategy ? (
            <Button asChild variant="outline">
              <Link href={`/leads/${leadId}/strategy`}>
                View strategy
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
          <GenerateStrategyButton
            leadId={leadId}
            hasStrategy={Boolean(strategy)}
            redirectToStrategy={!strategy}
          />
          <DeleteLeadButton
            leadId={leadId}
            leadName={lead.name}
            redirectTo="/leads"
          />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Property + bill */}
        <Card>
          <CardHeader>
            <CardTitle>Property</CardTitle>
            <CardDescription>Homeowner & energy profile</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Field
              icon={<Home className="h-4 w-4" />}
              label="Roof type"
              value={
                lead.roof_type
                  ? (ROOF_TYPE_LABELS[lead.roof_type as RoofType] ??
                    lead.roof_type)
                  : 'Unknown'
              }
            />
            <Field
              icon={<DollarSign className="h-4 w-4" />}
              label="Monthly bill"
              value={`${formatCurrency(Number(lead.monthly_bill))}/mo`}
            />
          </CardContent>
        </Card>

        {/* Quote */}
        <Card>
          <CardHeader>
            <CardTitle>Quote</CardTitle>
            <CardDescription>Proposed solar system</CardDescription>
          </CardHeader>
          <CardContent>
            {quote ? (
              <div className="grid grid-cols-2 gap-4">
                <Field
                  icon={<Zap className="h-4 w-4" />}
                  label="System size"
                  value={`${Number(quote.system_size_kw)} kW`}
                />
                <Field
                  icon={<DollarSign className="h-4 w-4" />}
                  label="Total cost"
                  value={formatCurrency(Number(quote.total_cost))}
                />
                <Field
                  label="Financing"
                  value={
                    FINANCING_TYPE_LABELS[
                      quote.financing_type as FinancingType
                    ] ?? quote.financing_type
                  }
                />
                {quote.notes ? (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{quote.notes}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No quote attached to this lead.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Strategy */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Strategy</CardTitle>
            <CardDescription>
              AI-detected persona & closing approach
            </CardDescription>
          </div>
          {strategy ? <PersonaBadge persona={strategy.persona_detected} /> : null}
        </CardHeader>
        <CardContent>
          {strategy ? (
            <div className="space-y-4">
              {confidence !== null ? (
                <div className="space-y-1.5 max-w-sm">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Confidence</span>
                    <span className="font-medium tabular-nums">
                      {Math.round(Number(confidence) * 100)}%
                    </span>
                  </div>
                  <Progress value={Number(confidence) * 100} />
                </div>
              ) : null}

              {strategy.signals && strategy.signals.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {strategy.signals.map((signal, i) => (
                    <Badge key={i} variant="secondary" className="font-normal">
                      {signal}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <p className="text-sm leading-relaxed">
                {strategy.strategy_summary}
              </p>

              <Button asChild variant="outline" size="sm">
                <Link href={`/leads/${leadId}/strategy`}>
                  View full strategy & timeline
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                No strategy generated yet. Let AI analyze this lead and build a
                multi-channel closing plan.
              </p>
              <GenerateStrategyButton leadId={leadId} redirectToStrategy />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  );
}
