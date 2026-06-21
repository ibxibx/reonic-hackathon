import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

export interface HomeFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface HomeFeaturesProps {
  features: HomeFeature[];
}

export function HomeFeatures({ features }: HomeFeaturesProps) {
  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">From quote sent to contract signed</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
            The AI-powered closing layer that sits on top of your solar quotes and turns silence into signatures
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <Card key={feature.title} className="border bg-card">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <feature.icon className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{feature.title}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
