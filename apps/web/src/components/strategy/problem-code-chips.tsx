'use client';

import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  PROBLEM_CODE_FAMILY_STYLES,
  PROBLEM_CODE_LIBRARY,
  type ProblemCode,
} from '@/lib/problem-codes';

type ProblemCodeDiagnosis = {
  code: string;
  confidence: number;
  evidence: string;
};

export function ProblemCodeChips({
  codes,
}: {
  codes: ProblemCodeDiagnosis[];
}) {
  if (codes.length === 0) return null;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap gap-1.5">
        {codes.map((diagnosis) => {
          if (!(diagnosis.code in PROBLEM_CODE_LIBRARY)) return null;
          const problemCode = diagnosis.code as ProblemCode;
          const definition = PROBLEM_CODE_LIBRARY[problemCode];

          return (
            <Tooltip key={`${diagnosis.code}-${diagnosis.evidence}`}>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={PROBLEM_CODE_FAMILY_STYLES[definition.family]}
                >
                  {definition.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs space-y-1.5 p-3">
                <p className="font-medium">
                  {definition.label}{' '}
                  <span className="font-mono text-muted-foreground">
                    ({diagnosis.code})
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {definition.counterStrategy}
                </p>
                <p className="text-xs">Evidence: {diagnosis.evidence}</p>
                <p className="text-xs text-muted-foreground">
                  Confidence: {Math.round(diagnosis.confidence * 100)}%
                </p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
