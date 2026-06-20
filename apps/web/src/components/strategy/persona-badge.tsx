import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PERSONA_CONFIG, type Persona } from '@/lib/solar';

export function PersonaBadge({
  persona,
  className,
}: {
  persona: Persona | string;
  className?: string;
}) {
  const config = PERSONA_CONFIG[persona as Persona] ?? PERSONA_CONFIG.skeptic;
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
