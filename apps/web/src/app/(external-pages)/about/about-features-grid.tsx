import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { T } from '@/components/ui/Typography';
import {
  Brain,
  Mail,
  Mic,
  RefreshCw,
  Target,
  TrendingUp,
} from 'lucide-react';

export function AboutFeaturesGrid() {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <T.H2 className="text-3xl">How It Works</T.H2>
        <T.P className="text-muted-foreground">
          From quote to contract — AI handles the follow-up your team doesn't have time for
        </T.P>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Persona Detection</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Classifies each homeowner into one of four archetypes — family, investor, environmentalist, or skeptic — to tailor every message.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-2/10">
                <Brain className="h-6 w-6 text-chart-2" />
              </div>
              <CardTitle>Problem-Code Diagnosis</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              A 40-code taxonomy across 7 families identifies exactly why a deal is stuck — price shock, trust issues, timing, and more.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <CardTitle>Multi-Channel Strategy</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Generates a coherent outreach plan across email, SMS, call scripts, and voice notes — each step with timing and rationale.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-4/10">
                <Mic className="h-6 w-6 text-chart-4" />
              </div>
              <CardTitle>AI Voice Notes</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Personalized voice notes synthesized via ElevenLabs deliver human warmth at scale — the most memorable touch in the sequence.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-1/10">
                <TrendingUp className="h-6 w-6 text-chart-1" />
              </div>
              <CardTitle>Oracle Predictions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Sign-vs-ghost scoring with evidence and a single recommended next action — so you know which leads need attention now.
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-chart-5/10">
                <RefreshCw className="h-6 w-6 text-chart-5" />
              </div>
              <CardTitle>Auto-Pivot on Reply</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>
              When a customer replies with an objection, every unsent message rewrites itself to address their specific concern automatically.
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
