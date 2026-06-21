'use client';

import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Home } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';

const segmentKeys: Record<string, string> = {
    dashboard: 'dashboard',
    leads: 'leads',
    settings: 'settings',
    'private-items': 'privateItems',
    'private-item': 'privateItem',
    item: 'item',
    new: 'new',
    voice: 'voice',
    strategy: 'strategy',
};

export function DynamicBreadcrumb() {
    const pathname = usePathname();
    const { t } = useTranslation('pages');
    const segments = pathname.split('/').filter(Boolean);

    if (segments.length === 0) {
        return (
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbPage>{t('breadcrumb.home')}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>
        );
    }

    return (
        <Breadcrumb>
            <BreadcrumbList>
                <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                        <Link href="/dashboard" className="flex items-center gap-1">
                            <Home className="h-3.5 w-3.5" />
                            <span>{t('breadcrumb.home')}</span>
                        </Link>
                    </BreadcrumbLink>
                </BreadcrumbItem>
                {segments.map((segment, index) => {
                    const isLast = index === segments.length - 1;
                    const href = '/' + segments.slice(0, index + 1).join('/');
                    const labelKey = segmentKeys[segment];
                    const label = labelKey ? t(`breadcrumb.${labelKey}`) : segment;

                    // Skip UUID segments in breadcrumb display
                    const isUUID =
                        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                            segment
                        );
                    if (isUUID && !isLast) return null;

                    return (
                        <div key={segment + index} className="flex items-center gap-1">
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                {isLast ? (
                                    <BreadcrumbPage>{isUUID ? t('breadcrumb.details') : label}</BreadcrumbPage>
                                ) : (
                                    <BreadcrumbLink asChild>
                                        <Link href={href}>{label}</Link>
                                    </BreadcrumbLink>
                                )}
                            </BreadcrumbItem>
                        </div>
                    );
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}
