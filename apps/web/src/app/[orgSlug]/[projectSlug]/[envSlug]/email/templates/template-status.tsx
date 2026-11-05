import { StatusDot } from "@/components/status-dot";

/** Published version and whether the draft has changes since. */
export function TemplateStatus(props: {
  publishedVersion: number | null;
  hasUnpublishedChanges: boolean;
}) {
  if (props.publishedVersion === null) return <StatusDot tone="neutral">Draft only</StatusDot>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      <StatusDot tone="success">Published v{props.publishedVersion}</StatusDot>
      {props.hasUnpublishedChanges ? (
        <StatusDot tone="warning">Unpublished changes</StatusDot>
      ) : null}
    </span>
  );
}
