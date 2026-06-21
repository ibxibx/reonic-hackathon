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
import { LanguageSwitcher } from '@/components/language-switcher';
import { getServerTranslation } from '@/i18n/server';

export default async function SettingsPage() {
  const [profile, { user }, integrations, { t }] = await Promise.all([
    getMyProfile(),
    getCachedLoggedInVerifiedSupabaseUser(),
    Promise.resolve(getIntegrationStatus()),
    getServerTranslation('pages'),
  ]);

  const email = user.email ?? '';

  const integrationRows: { name: string; connected: boolean; note: string }[] = [
    {
      name: 'OpenAI',
      connected: integrations.openai,
      note: integrations.openai ? t('settings.connected') : t('settings.notConfigured'),
    },
    {
      name: 'ElevenLabs',
      connected: integrations.elevenlabs,
      note: integrations.elevenlabs ? t('settings.connected') : t('settings.notConfigured'),
    },
    {
      name: 'Resend (Email)',
      connected: !integrations.emailMock,
      note: integrations.emailMock ? t('settings.simulated') : t('settings.connected'),
    },
    {
      name: 'Twilio (SMS)',
      connected: !integrations.smsMock,
      note: integrations.smsMock ? t('settings.simulated') : t('settings.connected'),
    },
  ];

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 max-w-3xl w-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('settings.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.profileTitle')}</CardTitle>
          <CardDescription>{t('settings.profileDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProfileForm companyName={profile?.company_name ?? ''} />
          <Separator />
          <div className="space-y-1">
            <Label>{t('settings.accountEmail')}</Label>
            <p className="text-sm text-muted-foreground">{email || t('settings.unknown')}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.integrationsTitle')}</CardTitle>
          <CardDescription>
            {t('settings.integrationsDescription')}
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
          <CardTitle>{t('settings.preferencesTitle')}</CardTitle>
          <CardDescription>{t('settings.preferencesDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>{t('settings.theme')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.themeDescription')}
            </p>
          </div>
          <ModeToggle />
        </CardContent>
        <CardContent className="flex items-center justify-between border-t pt-6">
          <div className="space-y-0.5">
            <Label>{t('settings.languageSection')}</Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.languageDescription')}
            </p>
          </div>
          <LanguageSwitcher variant="full" />
        </CardContent>
      </Card>
    </div>
  );
}
