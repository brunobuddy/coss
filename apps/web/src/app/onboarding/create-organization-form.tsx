"use client";

import { slugify, validateOrgSlug } from "@coss/auth/slugs";
import { Button } from "@coss/ui/components/button";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@coss/ui/components/card";
import { Field, FieldDescription, FieldLabel } from "@coss/ui/components/field";
import { Input } from "@coss/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@coss/ui/components/input-group";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { FormError } from "@/components/form-error";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { toast } from "@/lib/toast";
import { createFirstProjectAction } from "./actions";

/** `next`: where to go once it exists (the CLI's approval page, the plans page), else its home. */
export function CreateOrganizationForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  // Keep deriving the slug from the name until the user edits the slug themselves.
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slugError = validateOrgSlug(slug);
    if (slugError) {
      setError(slugError);
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.organization.create({ name: name.trim(), slug });
    if (error) {
      setError(authErrorMessage(error, "Could not create the organization."));
      setPending(false);
      return;
    }
    toast.success(`${name.trim()} created`);
    // A failure here isn't one for the user: `/<org>` offers to create the project instead.
    const setup = new FormData();
    setup.set("orgSlug", slug);
    await createFirstProjectAction(null, setup).catch((failure) => console.error(failure));
    router.push(next ?? `/${slug}`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create an organization</CardTitle>
        <CardDescription>
          Organizations own projects, API keys and members. Yours starts with a project.
        </CardDescription>
      </CardHeader>
      <CardPanel>
        {/* method="post": a submit before hydration must never put credentials in the URL. */}
        <form className="flex flex-col gap-4" method="post" onSubmit={onSubmit}>
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input
              maxLength={64}
              name="name"
              onChange={(event) => {
                setName(event.target.value);
                if (!slugEdited) setSlug(slugify(event.target.value));
              }}
              placeholder="Acme"
              required
              value={name}
            />
          </Field>
          <Field>
            <FieldLabel>URL</FieldLabel>
            <InputGroup>
              <InputGroupAddon>
                <InputGroupText>coss.com/</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                maxLength={48}
                name="slug"
                onChange={(event) => {
                  setSlugEdited(true);
                  setSlug(event.target.value.toLowerCase());
                }}
                placeholder="acme"
                required
                value={slug}
              />
            </InputGroup>
            <FieldDescription>Lowercase letters, numbers and dashes.</FieldDescription>
          </Field>
          <FormError message={error} />
          <Button loading={pending} type="submit">
            Create organization
          </Button>
        </form>
      </CardPanel>
    </Card>
  );
}
