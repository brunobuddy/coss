import { getRiskCalibration } from "@coss/risk";
import { MIN_CALIBRATION_FEEDBACK } from "@coss/risk/schemas";
import { getEnvironment } from "@coss/tenancy";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@coss/ui/components/table";
import { ScaleIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ModeBadge } from "@/components/email-badges";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { Stat, StatRow } from "@/components/stat-row";
import { requireOrgMember } from "@/lib/session";
import { ApplyWeightsButton } from "./weight-buttons";

export const metadata: Metadata = { title: "Risk calibration" };

const percent = (value: number | null) => (value === null ? "–" : `${Math.round(value * 100)}%`);
const weight = (value: number) => value.toFixed(2);

export default async function RiskCalibrationPage({
  params,
}: PageProps<"/[orgSlug]/[projectSlug]/[envSlug]/risk/calibration">) {
  const { orgSlug, projectSlug, envSlug } = await params;
  const { organization, can } = await requireOrgMember(orgSlug);
  if (!can({ risk: ["read"] })) notFound();
  const found = await getEnvironment({ organizationId: organization.id, projectSlug, envSlug });
  if (!found) notFound();
  const { project, environment } = found;
  const calibration = await getRiskCalibration({
    organizationId: organization.id,
    environmentId: environment.id,
  });
  const target = {
    orgSlug: organization.slug,
    projectSlug: project.slug,
    envSlug: environment.slug,
  };
  const canUpdate = can({ risk: ["update"] });
  const changes = Object.fromEntries(
    calibration.reasons
      .filter(
        (reason) => reason.suggested_weight !== null && reason.suggested_weight !== reason.weight,
      )
      .map((reason) => [reason.code, reason.suggested_weight]),
  );
  const changed = Object.keys(changes).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        actions={
          canUpdate && changed > 0 ? (
            <ApplyWeightsButton
              {...target}
              label={`Apply ${changed} suggested weight${changed === 1 ? "" : "s"}`}
              size="sm"
              variant="default"
              weights={changes}
            />
          ) : null
        }
        description={`What your feedback says about each reason and rule over the last ${calibration.window_days} days. Weights only change when you apply them.`}
        meta={<ModeBadge mode={environment.mode} />}
        title="Calibration"
      />

      <StatRow>
        <Stat label="Assessments" value={calibration.assessments.toLocaleString()} />
        <Stat
          detail={percent(
            calibration.assessments ? calibration.labeled / calibration.assessments : null,
          )}
          label="With feedback"
          value={calibration.labeled.toLocaleString()}
        />
        <Stat label="Reasons that fired" value={calibration.reasons.length} />
        <Stat label="Suggestions" value={changed} />
      </StatRow>

      <Panel
        footer={
          <span className="text-xs">
            A reason needs feedback on {MIN_CALIBRATION_FEEDBACK} assessments before a weight is
            suggested; until there's plenty, suggestions stay near the default. Feedback given
            mostly on reviews and blocks over-represents them: read precision as a guide.
          </span>
        }
        title="Reasons"
      >
        {calibration.reasons.length === 0 ? (
          <PanelBody flush>
            <EmptyState
              compact
              description="Once assessments come in and you send feedback on them, each reason's track record shows here."
              icon={ScaleIcon}
              title="Nothing to calibrate yet"
            />
          </PanelBody>
        ) : (
          <Table variant="card">
            <TableHeader>
              <TableRow>
                <TableHead>Reason</TableHead>
                <TableHead className="text-right">Fired</TableHead>
                <TableHead className="text-right">Fraud</TableHead>
                <TableHead className="text-right">Legitimate</TableHead>
                <TableHead className="text-right">Precision</TableHead>
                <TableHead className="text-right">Weight</TableHead>
                <TableHead className="text-right">Suggested</TableHead>
                {canUpdate ? <TableHead className="w-0" /> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {calibration.reasons.map((reason) => {
                const custom = reason.weight !== reason.default_weight;
                return (
                  <TableRow key={reason.code}>
                    <TableCell className="font-mono text-[0.8125rem]">{reason.code}</TableCell>
                    <TableCell className="text-right tabular-nums">{reason.fired}</TableCell>
                    <TableCell className="text-right tabular-nums">{reason.fraud}</TableCell>
                    <TableCell className="text-right tabular-nums">{reason.legitimate}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {percent(reason.precision)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {weight(reason.weight)}
                      {custom ? (
                        <span className="block text-muted-foreground text-xs">
                          default {weight(reason.default_weight)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {reason.suggested_weight === null ? "–" : weight(reason.suggested_weight)}
                    </TableCell>
                    {canUpdate ? (
                      <TableCell>
                        <span className="flex justify-end gap-2">
                          {reason.suggested_weight !== null &&
                          reason.suggested_weight !== reason.weight ? (
                            <ApplyWeightsButton
                              {...target}
                              label="Apply"
                              weights={{ [reason.code]: reason.suggested_weight }}
                            />
                          ) : null}
                          {custom ? (
                            <ApplyWeightsButton
                              {...target}
                              label="Reset"
                              variant="ghost"
                              weights={{ [reason.code]: null }}
                            />
                          ) : null}
                        </span>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>
    </div>
  );
}
