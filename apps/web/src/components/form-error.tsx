import { Alert, AlertDescription } from "@coss/ui/components/alert";

/** Inline error for a form or action result; renders nothing without a message. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <Alert className="enter-rise" variant="error">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
