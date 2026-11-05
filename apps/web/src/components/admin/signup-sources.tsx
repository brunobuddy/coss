import { type SignupSourceCount, signupSourcesForAdmin } from "@coss/tenancy";
import { Panel, PanelBody } from "@/components/panel";

const WINDOW_DAYS = 30;

function SourceList({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: SignupSourceCount[];
  /** What a null value means in this list. */
  empty: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="font-medium text-sm">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {rows.map((row) => (
            <li className="flex justify-between gap-4" key={row.value ?? ""}>
              <span className={row.value ? "truncate" : "truncate text-muted-foreground"}>
                {row.value ?? empty}
              </span>
              <span className="text-muted-foreground tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Where new accounts first came from: the visit their browser remembered. */
export async function SignupSources() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const sources = await signupSourcesForAdmin({ since });
  return (
    <Panel>
      <PanelBody className="flex flex-col gap-4">
        <div>
          <h2 className="font-medium">Where sign-ups came from</h2>
          <p className="text-muted-foreground text-sm">
            Last {WINDOW_DAYS} days: {sources.attributed} of {sources.accounts} new accounts have a
            first visit on record. The rest were invited, finished on another device, or have Global
            Privacy Control on.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <SourceList empty="Unknown" rows={sources.byLanding} title="First page" />
          <SourceList empty="Direct" rows={sources.byReferrer} title="Referrer" />
          <SourceList empty="No campaign" rows={sources.byCampaignSource} title="Campaign source" />
        </div>
      </PanelBody>
    </Panel>
  );
}
