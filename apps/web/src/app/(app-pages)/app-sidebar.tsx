
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { getCachedLoggedInVerifiedSupabaseUser } from '@/rsc-data/supabase';
import Link from 'next/link';
import { Suspense } from 'react';
import { AppSidebarContent } from './app-sidebar-client';



async function SidebarHeaderContent() {
  'use cache'
  return <SidebarHeader className="p-2">
    <Link
      href="/dashboard"
      aria-label="RayCiprocity — Solar AI Copilot"
      className="block rounded-xl bg-white p-3 shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-rayci.png"
        alt="RayCiprocity — Solar AI Copilot"
        className="mx-auto h-auto w-[150px] max-w-full object-contain"
      />
    </Link>
  </SidebarHeader>

}



async function SidebarContentWrapper() {
  const { user } = await getCachedLoggedInVerifiedSupabaseUser();
  return <AppSidebarContent user={user} />
}


export async function AppSidebar() {
  return (
    <Sidebar variant="inset">
      <SidebarHeaderContent />
      <Suspense fallback={null}>
        <SidebarContentWrapper />
      </Suspense>
    </Sidebar>
  );
}
