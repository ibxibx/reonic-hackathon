'use client';

import { useTransition } from 'react';
import { useTranslation } from 'react-i18next';
import { Languages, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { setClientLanguage } from '@/i18n/client';
import { setLocaleAction } from '@/i18n/set-locale-action';
import { languages, languageNames, type Locale } from '@/i18n/settings';

export function LanguageSwitcher({ variant = 'icon' }: { variant?: 'icon' | 'full' }) {
  const { i18n } = useTranslation();
  const [isPending, startTransition] = useTransition();
  const current = (i18n.language as Locale) ?? 'en';

  function changeTo(locale: Locale) {
    setClientLanguage(locale);
    startTransition(async () => {
      await setLocaleAction(locale);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={variant === 'icon' ? 'icon' : 'sm'}
          disabled={isPending}
          className="gap-2"
        >
          <Languages className="h-4 w-4" />
          {variant === 'full' && <span>{languageNames[current]}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {languages.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => changeTo(locale)}
            className="gap-2"
          >
            <Check
              className={`h-4 w-4 ${current === locale ? 'opacity-100' : 'opacity-0'}`}
            />
            {languageNames[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
