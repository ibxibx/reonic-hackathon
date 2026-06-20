import { ProfileForm } from '@/components/settings/profile-form';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ModeToggle } from '@/components/ui/mode-toggle';
import { Separator } from '@/components/ui/separator';
import { getMyProfile } from '@/data/user/profile';
import { getIntegrationStatus } from '@/lib/integration-status';
import { getCachedLoggedInVerifiedSupabaseUser } from '@/rsc-data/supabase';
import { cn } from '@/lib/utils';

export default async function SettingsPage() {
  const [profile, { user }, integrations] = await Promise.all([
    getMyProfile(),
    getCachedLoggedInVerifiedSupabaseUser(),
    Promise.resolve(getIntegrationStatus()),
  ]);

  const email = user.email ?? '';

  const integrationRows: { name: string; connected: boolean; note: string }[] = [
    {
      name: 'Anthropic (Claude)',
      connected: integrations.anthropic,
      note: integrations.anthropic ? 'Connected' : 'Not configured',
    },
    {
      name: 'ElevenLabs',
      connected: integrations.elevenlabs,
      note: integrations.elevenlabs ? 'Connected' : 'Not configured',
    },
    {
      name: 'Resend (Email)',
      connected: !integrations.emailMock,
      note: integrations.emailMock ? 'Simulated (mock)' : 'Connected',
    },
    {
      name: 'Twilio (SMS)',
      connected: !integrations.smsMock,
      note: integrations.smsMock ? 'Simulated (mock)' : 'Connected',
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-3xl w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your profile, integrations and preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your company and account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProfileForm companyName={profile?.company_name ?? ''} />
          <Separator />
          <div className="space-y-1">
            <Label>Account email</Label>
            <p className="text-sm text-muted-foreground">{email || 'Unknown'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integrations</CardTitle>
          <CardDescription>
            Status of the services that power RayCiprocity.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {integrationRows.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
            >
              <span className="text-sm font-medium">{row.name}</span>
              <Badge
                variant="outline"
                className={cn(
                  'font-medium',
                  row.connected
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-muted text-muted-foreground border-border'
                )}
              >
                {row.note}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Appearance and display options.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Theme</Label>
            <p className="text-sm text-muted-foreground">
              Toggle between light and dark mode.
            </p>
          </div>
          <ModeToggle />
        </CardContent>
      </Card>
    </div>
  );
}
