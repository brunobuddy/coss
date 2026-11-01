"use client";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@coss/ui/components/tabs";
import type { ReactNode } from "react";

export type EmailTab = { value: string; label: ReactNode; content: ReactNode };

/** The email page's sections as tabs; the panels are rendered on the server. */
export function EmailTabs({ tabs }: { tabs: EmailTab[] }) {
  return (
    <Tabs className="gap-4" defaultValue={tabs[0]?.value}>
      <div className="-mx-1 overflow-x-auto">
        <TabsList variant="underline">
          {tabs.map((tab) => (
            <TabsTab key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTab>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsPanel className="flex flex-col gap-6" key={tab.value} value={tab.value}>
          {tab.content}
        </TabsPanel>
      ))}
    </Tabs>
  );
}
