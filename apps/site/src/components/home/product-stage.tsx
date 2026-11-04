"use client";
import { Card, CardFrame } from "@coss/ui/components/card";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import { KeyRoundIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Play } from "@/components/marketing/demo";
import { productVisual } from "@/lib/product-visuals";

export interface StageTab {
  slug: string;
  name: string;
  code: ReactNode;
  stage: ReactNode;
  /** What the call answers, abridged, under a short sample. */
  response?: string;
}

/**
 * The home page's signature: pick a product, and the code and the interface change while the key
 * above them doesn't. Every panel stays mounted, so all of it is in the page without script.
 */
export function ProductStage({ tabs }: { tabs: readonly StageTab[] }) {
  return (
    <Tabs defaultValue={tabs[0]?.slug}>
      <CardFrame className="w-full min-w-0 shadow-[0_32px_64px_-32px] shadow-black/24 dark:shadow-black/64">
        <div className="relative flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-2 py-2">
          <div className="-mx-1 min-w-0 max-w-full overflow-x-auto px-1">
            <TabsList>
              {tabs.map((tab) => {
                const { icon: Icon } = productVisual(tab.slug);
                return (
                  <TabsTab key={tab.slug} value={tab.slug}>
                    <Icon aria-hidden />
                    {tab.name}
                  </TabsTab>
                );
              })}
            </TabsList>
          </div>
          <div className="flex items-center gap-2 px-2">
            <span className="flex items-center gap-1.5 font-mono text-muted-foreground text-xs">
              <KeyRoundIcon aria-hidden className="size-3.5" />
              coss_test_••••••••
            </span>
            <span className="text-muted-foreground text-xs max-sm:hidden">the same key</span>
          </div>
        </div>
        <Card className="min-w-0 overflow-hidden">
          {tabs.map((tab) => (
            <TabsPanel
              className="grid min-w-0 lg:min-h-104 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]"
              keepMounted
              key={tab.slug}
              value={tab.slug}
            >
              <div
                className="stage-code flex min-w-0 flex-col justify-between border-b lg:border-e lg:border-b-0"
                data-tone={productVisual(tab.slug).tone}
              >
                <div className="min-h-0">{tab.code}</div>
                {tab.response ? (
                  <div className="border-t px-4 py-3">
                    <p className="pb-1.5 text-muted-foreground text-xs">Response, abridged</p>
                    <pre className="overflow-x-auto font-mono text-[0.8125rem] text-muted-foreground leading-relaxed">
                      {tab.response}
                    </pre>
                  </div>
                ) : null}
              </div>
              <div className="min-w-0 p-4 sm:p-5">
                <Play>{tab.stage}</Play>
              </div>
            </TabsPanel>
          ))}
        </Card>
      </CardFrame>
    </Tabs>
  );
}
