import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  LEAD_STATUS_CONFIG,
  MESSAGE_STATUS_CONFIG,
  type LeadStatus,
  type MessageStatus,
} from '@/lib/solar';

export function StatusBadge({
  status,
  className,
}: {
  status: LeadStatus | string;
  className?: string;
}) {
  const config =
    LEAD_STATUS_CONFIG[status as LeadStatus] ?? LEAD_STATUS_CONFIG.new;
  return (
    <Badge
      variant="outline"
      className={cn('font-medium capitalize', config.className, className)}
    >
      {config.label}
    </Badge>
  );
}

export function MessageStatusBadge({
  status,
  className,
}: {
  status: MessageStatus | string;
  className?: string;
}) {
  const config =
    MESSAGE_STATUS_CONFIG[status as MessageStatus] ??
    MESSAGE_STATUS_CONFIG.draft;
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
