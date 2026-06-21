import { Separator } from '@/components/ui/separator';
import { T } from '@/components/ui/Typography';
import { Github } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import Link from 'next/link';

const Footer = () => {
  return (
    <footer className="bg-muted/50 py-8 sm:py-12">
      <div className="container mx-auto px-4 md:px-6">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 pb-12 md:pb-16">
          <div className="space-y-4">
            <Link href="/" className="flex items-center space-x-2">
              <Image
                src="/logo-rayci.png"
                width={32}
                height={32}
                alt="RayCiprocity Logo"
              />
              <T.H3 className="text-xl">RayCiprocity</T.H3>
            </Link>
            <T.P className="text-sm text-muted-foreground">
              AI Sales Copilot for renewable solar installers. Turn every quote into a closing deal.
            </T.P>
          </div>

          <div className="space-y-4">
            <T.H4 className="text-sm font-semibold uppercase">Product</T.H4>
            <nav className="flex flex-col space-y-2.5">
              <Link
                href="/about"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                About
              </Link>
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Dashboard
              </Link>
            </nav>
          </div>

          <div className="space-y-4">
            <T.H4 className="text-sm font-semibold uppercase">Open Source</T.H4>
            <nav className="flex flex-col space-y-2.5">
              <Link
                href="https://github.com/ibxibx/reonic-hackathon"
                target="_blank"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                <Github className="h-3.5 w-3.5" />
                GitHub
              </Link>
            </nav>
          </div>
        </div>

        <Separator className="my-6 lg:my-8" />

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <T.Small className="text-muted-foreground">
            Built at {'{Tech:Europe}'} AI x Energy Hackathon, Berlin 2026
          </T.Small>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link
                href="https://github.com/ibxibx/reonic-hackathon"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <Github className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
