# Reference
## Environment
<details><summary><code>client.Environment.Get() -> *coss.Environment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Which environment, project and organization the API key belongs to, and the key itself. Any valid key can read its own environment (no permission needed): use it to check a key, show where it sends and what it may do.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Environment.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## APIKey
<details><summary><code>client.APIKey.Revoke() -> *coss.DeletedAPIKey</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Revokes the API key making this request, at once: every later request with it fails with `invalid_api_key`. `coss logout --revoke` uses it. Other keys are revoked in the dashboard.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.APIKey.Revoke(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email
<details><summary><code>client.Email.List() -> *coss.EmailSummaryList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Emails sent from the API key's environment, newest first, without their content (retrieve an email for `html`, `text`, `headers` and `attachments`). Filter by recipient (`to`), by the email's or a recipient's status, by category, batch or creation time. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListEmailRequest{
    To: coss.String(
        "user@example.com",
    ),
}
client.Email.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**to:** `*string` — Only emails with this recipient (in `to`, `cc` or `bcc`; the bare address, any case).
    
</dd>
</dl>

<dl>
<dd>

**recipientStatus:** `*string` — Only emails with a recipient in one of these statuses, comma-separated: `bounced,complained`. With `to`, that recipient's status.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*string` — Only emails in these statuses, comma-separated: `failed`.
    
</dd>
</dl>

<dl>
<dd>

**q:** `*string` — Free text, matched against the subject and the `to` addresses.
    
</dd>
</dl>

<dl>
<dd>

**category:** `*string` — Only emails of this category.
    
</dd>
</dl>

<dl>
<dd>

**batchID:** `*string` — Only the emails of this batch.
    
</dd>
</dl>

<dl>
<dd>

**subaccount:** `*string` — Only the emails sent for this sub-account (its id or your uid).
    
</dd>
</dl>

<dl>
<dd>

**createdAfter:** `*time.Time` — Only emails created at or after this time.
    
</dd>
</dl>

<dl>
<dd>

**createdBefore:** `*time.Time` — Only emails created before this time.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last email of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Send(request) -> *coss.Email</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Queues an email from the API key's environment and returns it with `status: "queued"`; it is handed to the delivery provider moments later. Follow it with `GET /v1/emails/{id}` or the `email.sent` / `email.failed` webhooks. Live (`coss_live_…`) keys must send from a verified domain of the organization. Sandbox (`coss_test_…`) keys accept any `from` and never deliver anything; the response has `sandbox: true`. Recipients on the environment's suppression list (for every email, or for the email's `category`) are skipped and get the status `suppressed`. With a future `scheduled_at` the email is stored with the status `scheduled` and sent at that time; the domain and the suppression list are checked again then. Attachments are base64-encoded; only metadata is kept after sending. Recipients count against the organization's send quota (per second and per day; sandbox environments have their own daily quota). With open or click tracking on (the environment's settings, or `tracking`), the HTML body is delivered with a tracking pixel and/or links rewritten to coss.com redirects; the stored `html` stays as sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.SendEmailBody{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Body: &coss.SendEmailRequest{
        From: "Acme <onboarding@acme.com>",
        To: &coss.SendEmailRequestTo{
            String: "user@example.com",
        },
        Subject: coss.String(
            "Welcome to Acme",
        ),
        HTML: coss.String(
            "<p>Thanks for signing up!</p>",
        ),
        Tags: []*coss.SendEmailRequestTagsItem{
            &coss.SendEmailRequestTagsItem{
                Name: "template",
                Value: "welcome",
            },
        },
        Category: coss.String(
            "onboarding",
        ),
    },
}
client.Email.Send(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original email (with its current status) instead of sending again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**request:** `*coss.SendEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.SendBatch(request) -> *coss.EmailBatch</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Queues up to 100 emails in one request. Each email is handled exactly as by `POST /v1/emails` (sender checks, suppressions, scheduling, attachments, tracking), but the batch is all or nothing: if any email is invalid, or any `from` is not a verified domain (live keys), nothing is stored and the error names the email (e.g. `emails.3.to`). One `Idempotency-Key` covers the whole batch. The emails' recipients are charged against the send quota together, so a batch with more recipients than the quota allows at once is refused (`quota_exceeded` without `Retry-After`): split it. The request body shares the 40 MB limit of a single send.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.SendEmailBatchRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Emails: []*coss.SendEmailRequest{
        &coss.SendEmailRequest{
            From: "Acme <notifications@acme.com>",
            To: &coss.SendEmailRequestTo{
                String: "ada@example.com",
            },
            Subject: coss.String(
                "Your weekly summary",
            ),
            HTML: coss.String(
                "<p>Hi Ada, here is your week.</p>",
            ),
            Category: coss.String(
                "digest",
            ),
        },
        &coss.SendEmailRequest{
            From: "Acme <notifications@acme.com>",
            To: &coss.SendEmailRequestTo{
                String: "grace@example.com",
            },
            Subject: coss.String(
                "Your weekly summary",
            ),
            HTML: coss.String(
                "<p>Hi Grace, here is your week.</p>",
            ),
            Category: coss.String(
                "digest",
            ),
        },
    },
}
client.Email.SendBatch(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original email (with its current status) instead of sending again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**emails:** `[]*coss.SendEmailRequest` — Up to 100 emails, each accepted by `POST /v1/emails`. The batch is accepted or rejected as a whole.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.GetBatch(ID) -> *coss.EmailBatch</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A batch sent with `POST /v1/emails/batch`, with its emails' current statuses in the order of the request. Emails past the data retention period are left out. Only batches sent from the API key's own environment can be retrieved.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetBatchEmailRequest{
    ID: "batch_01k8d0n6x5f3w2e1r9t7y4u6i8",
}
client.Email.GetBatch(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The batch's id (`batch_id` of its emails).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Get(ID) -> *coss.Email</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Only emails sent from the API key's own environment can be retrieved.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetEmailRequest{
    ID: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The email's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Cancel(ID) -> *coss.Email</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cancels an email sent with a future `scheduled_at` before it is sent. Canceling an already canceled email returns it unchanged. To send it at another time, reschedule it instead.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CancelEmailRequest{
    ID: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Cancel(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The email's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Reschedule(ID, request) -> *coss.Email</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Moves an email sent with a future `scheduled_at` to a new time, at most 30 days from now, and records an `email.rescheduled` event. A time that is not in the future sends it within seconds. Rescheduling to the time it already has returns it unchanged. The domain and the suppression list are still checked when it is sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.RescheduleEmailRequest{
    ID: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ScheduledAt: coss.MustParseDateTime(
        "2026-10-12T09:00:00Z",
    ),
}
client.Email.Reschedule(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The email's id.
    
</dd>
</dl>

<dl>
<dd>

**scheduledAt:** `time.Time` — The new time to send the email at (ISO 8601 with an offset, at most 30 days ahead). A time that is not in the future sends it right away.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.ListEvents(ID) -> *coss.EmailEventList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every delivery event of the email, oldest first: `email.scheduled`, `email.rescheduled`, `email.canceled`, `email.sent` and `email.failed` for the whole email, and `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained` and `email.suppressed` (skipped because of the suppression list) per recipient, plus `email.opened` and `email.clicked` when tracking is on (attributed to a recipient only when the email had a single one) and `email.unsubscribed` after a one-click unsubscribe.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListEventsEmailRequest{
    ID: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.ListEvents(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The email's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.ListLinks(ID) -> *coss.EmailLinkList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The links coss.com rewrote for click tracking, in the order they appear in the HTML, with their click counts. Empty unless the email was sent with click tracking.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListLinksEmailRequest{
    ID: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.ListLinks(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The email's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains
<details><summary><code>client.Domains.List() -> *coss.DomainList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every domain of the organization, ordered by name. Domains belong to the organization, not to one environment, so every API key of the organization sees the same domains.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListDomainsRequest{}
client.Domains.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `*string` — Only this sub-account's domains (its id or your uid).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Create(request) -> *coss.Domain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Claims the domain for the organization and returns the DNS records to publish. Domains belong to the organization, not to one environment, so every API key of the organization sees the same domains. The records are checked repeatedly in the background and verification gives up after 72 hours; until the domain is `verified`, live keys cannot send from it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateDomainRequest{
    Name: "acme.com",
}
client.Domains.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — The domain to send from, without a scheme or path. Subdomains are allowed; internationalized domains must be punycode-encoded.
    
</dd>
</dl>

<dl>
<dd>

**subaccount:** `*string` — Add it for one of your live sub-accounts (its id or your uid): only that sub-account sends from it, through its own reputation.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Get(ID) -> *coss.Domain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The domain with the result of the last DNS check, so you can show which records are still missing or mismatched.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetDomainsRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Domains.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Delete(ID) -> *coss.DeletedDomain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the domain and its provider identity. Emails already sent are unaffected, but live keys can no longer send from it and the name becomes available again.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.DeleteDomainsRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Domains.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Update(ID, request) -> *coss.Domain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Shares one of the organization's own domains with its sub-accounts (they may then send from it, through the organization's reputation), or stops sharing it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.UpdateDomainRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
    SharedWithSubaccounts: true,
}
client.Domains.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**sharedWithSubaccounts:** `bool` — Let your sub-accounts send from this domain of yours (through your organization's reputation).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Verify(ID) -> *coss.Domain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Asks the delivery provider and DNS about the domain immediately instead of waiting for the next background check, and returns the updated domain. A `failed` domain starts verification over with fresh DKIM records, which have to be published again. Its tracking domain, if any, is checked too (and set up again if it `failed`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.VerifyDomainsRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Domains.Verify(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Webhook endpoints
<details><summary><code>client.WebhookEndpoints.List() -> *coss.WebhookEndpointList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every endpoint of the API key's environment, oldest first. Webhook endpoints belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox endpoints, and a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.WebhookEndpoints.List(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Create(request) -> *coss.WebhookEndpointWithSecret</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Registers a URL that receives signed event notifications. Webhook endpoints belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox endpoints, and a `coss_live_…` key only production ones. The response carries the signing secret, which is returned only here and when it is rolled: store it, and verify every delivery with it (`verifyWebhook` in the SDK).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateWebhookEndpointRequest{
    URL: "https://example.com/webhooks/coss",
    Description: coss.String(
        "Production receiver",
    ),
    EventTypes: []coss.CreateWebhookEndpointRequestEventTypesItem{
        coss.CreateWebhookEndpointRequestEventTypesItemEmailSent,
        coss.CreateWebhookEndpointRequestEventTypesItemEmailDelivered,
    },
}
client.WebhookEndpoints.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**url:** `string` — An `https://` URL coss.com posts events to.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — A note for your own reference. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**eventTypes:** `[]coss.CreateWebhookEndpointRequestEventTypesItem` — Event types delivered to this endpoint. An empty array means every event type, including ones added later. Defaults to every event type.
    
</dd>
</dl>

<dl>
<dd>

**apiVersion:** `*coss.CreateWebhookEndpointRequestAPIVersion` — The API version (`Coss-Version`) events are rendered in for this endpoint. Each event carries it as `api_version`. Defaults to the version of the request that creates the endpoint.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Get(ID) -> *coss.WebhookEndpoint</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The endpoint without its signing secret, which is only returned when created or rolled.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetWebhookEndpointsRequest{
    ID: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.WebhookEndpoints.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook endpoint's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Delete(ID) -> *coss.DeletedWebhookEndpoint</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the endpoint and its delivery log. Deliveries already queued for it are dropped. To stop deliveries temporarily, set `enabled` to `false` instead.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.DeleteWebhookEndpointsRequest{
    ID: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.WebhookEndpoints.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook endpoint's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Update(ID, request) -> *coss.WebhookEndpoint</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the URL, description, subscribed event types, API version or `enabled` flag. Omitted fields keep their current value, and the signing secret stays the same (see Roll a signing secret), so receivers keep verifying deliveries. Disabling an endpoint stops deliveries without losing its configuration.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.UpdateWebhookEndpointRequest{
    ID: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Enabled: coss.Bool(
        false,
    ),
}
client.WebhookEndpoints.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**url:** `*string` — An `https://` URL coss.com posts events to.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — A note for your own reference. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**eventTypes:** `[]coss.UpdateWebhookEndpointRequestEventTypesItem` — Event types delivered to this endpoint. An empty array means every event type, including ones added later.
    
</dd>
</dl>

<dl>
<dd>

**apiVersion:** `*coss.UpdateWebhookEndpointRequestAPIVersion` — The API version (`Coss-Version`) events are rendered in for this endpoint. Each event carries it as `api_version`.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `*bool` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.RollSecret(ID, request) -> *coss.WebhookEndpointWithSecret</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Replaces the endpoint's signing secret with a new one, returned in the response (the only time it is). Until `previous_secret_expires_at`, every delivery is signed with both secrets (`webhook-signature` lists two signatures), so receivers verifying with either one accept it: deploy the new secret, then let the old one expire. Rolling again in that time stops the older secret at once. Not idempotent: after a lost response, roll again.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.RollWebhookEndpointSecretRequest{
    ID: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    PreviousSecretExpiresIn: coss.Int(
        3600,
    ),
}
client.WebhookEndpoints.RollSecret(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**previousSecretExpiresIn:** `*int` — Seconds the current secret keeps signing deliveries next to the new one, so receivers can switch without rejecting anything. Default 86400 (a day), at most 604800 (a week). `0` stops it immediately, e.g. after a leak.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Recover(ID, request) -> *coss.WebhookEndpointRecovery</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Queues the endpoint's deliveries that `failed` since `since` for one more attempt each, oldest first, spread over the next minute, e.g. after fixing a receiver that was down. At most 1000 per call: while `has_more` is `true`, call again with the same `since`. The endpoint must be enabled.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.RecoverWebhookEndpointRequest{
    ID: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Since: coss.MustParseDateTime(
        "2026-01-15T09:00:00Z",
    ),
}
client.WebhookEndpoints.Recover(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**since:** `time.Time` — Requeue the endpoint's deliveries that failed and were created at or after this time (ISO 8601). Deliveries are kept for 30 days.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookListeners
<details><summary><code>client.WebhookListeners.Create(request) -> *coss.WebhookListener</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Listeners are how `coss listen` forwards events to a local server: coss.com can't reach `localhost`, so the CLI pulls them. They belong to the API key's environment, receive events created after they open, and don't count toward the plan's webhook endpoints. A listener closes when it is deleted or after 10 minutes without a poll; an environment has at most 5 open at once. Events reach it unsigned: the CLI signs what it forwards with its own secret.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateWebhookListenerRequest{
    EventTypes: []coss.CreateWebhookListenerRequestEventTypesItem{
        coss.CreateWebhookListenerRequestEventTypesItemEmailSent,
        coss.CreateWebhookListenerRequestEventTypesItemEmailDelivered,
    },
    Description: coss.String(
        "localhost:3000/webhooks",
    ),
}
client.WebhookListeners.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**eventTypes:** `[]coss.CreateWebhookListenerRequestEventTypesItem` — Event types to receive. Defaults to every event type.
    
</dd>
</dl>

<dl>
<dd>

**apiVersion:** `*coss.CreateWebhookListenerRequestAPIVersion` — The API version events are rendered in. Defaults to the version of the request that creates the listener.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Where the events go, for your own reference (shown in the log).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookListeners.Poll(ID, request) -> *coss.WebhookListenerPoll</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Acknowledges deliveries handed out earlier, keeps the listener open for another 10 minutes, and waits up to `wait_ms` (at most 25 s) for events. Deliveries come oldest first; one not acknowledged within two minutes is handed out again (with the same `event_id`). The answer may come early, with no deliveries, when the API restarts: poll again. Polls are not request-logged; each acknowledgement is logged as a `webhook.forward` line.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.PollWebhookListenerRequest{
    ID: "whlis_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Acks: []*coss.WebhookListenerAck{
        &coss.WebhookListenerAck{
            DeliveryID: "whlisdel_01k7c8n2b5d7f9h1k3m5p7r9tv",
            AckToken: "mfz3k2a8",
            StatusCode: coss.Int(
                200,
            ),
            DurationMs: 12,
        },
    },
    WaitMs: coss.Int(
        20000,
    ),
}
client.WebhookListeners.Poll(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook listener's id.
    
</dd>
</dl>

<dl>
<dd>

**acks:** `[]*coss.WebhookListenerAck` — What happened to deliveries handed out earlier. A delivery is finished once acknowledged: a 2xx status (or none, with no error) succeeds; anything else fails. Neither is retried.
    
</dd>
</dl>

<dl>
<dd>

**waitMs:** `*int` — How long to wait for deliveries when none is pending, in milliseconds. Default 20000, at most 25000.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — The most deliveries to hand out. Default 10, at most 50.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookListeners.Delete(ID) -> *coss.DeletedWebhookListener</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Closes the listener: it receives nothing more, and deliveries it was still holding are dropped. `coss listen` closes its listener when it exits.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.DeleteWebhookListenersRequest{
    ID: "whlis_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.WebhookListeners.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook listener's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookEvents
<details><summary><code>client.WebhookEvents.Test(request) -> *coss.WebhookTestEvent</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sends a sample event of a type to the environment's enabled endpoints subscribed to it and its open listeners (`coss listen`), exactly as a real one is sent: same body, signature, retries and log lines. `coss trigger` calls it. Sandbox environments only. The ids in the sample are made up (pass real ones in `data` for a handler that looks them up), and nothing marks the event as a test: your handler takes it like the real thing. When nothing is subscribed, the event goes nowhere and isn't kept.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateTestWebhookEventRequest{
    Type: coss.CreateTestWebhookEventRequestTypeEmailBounced,
    Data: map[string]any{
        "recipient": "ada@example.com",
    },
}
client.WebhookEvents.Test(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**type_:** `coss.CreateTestWebhookEventRequestType` — The event type. `domain.*`, `account.*`, `subaccount.*` and `billing.*` events only reach live environments, so they can't be tested in a sandbox one.
    
</dd>
</dl>

<dl>
<dd>

**data:** `map[string]any` — Fields merged over the sample's `data` (objects field by field, anything else replaced), in the latest API version's shape: e.g. a real `email_id`, or the `recipient` your handler looks for. Unknown fields are refused.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## SMS
<details><summary><code>client.Sms.List() -> *coss.SmsList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Messages sent from the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListSmsRequest{}
client.Sms.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**to:** `*string` — Only messages to this number.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*string` — Only messages in these statuses, comma-separated: `failed`.
    
</dd>
</dl>

<dl>
<dd>

**createdAfter:** `*time.Time` — Only messages created at or after this time.
    
</dd>
</dl>

<dl>
<dd>

**createdBefore:** `*time.Time` — Only messages created before this time.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Send(request) -> *coss.Sms</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Queues a text message from the API key's environment and returns it with `status: "queued"`; it is handed to the carrier moments later. Follow it with `GET /v1/sms/{id}` or the `sms.sent`, `sms.delivered`, `sms.undelivered` and `sms.failed` webhooks. Live (`coss_live_…`) keys send `from` one of the organization's numbers whose carrier registration is approved, to the countries the organization allows (US and Canada unless changed in the dashboard). Sandbox (`coss_test_…`) keys accept any `from`, deliver nothing and answer the SMS simulator's numbers (`+15005550006` delivered, `+15005550001` invalid, `+15005550004` filtered by the carrier, `+15005550009` opted out, `+15005550008` replies). A number on the environment's SMS suppression list (it replied STOP, or it can't receive SMS) is skipped: the message is `failed` with `suppressed`. Segments count against the organization's send quota, and each is billed by the destination country.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.SendSmsRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    From: "+14155550123",
    To: "+14155550199",
    Body: "Your Acme code is 482913",
    Tags: []*coss.SendSmsRequestTagsItem{
        &coss.SendSmsRequestTagsItem{
            Name: "flow",
            Value: "sign_in",
        },
    },
}
client.Sms.Send(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original message (with its current status) instead of sending again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**from:** `string` — One of your organization's phone numbers, in E.164 form. Sandbox environments accept any number.
    
</dd>
</dl>

<dl>
<dd>

**to:** `string` — The recipient's mobile number, in E.164 form.
    
</dd>
</dl>

<dl>
<dd>

**body:** `string` — The text. Messages are split into segments of 153 GSM-7 or 67 Unicode characters (152 or 66 from a toll-free number; 160 or 70 for a single one), each billed; at most 10 (1,520 GSM-7 or 660 Unicode characters).
    
</dd>
</dl>

<dl>
<dd>

**tags:** `[]*coss.SendSmsRequestTagsItem` — Up to 10 tags.
    
</dd>
</dl>

<dl>
<dd>

**scheduledAt:** `*time.Time` — Send at this time instead of now (ISO 8601 with an offset, at most 30 days ahead). A time that is not in the future sends immediately.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Get(ID) -> *coss.Sms</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One message sent from the API key's environment, with its current status.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetSmsRequest{
    ID: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sms.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The message's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.ListEvents(ID) -> *coss.SmsEventList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Everything that happened to the message, oldest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListEventsSmsRequest{
    ID: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sms.ListEvents(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The message's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Cancel(ID) -> *coss.Sms</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cancels a message scheduled with `scheduled_at` before it is sent. Canceling a canceled message returns it as is.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CancelSmsRequest{
    ID: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sms.Cancel(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The message's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Verify
<details><summary><code>client.Verify.List() -> *coss.VerificationList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Verifications of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListVerifyRequest{}
client.Verify.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**to:** `*string` — Only verifications to this destination.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*coss.ListVerifyRequestStatus` — Only verifications in this status.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.Start(request) -> *coss.Verification</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sends a one-time code to a phone number (SMS) or an email address and returns the verification, `pending` until you check the code the end user typed (`POST /v1/verifications/check`). Starting again for the same destination while it is pending sends a new code (the earlier one stops working), up to 5 times. Before a new verification costs anything, the fraud guard checks it (your Risk lists, premium-rate numbers, Tor, and velocity per IP, user, number range and country, with how often their codes are entered): a blocked one is stored with its `reasons` and nothing is sent. Pass the end user's `ip` (and your `user_id`) so it can tell them apart. SMS codes come from coss.com's shared numbers unless the environment's Verify settings name one of your own; email codes from your sender, else coss.com's. Sandbox (`coss_test_…`) keys deliver nothing and the code is always zeros.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.StartVerificationRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    To: "+14155550199",
    IP: coss.String(
        "203.0.113.7",
    ),
    UserID: coss.String(
        "user_42",
    ),
}
client.Verify.Start(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original verification instead of sending another code, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**to:** `string` — Where the code goes: a mobile number in E.164 form, or an email address. A pending verification to the same destination and channel is reused: its code is sent again.
    
</dd>
</dl>

<dl>
<dd>

**channel:** `*coss.StartVerificationRequestChannel` — `sms` or `email`. Default: `sms` for a phone number, `email` for an address.
    
</dd>
</dl>

<dl>
<dd>

**ip:** `*string` — The end user's IP address. The fraud guard uses it (velocity, Tor); recommended.
    
</dd>
</dl>

<dl>
<dd>

**userID:** `*string` — Your id for the end user, for the fraud guard's velocity and your Risk lists.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `[]*coss.StartVerificationRequestTagsItem` — Up to 10 tags.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.Check(request) -> *coss.VerificationCheck</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Checks the code the end user typed, by the verification's id or by the destination (its latest verification). `valid: true` approves it (`verification.approved`, billed once); a wrong code spends an attempt, and the last one fails it. Checking an approved verification again with its code stays valid until it expires, without being billed again.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CheckVerificationRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    To: coss.String(
        "+14155550199",
    ),
    Code: "482913",
}
client.Verify.Check(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated check with the same key returns the same answer without spending another attempt. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**verificationID:** `*string` — The verification to check. Give this or `to`.
    
</dd>
</dl>

<dl>
<dd>

**to:** `*string` — The destination the code was sent to: checks its most recent verification. Give this or `verification_id`.
    
</dd>
</dl>

<dl>
<dd>

**code:** `string` — The code the end user entered.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.Get(ID) -> *coss.Verification</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A verification's status and destination. Its code is never returned.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetVerifyRequest{
    ID: "vrf_01k8e2m4q2f3e9v6t5r1n0p8yz",
}
client.Verify.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The verification's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.Cancel(ID) -> *coss.Verification</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cancels a pending verification: its code stops working. Canceling it again returns it as is.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CancelVerifyRequest{
    ID: "vrf_01k8e2m4q2f3e9v6t5r1n0p8yz",
}
client.Verify.Cancel(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The verification's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Forms
<details><summary><code>client.Forms.List() -> *coss.FormList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's forms, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListFormsRequest{}
client.Forms.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Create(request) -> *coss.Form</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A hosted form endpoint: point an HTML `<form action>` (or `coss/forms`) at its `endpoint`. Every submission is screened by Risk (the honeypot, captcha, email, IP, device, velocity and content) and accepted ones go to webhooks (`form.submission.received`), notification emails and contacts. Without `fields`, any field is accepted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateFormRequest{
    Name: "Contact us",
    AllowedOrigins: []string{
        "https://www.example.com",
    },
    Notifications: &coss.CreateFormRequestNotifications{
        Recipients: []string{
            "support@example.com",
        },
    },
}
client.Forms.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — Your name for the form, shown in the dashboard and in notifications.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `*bool` — `false`: submissions are refused.
    
</dd>
</dl>

<dl>
<dd>

**fields:** `[]*coss.FormFieldInput` — The form's fields. `null` (default): any field is accepted. With fields, submissions are validated against them.
    
</dd>
</dl>

<dl>
<dd>

**strictFields:** `*bool` — With `fields`: refuse fields the form doesn't define. Default false.
    
</dd>
</dl>

<dl>
<dd>

**allowedOrigins:** `[]string` — Sites that may post to the form, like `https://www.example.com` (sandbox environments also `http://localhost:<port>`). Empty (default): any.
    
</dd>
</dl>

<dl>
<dd>

**redirectURL:** `*string` — Where browsers go after an HTML post. `null`: coss.com's thank-you page. A post's `_next` field overrides it when its origin is allowed.
    
</dd>
</dl>

<dl>
<dd>

**spam:** `*coss.CreateFormRequestSpam` — How submissions are screened. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**submitter:** `*coss.CreateFormRequestSubmitter` — Who the submitter is, and whether they must confirm by email. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `*coss.CreateFormRequestNotifications` — Emails about accepted submissions. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**contacts:** `*coss.CreateFormRequestContacts` — Turning submissions into contacts. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**files:** `*coss.CreateFormRequestFiles` — File uploads. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**hosted:** `*coss.CreateFormRequestHosted` — The page coss.com can serve for this form. Only the fields given change.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Get(ID) -> *coss.Form</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A form's settings, with the `endpoint` it posts to and its `hosted_url`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetFormsRequest{
    ID: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
}
client.Forms.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The form's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Remove(ID) -> *coss.DeletedForm</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the form with every submission and uploaded file. Its endpoint answers 404 from then on.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.RemoveFormsRequest{
    ID: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
}
client.Forms.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The form's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Update(ID, request) -> *coss.Form</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Only the fields given change, within each group (`spam`, `contacts`, …) too.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.UpdateFormRequest{
    ID: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
    Spam: &coss.UpdateFormRequestSpam{
        Captcha: coss.UpdateFormRequestSpamCaptchaRequired.Ptr(),
    },
    Contacts: &coss.UpdateFormRequestContacts{
        Enabled: coss.Bool(
            true,
        ),
    },
}
client.Forms.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Your name for the form, shown in the dashboard and in notifications.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `*bool` — `false`: submissions are refused.
    
</dd>
</dl>

<dl>
<dd>

**fields:** `[]*coss.FormFieldInput` — The form's fields. `null` (default): any field is accepted. With fields, submissions are validated against them.
    
</dd>
</dl>

<dl>
<dd>

**strictFields:** `*bool` — With `fields`: refuse fields the form doesn't define. Default false.
    
</dd>
</dl>

<dl>
<dd>

**allowedOrigins:** `[]string` — Sites that may post to the form, like `https://www.example.com` (sandbox environments also `http://localhost:<port>`). Empty (default): any.
    
</dd>
</dl>

<dl>
<dd>

**redirectURL:** `*string` — Where browsers go after an HTML post. `null`: coss.com's thank-you page. A post's `_next` field overrides it when its origin is allowed.
    
</dd>
</dl>

<dl>
<dd>

**spam:** `*coss.UpdateFormRequestSpam` — How submissions are screened. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**submitter:** `*coss.UpdateFormRequestSubmitter` — Who the submitter is, and whether they must confirm by email. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `*coss.UpdateFormRequestNotifications` — Emails about accepted submissions. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**contacts:** `*coss.UpdateFormRequestContacts` — Turning submissions into contacts. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**files:** `*coss.UpdateFormRequestFiles` — File uploads. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**hosted:** `*coss.UpdateFormRequestHosted` — The page coss.com can serve for this form. Only the fields given change.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Reputation
<details><summary><code>client.Reputation.Get() -> *coss.Reputation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organization's standing with the coss.com reputation guard and the latest rates it measured over live environments. When a rate reaches its suspension threshold, live sending is suspended automatically (`account_suspended`) until coss.com support reinstates the organization; sandbox keys keep working. Subscribe to the `account.*` webhook events to be notified of changes.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Reputation.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Logs
<details><summary><code>client.Logs.List() -> *coss.LogList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The API key's environment log, newest first: every API request made with one of its keys (`source: api`), every email event (`email`) and every webhook delivery attempt (`webhook`). Filter by time range (an hour by default, at most 31 days), source, level, type, status, method, route, key, request, resource or free text. Pass the last `id` as `after` to get the next page while `has_more` is true. Reading logs is not itself logged.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListLogsRequest{}
client.Logs.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**from:** `*time.Time` — Start of the range (inclusive). Defaults to an hour before `to`.
    
</dd>
</dl>

<dl>
<dd>

**to:** `*time.Time` — End of the range (exclusive). Defaults to now. At most 31 days.
    
</dd>
</dl>

<dl>
<dd>

**source:** `*string` — Only these sources, comma-separated: `api,email,webhook`.
    
</dd>
</dl>

<dl>
<dd>

**level:** `*string` — Only these levels, comma-separated: `warning,error`.
    
</dd>
</dl>

<dl>
<dd>

**type_:** `*string` — Only these types, e.g. `email.bounced,email.complained`.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*string` — Only these status codes or classes, e.g. `4xx,503`.
    
</dd>
</dl>

<dl>
<dd>

**method:** `*string` — Only these HTTP methods, e.g. `POST`.
    
</dd>
</dl>

<dl>
<dd>

**route:** `*string` — Only these routes, e.g. `/v1/emails/:id`.
    
</dd>
</dl>

<dl>
<dd>

**apiKeyID:** `*string` — Only requests made with these API keys.
    
</dd>
</dl>

<dl>
<dd>

**requestID:** `*string` — Only this request's lines.
    
</dd>
</dl>

<dl>
<dd>

**resourceID:** `*string` — Only lines about this resource, e.g. an `email_…` id.
    
</dd>
</dl>

<dl>
<dd>

**q:** `*string` — Free text, matched against the message, path, ids and recipient.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last line of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Logs.Get(ID) -> *coss.Log</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One line of the API key's environment log.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetLogsRequest{
    ID: "log_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Logs.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The log line's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## AuditEvents
<details><summary><code>client.AuditEvents.List() -> *coss.AuditEventList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organization's audit log, newest first: changes made by members in the dashboard, by API keys (from any environment) and by coss.com support. The audit log is organization-wide, so every key of the organization reads the same events. Filter by action (an entry ending in `.` matches a whole resource, e.g. `domain.`), actor, target, environment or time. Pass the last `id` as `after` to get the next page while `has_more` is true. Reading the audit log is not itself logged.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListAuditEventsRequest{}
client.AuditEvents.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**action:** `*string` — Only these actions, comma-separated. An entry ending in `.` matches every action of that resource: `domain.,api_key.created`.
    
</dd>
</dl>

<dl>
<dd>

**actorType:** `*string` — Only these actor types, e.g. `user,api_key`.
    
</dd>
</dl>

<dl>
<dd>

**actorID:** `*string` — Only changes made by this user or API key.
    
</dd>
</dl>

<dl>
<dd>

**targetID:** `*string` — Only changes to this resource, e.g. a `dom_…` id.
    
</dd>
</dl>

<dl>
<dd>

**environmentID:** `*string` — Only changes in this environment.
    
</dd>
</dl>

<dl>
<dd>

**from:** `*time.Time` — Only events at or after this time.
    
</dd>
</dl>

<dl>
<dd>

**to:** `*time.Time` — Only events before this time.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last event of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.AuditEvents.Get(ID) -> *coss.AuditEvent</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One event of the organization's audit log.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetAuditEventsRequest{
    ID: "oaudit_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.AuditEvents.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The audit event's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing
<details><summary><code>client.Billing.Get() -> *coss.Billing</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organization's plan (and contract), the current billing month's usage and what it would add to the next invoice so far, its standing (`past_due`, billing holds), payment method, and what the plan includes. Organization-wide: every environment's key sees the same. Plan changes are made in the dashboard; subscribe to the `billing.*` webhook events to follow them.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Billing.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Billing.Usage() -> *coss.UsageList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Billable usage over a range (the current billing month by default), per meter, dimension and bucket (`hour`, `day` or `month`, UTC), oldest first; with `group_by=environment`, per environment too. Only live environments are billed, so only they appear. Usage counts when it becomes billable (an email when the provider accepts it) and is kept for 400 days.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.UsageBillingRequest{}
client.Billing.Usage(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**from:** `*time.Time` — Start (inclusive). Defaults to the start of the current billing month.
    
</dd>
</dl>

<dl>
<dd>

**to:** `*time.Time` — End (exclusive). Defaults to now. At most 400 days after `from` (7 by hour).
    
</dd>
</dl>

<dl>
<dd>

**granularity:** `*coss.UsageBillingRequestGranularity` — Bucket size (UTC). Defaults to `day`.
    
</dd>
</dl>

<dl>
<dd>

**groupBy:** `*coss.UsageBillingRequestGroupBy` — Split each bucket per environment, project, API key or user (the member whose personal key it was).
    
</dd>
</dl>

<dl>
<dd>

**meter:** `*coss.UsageBillingRequestMeter` — Only this meter.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Log drains
<details><summary><code>client.LogDrains.List() -> *coss.LogDrainList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every drain of the API key's environment, oldest first. Log drains belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox drains, and a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.LogDrains.List(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.Create(request) -> *coss.LogDrainWithSecret</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Streams the environment's logs to a URL: every line `GET /v1/logs` returns (API requests, email events, webhook attempts) and the environment's audit events, posted as signed batches of up to 500 lines or 1 MB, usually within seconds. `format` picks the body: NDJSON for your own endpoint, or the intake API of Loki (Grafana Cloud), Datadog or an OTLP/HTTP collector, with `auth_header` carrying its key. Log drains belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox drains, and a `coss_live_…` key only production ones. The response carries the signing secret, which is returned only here: store it, and verify every NDJSON batch with it (`verifyLogDrainBatch` in the SDK).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateLogDrainRequest{
    URL: "https://logs.example.com/coss",
    Description: coss.String(
        "Production logs",
    ),
    Sources: []coss.LogDrainSource{
        coss.LogDrainSourceAPI,
        coss.LogDrainSourceEmail,
    },
}
client.LogDrains.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**url:** `string` — An `https://` URL coss.com posts batches of log lines to.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — A note for your own reference. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**sources:** `[]coss.LogDrainSource` — What the drain forwards: `api` (requests made with the environment's API keys), `email` (email events), `webhook` (webhook delivery attempts) and `audit` (changes to the environment, from the organization's audit log). An empty array means every source, including ones added later. Defaults to every source.
    
</dd>
</dl>

<dl>
<dd>

**format:** `*coss.CreateLogDrainRequestFormat` — How batches are encoded. `ndjson`: one JSON object per line (`application/x-ndjson`), for your own endpoint. `loki`: Loki's push API (`/loki/api/v1/push`, Grafana Cloud Logs). `datadog`: Datadog's log intake (`/api/v2/logs`). `otlp`: OTLP/HTTP logs in JSON (`/v1/logs`, Grafana Cloud, Honeycomb, an OpenTelemetry Collector…). Defaults to `ndjson`.
    
</dd>
</dl>

<dl>
<dd>

**authHeader:** `*coss.LogDrainAuthHeader` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.Get(ID) -> *coss.LogDrain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The drain without its signing secret, which is only returned when created.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetLogDrainsRequest{
    ID: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.LogDrains.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The log drain's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.Delete(ID) -> *coss.DeletedLogDrain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the drain and its batch log. Lines still waiting for it are dropped. To stop it temporarily, set `enabled` to `false` instead.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.DeleteLogDrainsRequest{
    ID: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.LogDrains.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The log drain's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.Update(ID, request) -> *coss.LogDrain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the URL, description, sources, format, auth header or `enabled` flag. Omitted fields keep their current value (`auth_header: null` removes the header), and the signing secret stays the same. A batch being retried goes out as the drain is when it is retried. Disabling a drain drops the lines still waiting for it, and nothing is kept for it while it is disabled; enabling it again (also after coss.com disabled it for failing) sends lines logged from then on.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.UpdateLogDrainRequest{
    ID: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Enabled: coss.Bool(
        false,
    ),
}
client.LogDrains.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The log drain's id.
    
</dd>
</dl>

<dl>
<dd>

**url:** `*string` — An `https://` URL coss.com posts batches of log lines to.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — A note for your own reference. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**sources:** `[]coss.LogDrainSource` — What the drain forwards: `api` (requests made with the environment's API keys), `email` (email events), `webhook` (webhook delivery attempts) and `audit` (changes to the environment, from the organization's audit log). An empty array means every source, including ones added later.
    
</dd>
</dl>

<dl>
<dd>

**format:** `*coss.LogDrainFormat` 
    
</dd>
</dl>

<dl>
<dd>

**authHeader:** `*coss.LogDrainAuthHeader` 
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `*bool` — `false` disables it, and `true` enables it again.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes
<details><summary><code>client.Inboxes.List() -> *coss.InboxList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's inboxes, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.ListInboxesRequest{}
client.Inboxes.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Create(request) -> *coss.Inbox</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Gives an agent (or anyone) its own email address in the API key's environment: `username@<the environment's inbound domain>`, which needs no DNS setup, or an address at one of the environment's receiving domains (`domain`). Mail to it is kept as threads, and each message that arrives sends an `inbox.message.received` webhook. With a `client_id` that already has an inbox, that inbox is returned (200) instead of a new one.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateInboxRequest{
    Username: coss.String(
        "support-agent",
    ),
    DisplayName: coss.String(
        "Acme Support",
    ),
    ClientID: coss.String(
        "agent-42",
    ),
}
client.Inboxes.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**username:** `*string` — The part before the @. Omit it for a random one. Mail to `username+anything@domain` reaches the inbox too.
    
</dd>
</dl>

<dl>
<dd>

**domain:** `*string` — One of the environment's receiving domains (its hostname). Omit it for the environment's own domain under coss.com's inbound domain, which needs no DNS setup.
    
</dd>
</dl>

<dl>
<dd>

**displayName:** `*string` — The name messages from the inbox are sent with.
    
</dd>
</dl>

<dl>
<dd>

**clientID:** `*string` — Your own id for the inbox (unique per environment). Creating an inbox with a `client_id` that already has one returns that inbox instead (200), so retries and "one inbox per user" need no bookkeeping.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Get(InboxID) -> *coss.Inbox</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One inbox of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.GetInboxesRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Inboxes.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Delete(InboxID) -> *coss.DeletedInbox</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the inbox and its threads. The received emails and emails they held stay in the environment until their retention ends, and mail to the address is still received by the environment (without a thread or `inbox.message.received` webhook).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.DeleteInboxesRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Inboxes.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Update(InboxID, request) -> *coss.Inbox</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the name messages from the inbox are sent with. Its address never changes.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.UpdateInboxRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
    DisplayName: coss.String(
        "Acme Help",
    ),
}
client.Inboxes.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**displayName:** `*string` — The name messages are sent with; `null` sends with the bare address.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk
<details><summary><code>client.Risk.Assess(request) -> *coss.RiskAssessment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Assesses a sign-up, login or other event in the API key's environment and returns a decision (`allow`, `review` or `block`) with a score and the reasons behind it. coss.com combines email and IP signals with what it has seen in this environment (velocity, accounts sharing a mailbox, identifiers you reported) and your allow and block lists. Signals that are unavailable at the moment are skipped and listed in `degraded`. Call it from your server, never from the browser, and treat errors as `allow` (fail open) so an outage never locks your users out. `review` decisions also fire a `risk.assessment.review` webhook. Live assessments are billed (`risk.assessments`; plans include some every month) unless they end in `block`. Past Free's allowance, on a billing hold or over a budget, they are free and made without velocity, memory or content (`usage_limit` in `degraded`); they never fail over billing. Sandbox (`coss_test_…`) keys accept documented test addresses (`192.0.2.x`, `@disposable.test`, `@undeliverable.test`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateRiskAssessmentRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Event: coss.RiskEventSignup,
    User: &coss.CreateRiskAssessmentRequestUser{
        Email: coss.String(
            "ada@gmail.con",
        ),
    },
    IP: coss.String(
        "203.0.113.7",
    ),
    UserAgent: coss.String(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15",
    ),
}
client.Risk.Assess(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original assessment instead of assessing (and counting) the event again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**event:** `coss.RiskEvent` 
    
</dd>
</dl>

<dl>
<dd>

**eventName:** `*string` — Required for `custom` events (e.g. `invite_sent`), not allowed otherwise.
    
</dd>
</dl>

<dl>
<dd>

**user:** `*coss.CreateRiskAssessmentRequestUser` 
    
</dd>
</dl>

<dl>
<dd>

**ip:** `*string` — The client's IP address (not your server's or proxy's).
    
</dd>
</dl>

<dl>
<dd>

**userAgent:** `*string` — The client's user agent.
    
</dd>
</dl>

<dl>
<dd>

**captcha:** `*coss.CreateRiskAssessmentRequestCaptcha` 
    
</dd>
</dl>

<dl>
<dd>

**checkout:** `*coss.RiskCheckoutRequest` 
    
</dd>
</dl>

<dl>
<dd>

**device:** `*coss.CreateRiskAssessmentRequestDevice` — The browser the event came from: recognizes it across accounts (`duplicate.device`, device velocity, fraud memory) and spots automation.
    
</dd>
</dl>

<dl>
<dd>

**content:** `*coss.CreateRiskAssessmentRequestContent` — Content to classify with the event. Its scores go in `signals.content` and rules can test them; `content.*` reasons fire only at thresholds you set.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Feedback(ID, request) -> *coss.RiskAssessment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Tells coss.com what the assessed user turned out to be. `fraud` and `abuse` make later assessments with the same mailbox, user, IP address or subnet flag it (`history.fraud_*`); `legitimate` takes back what this assessment reported. Resolves an open review. Sending the latest outcome again changes nothing.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateRiskFeedbackRequest{
    ID: "rsk_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Outcome: coss.RiskOutcomeFraud,
}
client.Risk.Feedback(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The assessment's id.
    
</dd>
</dl>

<dl>
<dd>

**outcome:** `coss.RiskOutcome` 
    
</dd>
</dl>

<dl>
<dd>

**note:** `*string` — For your team; never shared.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Calibration() -> *coss.RiskCalibration</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

How often each reason and rule was right over the last 90 days, by the outcomes you reported with feedback, and the reason weights that supports. Nothing changes until you apply them with `reason_weights` in the settings.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Risk.Calibration(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.CheckEmail(request) -> *coss.RiskEmailCheck</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Email intelligence on its own: syntax, disposable domains, whether the domain can receive mail (DNS), role accounts, free providers, the canonical mailbox, typo suggestions and the domain's age (RDAP). Stateless: nothing is stored or counted, so it never flags an address for having been seen before (assessments do). Failed lookups are listed in `degraded`. Sandbox keys see the documented test domains (`@disposable.test`, `@undeliverable.test`, `@new.test`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.RiskEmailCheckRequest{
    Email: "ada@gnail.com",
}
client.Risk.CheckEmail(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `string` — The address to check, as given.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.CheckIP(request) -> *coss.RiskIPCheck</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

IP intelligence on its own: Tor exit nodes, cloud and hosting networks, networks mostly used by VPN and proxy services, the network (ASN) and its country. Stateless. Missing IP data is reported in `degraded`. Sandbox keys see the documentation addresses (`192.0.2.1` Tor, `.2` cloud, `.3` VPN, the rest residential).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.RiskIPCheckRequest{
    IP: "185.220.101.1",
}
client.Risk.CheckIP(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**ip:** `string` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.CheckPhone(request) -> *coss.RiskPhoneCheck</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Phone intelligence on its own: whether the number exists in its country's numbering plan, its line type (mobile, landline, fixed or non-fixed VoIP, toll-free…) and carrier, and the last SIM swap where carriers share it. Stateless. A failed lookup is reported in `degraded`. Each live check that gets an answer is billed (`risk.phone_checks`; plans include some every month, and Free stops at its allowance); invalid numbers, failed lookups and sandbox checks are free. Limited per organization as well as per key. Sandbox keys see the fictional numbers `+1 202 555 01xx` (`0101` landline, `0102` non-fixed VoIP, `0103` fixed VoIP, `0104` a recent SIM swap, `0199` invalid, the rest mobile).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.RiskPhoneCheckRequest{
    Phone: "+14155550123",
}
client.Risk.CheckPhone(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**phone:** `string` — The number in E.164 (`+14155550123`); spaces, dashes, dots and brackets are ignored. Anything else is `valid: false`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Classify(request) -> *coss.RiskContentClassification</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Scores text people post on your platform (a profile bio, a comment, a listing) for spam, phishing, malware and fraud with an AI model, with zero data retention. Returns scores only: you decide what they mean. Neither the text nor the scores are stored, and request logs keep no body for this endpoint. Takes up to 3 seconds; a failure is a 503 you can retry or treat as unknown. Each live classification the model answered is billed (`risk.content_checks`; plans include some every month, and Free stops at its allowance). Limited per organization as well as per key. Sandbox keys use markers instead of a model: `[coss-test:phishing]` scores 0.99, `[coss-test:spam:0.4]` exactly 0.4, everything else 0.01.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.RiskContentClassifyRequest{
    Text: "Earn $5,000 a week from home! DM me on Telegram: t.me/fast-cash",
}
client.Risk.Classify(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**text:** `string` — The text to classify (a profile bio, a comment, a listing). The model reads the first 8,000 characters.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Limit(request) -> *coss.RiskLimit</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Takes `cost` tokens (default 1) from `key`'s share of one of your buckets and says whether to let the request through: a 200 either way, with `allowed`. Denied requests take nothing. Each key has its own bucket of `burst` tokens refilling at `limit` per `period_seconds` (GCRA, the algorithm coss.com limits its own API with). coss.com keeps only a keyed hash of `key`. While coss.com can't count, the bucket's `on_failure` answers and `degraded` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CheckRiskLimitRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Bucket: "password_reset",
    Key: "ada@example.com",
}
client.Risk.Limit(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated allowed check with the same key is answered again without taking more tokens, for an hour. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**bucket:** `string` — The bucket's name.
    
</dd>
</dl>

<dl>
<dd>

**key:** `string` — Who or what is limited: a user id, an email address, an IP address… coss.com keeps only a keyed hash of it.
    
</dd>
</dl>

<dl>
<dd>

**cost:** `*int` — Tokens this request takes. Default 1.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing Invoices
<details><summary><code>client.Billing.Invoices.List() -> *coss.InvoiceList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organization's invoices, newest first, without their lines. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &billing.ListInvoicesRequest{}
client.Billing.Invoices.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `*billing.ListInvoicesRequestStatus` — Only invoices in this status.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Continue after this id (the last of the previous page).
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — At most this many (default 20).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Billing.Invoices.Get(ID) -> *coss.Invoice</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One invoice with its lines.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &billing.GetInvoicesRequest{
    ID: "inv_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Billing.Invoices.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The invoice's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing Credits
<details><summary><code>client.Billing.Credits.List() -> *coss.CreditList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organization's credits, newest first: each month's plan credit, prepaid commitments and credits from coss.com support (in dollars, or free units of a product), with what's left. Only usable ones by default (`status=all` for every one). Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &billing.ListCreditsRequest{}
client.Billing.Credits.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `*billing.ListCreditsRequestStatus` — `active` (default): usable now or later, with something left; `all`: every credit, newest first.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Continue after this id (the last of the previous page).
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — At most this many (default 20).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Tracking
<details><summary><code>client.Domains.Tracking.Create(ID, request) -> *coss.Domain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sets up a subdomain of the domain (e.g. `links.acme.com`) to serve open and click tracking. Publish the CNAME record in `tracking.record`; coss.com then issues its certificate and checks it in the background, giving up after 72 hours. Open pixels and click redirects of emails sent from the domain (or its subdomains without a domain of their own) use the tracking domain while it is `active`, and the default tracking host otherwise. A domain has at most one tracking domain: remove it to use another hostname.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &domains.CreateTrackingDomainRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Hostname: "links.acme.com",
}
client.Domains.Tracking.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**hostname:** `string` — A subdomain of the domain to serve tracking links from, without a scheme or path. Point it at coss.com with the CNAME record the response lists.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Tracking.Delete(ID) -> *coss.Domain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the domain's tracking domain. Later emails use the default tracking host, but links and open pixels in emails already sent through the tracking domain stop working.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &domains.DeleteTrackingRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Domains.Tracking.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Receiving
<details><summary><code>client.Domains.Receiving.Create(ID, request) -> *coss.Domain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Starts receiving email at the domain itself or a subdomain (e.g. `inbound.acme.com`): email sent to any address at that hostname becomes a received email of the API key's environment (an `email.received` webhook, `GET /v1/received_emails`). Publish the MX record in `receiving.record`; coss.com checks it in the background. Using the domain itself moves all of its mail to coss.com. A domain has at most one receiving hostname: remove it to use another one.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &domains.CreateReceivingDomainRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Hostname: "inbound.acme.com",
}
client.Domains.Receiving.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**hostname:** `string` — The domain itself or a subdomain of it, without a scheme or path. Point its MX at coss.com with the record the response lists. Using the domain itself moves all of its mail to coss.com, so a subdomain is usually the better choice.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Receiving.Delete(ID) -> *coss.Domain</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Stops receiving at the domain's receiving hostname: later mail to it is dropped (remove the MX record too). Emails already received stay until their retention ends.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &domains.DeleteReceivingRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Domains.Receiving.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Dmarc
<details><summary><code>client.Domains.Dmarc.Get(ID) -> *coss.DomainDmarc</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The domain's published DMARC record, where it is on the path from `p=none` to `p=reject`, the record to publish next and whether the last 14 days of aggregate reports say that is safe (`ready`, with the `checks` behind it), and a summary of those reports. Mailbox providers send DMARC aggregate reports to the domain's `report_address` once its `_dmarc` record names it (`rua=mailto:…`), usually once a day each.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &domains.GetDmarcRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Domains.Dmarc.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Dmarc Reports
<details><summary><code>client.Domains.Dmarc.Reports.List(ID) -> *coss.DmarcReportList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The aggregate reports received about the domain, newest first, without their rows (retrieve one for those). Pass the last `id` as `after` to get the next page while `has_more` is true. Mailbox providers send DMARC aggregate reports to the domain's `report_address` once its `_dmarc` record names it (`rua=mailto:…`), usually once a day each.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &dmarc.ListReportsRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Domains.Dmarc.Reports.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last report of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Dmarc.Reports.Get(ID, ReportID) -> *coss.DmarcReport</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One aggregate report with its rows: each source IP, how many messages it sent, whether they passed DMARC (aligned DKIM or SPF) and what the receiver did with them.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &dmarc.GetReportsRequest{
    ID: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ReportID: "dmarcrep_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Domains.Dmarc.Reports.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**reportID:** `string` — The report's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Templates
<details><summary><code>client.Email.Templates.List() -> *coss.EmailTemplateList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's templates, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListTemplatesRequest{}
client.Email.Templates.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last template of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Create(request) -> *coss.EmailTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a template with a draft holding its variables and a subject, HTML and text per locale. Sends use it once its draft is published. Not idempotent: retrying after a lost response can create a second template (unless it has an `alias`). Templates belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones. Give a template the same `alias` in every environment to send it by that name.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CreateEmailTemplateRequest{
    Name: "Welcome",
    Alias: coss.String(
        "welcome",
    ),
    DefaultLocale: coss.String(
        "en",
    ),
    Variables: []*coss.TemplateVariableInput{
        &coss.TemplateVariableInput{
            Name: "first_name",
            Type: coss.TemplateVariableInputTypeString,
            Required: coss.Bool(
                true,
            ),
        },
    },
    SampleVariables: map[string]any{
        "first_name": "Ada",
    },
    Contents: []*coss.TemplateContentInput{
        &coss.TemplateContentInput{
            Locale: "en",
            Subject: "Welcome, {{first_name}}",
            HTML: coss.String(
                "<p>Hi {{first_name}}, thanks for signing up!</p>",
            ),
        },
        &coss.TemplateContentInput{
            Locale: "de",
            Subject: "Willkommen, {{first_name}}",
            HTML: coss.String(
                "<p>Hallo {{first_name}}, danke für deine Anmeldung!</p>",
            ),
        },
    },
}
client.Email.Templates.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — Shown in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**alias:** `*string` — A name to send the template by instead of its id, e.g. `welcome`: the same alias can be used in every environment.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Your note about it, shown in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**defaultLocale:** `*string` — The locale sends fall back to when they ask for none, or for one without content. Defaults to the first entry of `contents` (or "en").
    
</dd>
</dl>

<dl>
<dd>

**variables:** `[]*coss.TemplateVariableInput` — The variables the template uses, with their types.
    
</dd>
</dl>

<dl>
<dd>

**sampleVariables:** `map[string]any` — Example values for previews and test sends in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**contents:** `[]*coss.TemplateContentInput` — The subject, HTML and text per locale.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Get(ID) -> *coss.EmailTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A template by id or alias. Its content is in its draft and versions.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetTemplatesRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Templates.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Delete(ID) -> *coss.DeletedEmailTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the template with its draft and every version. Emails already sent or scheduled from it keep their content; new sends naming it fail with `template_not_found`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.DeleteTemplatesRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Templates.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Update(ID, request) -> *coss.EmailTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the template's name, alias or description. Changing the alias changes what sends must use. Content changes go to the draft (`PUT /v1/email_templates/{id}/draft`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateEmailTemplateRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Name: coss.String(
        "Welcome (new users)",
    ),
}
client.Email.Templates.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Shown in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**alias:** `*string` — `null` removes the alias.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Your note about it. `null` removes it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.GetDraft(ID) -> *coss.EmailTemplateVersion</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The draft (`version: null`): what the next publish makes sends use. `problems` lists syntax errors and undeclared variables, which keep it from being published.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetDraftTemplatesRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Templates.GetDraft(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.UpdateDraft(ID, request) -> *coss.EmailTemplateVersion</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Replaces the draft's variables and content. Sends keep using the published version until the draft is published. Pass the `revision` you read to refuse overwriting someone else's changes. A draft with problems is saved (and reported in `problems`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateEmailTemplateDraftRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Revision: coss.Int64(
        int64(3),
    ),
    DefaultLocale: coss.String(
        "en",
    ),
    Variables: []*coss.TemplateVariableInput{
        &coss.TemplateVariableInput{
            Name: "first_name",
            Type: coss.TemplateVariableInputTypeString,
            Required: coss.Bool(
                true,
            ),
        },
    },
    SampleVariables: map[string]any{
        "first_name": "Ada",
    },
    Contents: []*coss.TemplateContentInput{
        &coss.TemplateContentInput{
            Locale: "en",
            Subject: "Welcome, {{first_name}}",
            HTML: coss.String(
                "<p>Hi {{first_name}}, thanks for signing up!</p>",
            ),
        },
        &coss.TemplateContentInput{
            Locale: "de",
            Subject: "Willkommen, {{first_name}}",
            HTML: coss.String(
                "<p>Hallo {{first_name}}, danke für deine Anmeldung!</p>",
            ),
        },
    },
}
client.Email.Templates.UpdateDraft(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**revision:** `*int64` — The draft `revision` you read. When given, the request is refused (`template_revision_mismatch`) if the draft changed since.
    
</dd>
</dl>

<dl>
<dd>

**defaultLocale:** `*string` — The locale sends fall back to when they ask for none, or for one without content. Defaults to the first entry of `contents` (or "en").
    
</dd>
</dl>

<dl>
<dd>

**variables:** `[]*coss.TemplateVariableInput` — The variables the template uses, with their types.
    
</dd>
</dl>

<dl>
<dd>

**sampleVariables:** `map[string]any` — Example values for previews and test sends in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**contents:** `[]*coss.TemplateContentInput` — The subject, HTML and text per locale.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Publish(ID, request) -> *coss.EmailTemplateVersion</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Copies the draft into the next version, which sends use from then on. Emails already accepted keep the content they were rendered with. A draft without changes since the last publish returns that version, so retrying with the `revision` you reviewed is safe (without it, a retry could publish edits saved in between).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.PublishEmailTemplateRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Revision: coss.Int64(
        int64(3),
    ),
}
client.Email.Templates.Publish(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**revision:** `*int64` — The draft `revision` you read. When given, the request is refused (`template_revision_mismatch`) if the draft changed since.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Render(ID, request) -> *coss.RenderedEmailTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Renders the draft (or a published `version`) with `variables`, exactly as a send would, and returns the subject, HTML and text: a preview, nothing is sent or stored. Without `variables` it renders the version's `sample_variables`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RenderEmailTemplateRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Locale: coss.String(
        "en",
    ),
    Variables: map[string]any{
        "first_name": "Ada",
    },
}
client.Email.Templates.Render(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**version:** `*int64` — A published version to render. Default: the draft.
    
</dd>
</dl>

<dl>
<dd>

**locale:** `*string` — The locale to render, e.g. "pt-BR". Falls back to the language ("pt"), then to the default locale, as sends do.
    
</dd>
</dl>

<dl>
<dd>

**variables:** `map[string]any` — Values by variable name, checked as a send checks them. Default: `sample_variables`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email DedicatedIps
<details><summary><code>client.Email.DedicatedIps.Get() -> *coss.DedicatedIPPool</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The organization's dedicated IP pool (the Dedicated IPs add-on, bought on the dashboard's billing page): its status, its IPs and how much of the last week's mail they delivered. Organization-wide, like domains: every environment's key sees the same pool; only live emails go through it. Without the add-on the status is `not_enabled`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Email.DedicatedIps.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Suppressions
<details><summary><code>client.Email.Suppressions.List() -> *coss.SuppressionList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The suppression list of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListSuppressionsRequest{
    Subaccount: coss.String(
        "user_8812",
    ),
}
client.Email.Suppressions.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `*string` — List a sub-account's own list (its id or your uid) instead of the environment's.
    
</dd>
</dl>

<dl>
<dd>

**address:** `*string` — Only entries for this address.
    
</dd>
</dl>

<dl>
<dd>

**scope:** `*coss.ListSuppressionsRequestScope` — Only entries with this scope.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last entry of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.Add(request) -> *coss.Suppression</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Suppresses an address in the API key's environment: later sends skip it, either for every email (`scope: "*"`, the default) or only for emails with the given `category` (e.g. to back an unsubscribe link). Adding an address that is already suppressed with the same scope returns the existing entry with status 200.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CreateSuppressionRequest{
    Address: "user@example.com",
    Scope: &email.CreateSuppressionRequestScope{
        String: "marketing",
    },
}
client.Email.Suppressions.Add(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**address:** `string` — The address to suppress. Display names are ignored; matching is case-insensitive.
    
</dd>
</dl>

<dl>
<dd>

**scope:** `*email.CreateSuppressionRequestScope` — Defaults to `*` (every email). Pass a category, e.g. "marketing", to only skip those.
    
</dd>
</dl>

<dl>
<dd>

**subaccount:** `*string` — Add it to a sub-account's own list (its id or your uid) instead of the environment's.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.Check() -> *coss.SuppressionCheck</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Whether a send to `address` (with `category`, if given) would skip it, and the entries that match: those with scope `*` and, with a `category`, those for that category.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CheckSuppressionsRequest{
    Address: "user@example.com",
}
client.Email.Suppressions.Check(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**address:** `string` — The address to check.
    
</dd>
</dl>

<dl>
<dd>

**category:** `*string` — The category of the email you plan to send. Without it, only `*` entries count.
    
</dd>
</dl>

<dl>
<dd>

**stream:** `*email.CheckSuppressionsRequestStream` — The stream of the email you plan to send (default `transactional`). `marketing` also counts `stream:marketing` entries.
    
</dd>
</dl>

<dl>
<dd>

**subaccount:** `*string` — The sub-account you plan to send for (its id or your uid): its own entries count too.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.Import(request) -> *coss.SuppressionImport</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Adds up to 1000 entries at once, with reason `import`. Each entry is validated on its own: invalid ones are skipped and listed in `invalid`, entries already on the list are left unchanged and counted in `existing`. Importing again is safe.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ImportSuppressionsRequest{
    Suppressions: []*email.ImportSuppressionsRequestSuppressionsItem{
        &email.ImportSuppressionsRequestSuppressionsItem{
            Address: "user@example.com",
        },
        &email.ImportSuppressionsRequestSuppressionsItem{
            Address: "other@example.com",
            Scope: coss.String(
                "marketing",
            ),
        },
    },
}
client.Email.Suppressions.Import(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `*string` — Import into a sub-account's own list (its id or your uid) instead of the environment's.
    
</dd>
</dl>

<dl>
<dd>

**suppressions:** `[]*email.ImportSuppressionsRequestSuppressionsItem` — 1-1000 entries. Each one is validated on its own: invalid entries are skipped and reported in `invalid`, the rest are imported.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.Export() -> string</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The whole suppression list of the API key's environment (optionally filtered), oldest first, as CSV with the columns `address,scope,reason,created_at,email_id,id`. The file can be imported again as is. Values a spreadsheet would run as a formula are prefixed with `'`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ExportSuppressionsRequest{}
client.Email.Suppressions.Export(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `*string` — Export a sub-account's own list (its id or your uid) instead of the environment's.
    
</dd>
</dl>

<dl>
<dd>

**scope:** `*coss.ExportSuppressionsRequestScope` — Only entries with this scope.
    
</dd>
</dl>

<dl>
<dd>

**reason:** `*email.ExportSuppressionsRequestReason` — Only entries with this reason.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.Get(ID) -> *coss.Suppression</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One entry of the suppression list of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetSuppressionsRequest{
    ID: "sup_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Suppressions.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The suppression's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.Remove(ID) -> *coss.DeletedSuppression</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the entry, so later sends reach the address again (unless another entry still matches). Entries added for bounces and complaints can be removed too.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RemoveSuppressionsRequest{
    ID: "sup_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Suppressions.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The suppression's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Subaccounts
<details><summary><code>client.Email.Subaccounts.List() -> *coss.SubaccountList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's sub-accounts, newest first. Sub-accounts belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListSubaccountsRequest{
    After: coss.String(
        "sub_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ),
}
client.Email.Subaccounts.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — The last `id` of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.Create(request) -> *coss.Subaccount</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a sub-account: one of your users, who gets their own domains, suppressions, quotas and reputation. Give it a `uid` (e.g. your user's id) to address it by in every path and send. Sub-accounts belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CreateSubaccountRequest{
    Name: "Acme Bakery",
    UID: coss.String(
        "user_8812",
    ),
    Quotas: &email.CreateSubaccountRequestQuotas{
        RecipientsPerDay: coss.Int(
            5000,
        ),
    },
}
client.Email.Subaccounts.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — A name for your own reference.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `*string` — Your own id for it, to address it by instead of its `id`.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    
</dd>
</dl>

<dl>
<dd>

**quotas:** `*email.CreateSubaccountRequestQuotas` — Fields left out keep their value; `null` removes a quota.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.Get(Subaccount) -> *coss.Subaccount</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A sub-account of the API key's environment, by its id or uid, with its quotas and reputation.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetSubaccountsRequest{
    Subaccount: "user_8812",
}
client.Email.Subaccounts.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `string` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.Delete(Subaccount) -> *coss.Subaccount</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Starts deleting the sub-account: its sends are refused at once, then its domains are released and it is removed with its suppressions (`status` is `deleting` until then). Its emails stay, with its id. Repeating the call returns it as it is.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.DeleteSubaccountsRequest{
    Subaccount: "user_8812",
}
client.Email.Subaccounts.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `string` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.Update(Subaccount, request) -> *coss.Subaccount</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the name, uid, metadata, status or quotas. Fields left out keep their value; `status: "disabled"` refuses its sends until it is `active` again.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateSubaccountRequest{
    Subaccount: "user_8812",
    Status: email.UpdateSubaccountRequestStatusDisabled.Ptr(),
}
client.Email.Subaccounts.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `string` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Your name for it.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `*string` — `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Replaces the metadata.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*email.UpdateSubaccountRequestStatus` — `disabled` refuses its sends until it is `active` again.
    
</dd>
</dl>

<dl>
<dd>

**quotas:** `*email.UpdateSubaccountRequestQuotas` — Fields left out keep their value; `null` removes a quota.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.Reinstate(Subaccount) -> *coss.Subaccount</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Lifts the sub-account's reputation pause (or warning) once you fixed what caused it: its rates are measured again from now on. A pause is never lifted on its own. Repeating the call returns it as it is. Your organization's own reputation still counts its sending.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ReinstateSubaccountsRequest{
    Subaccount: "user_8812",
}
client.Email.Subaccounts.Reinstate(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `string` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.Stats(Subaccount) -> *coss.SubaccountStats</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The sub-account's sending per UTC day: recipients, sent, delivered, bounced, complained, failed and suppressed, counted from its emails as they are now (a later bounce moves its day's numbers). Emails are kept 45 days, so earlier days are left out.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.StatsSubaccountsRequest{
    Subaccount: "user_8812",
    From: coss.Time(
        coss.MustParseDate(
            "2026-10-01",
        ),
    ),
    To: coss.Time(
        coss.MustParseDate(
            "2026-10-15",
        ),
    ),
}
client.Email.Subaccounts.Stats(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `string` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**from:** `*time.Time` — First day (UTC, `YYYY-MM-DD`); default 30 days before `to`.
    
</dd>
</dl>

<dl>
<dd>

**to:** `*time.Time` — Last day (UTC, `YYYY-MM-DD`), included; default today.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Tracking
<details><summary><code>client.Email.Tracking.Get() -> *coss.TrackingSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's open and click tracking default and its category rules. For each of `opens` and `clicks`, a send's own `tracking` wins, then the rule for its `category`, then the default, then off. Settings belong to the API key's own environment: a `coss_test_…` key only ever changes sandbox settings. Emails keep the settings that applied when they were sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Email.Tracking.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Tracking.RemoveDefault() -> *coss.DeletedTrackingRule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the environment default: emails without a rule for their category are then not tracked unless the send asks. Settings belong to the API key's own environment: a `coss_test_…` key only ever changes sandbox settings. Emails keep the settings that applied when they were sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Email.Tracking.RemoveDefault(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Tracking.UpdateDefault(request) -> *coss.TrackingRule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sets the environment default, which applies to emails without a rule for their category. Fields left out keep their value; if there is no default yet, it is created with them off. Settings belong to the API key's own environment: a `coss_test_…` key only ever changes sandbox settings. Emails keep the settings that applied when they were sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.UpdateTrackingRuleRequest{
    Opens: coss.Bool(
        false,
    ),
    Clicks: coss.Bool(
        false,
    ),
}
client.Email.Tracking.UpdateDefault(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `*coss.UpdateTrackingRuleRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Tracking.RemoveCategory(Category) -> *coss.DeletedTrackingRule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the rule: emails of this category follow the environment default again. Settings belong to the API key's own environment: a `coss_test_…` key only ever changes sandbox settings. Emails keep the settings that applied when they were sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RemoveCategoryTrackingRequest{
    Category: "password-reset",
}
client.Email.Tracking.RemoveCategory(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**category:** `string` — The category, as sent in `category`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Tracking.UpdateCategory(Category, request) -> *coss.TrackingRule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sets the rule for emails sent with this `category`, which wins over the environment default, e.g. to track `marketing` but never `password-reset`. Fields left out keep their value; a new rule is created with them off. Settings belong to the API key's own environment: a `coss_test_…` key only ever changes sandbox settings. Emails keep the settings that applied when they were sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateCategoryTrackingRequest{
    Category: "password-reset",
    Body: &coss.UpdateTrackingRuleRequest{
        Opens: coss.Bool(
            false,
        ),
        Clicks: coss.Bool(
            false,
        ),
    },
}
client.Email.Tracking.UpdateCategory(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**category:** `string` — The category, as sent in `category`.
    
</dd>
</dl>

<dl>
<dd>

**request:** `*coss.UpdateTrackingRuleRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Storage
<details><summary><code>client.Email.Storage.Get() -> *coss.StorageSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Whether coss.com keeps the content of the environment's emails (`content_storage: "store"`, the default) or only until each email is sent, fails or is canceled (`"discard"`). Settings belong to the API key's own environment: a `coss_test_…` key only ever changes sandbox settings. Emails keep the setting that applied when they were sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Email.Storage.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Storage.Update(request) -> *coss.StorageSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

With `content_storage: "discard"`, emails sent from now on keep their subject, body, headers, template variables and attachment filenames only until they are sent, fail or are canceled (scheduled emails keep them until their time comes); request logs never keep them. Their metadata (addresses, tags, category, status, recipients, events) is kept as usual. Settings belong to the API key's own environment: a `coss_test_…` key only ever changes sandbox settings. Emails keep the setting that applied when they were sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateStorageSettingsRequest{
    ContentStorage: email.UpdateStorageSettingsRequestContentStorageDiscard,
}
client.Email.Storage.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**contentStorage:** `email.UpdateStorageSettingsRequestContentStorage` — `store` keeps emails' content; `discard` clears it once they are sent.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Contacts
<details><summary><code>client.Email.Contacts.List() -> *coss.ContactList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The contacts of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListContactsRequest{}
client.Email.Contacts.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `*string` — Only the contact with this address.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*email.ListContactsRequestStatus` 
    
</dd>
</dl>

<dl>
<dd>

**audienceID:** `*string` — Only members of this audience.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last contact of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Upsert(request) -> *coss.Contact</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates the contact with this address in the API key's environment, or updates the existing one: names are replaced when given, `properties` are merged (`null` removes one), `audience_ids` are added and `topics` choices recorded. `status` only changes when passed.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpsertContactRequest{
    Email: "ada@example.com",
    FirstName: coss.String(
        "Ada",
    ),
    Properties: map[string]*email.UpsertContactRequestPropertiesValue{
        "plan": &email.UpsertContactRequestPropertiesValue{
            String: "pro",
        },
    },
    Topics: []*email.UpsertContactRequestTopicsItem{
        &email.UpsertContactRequestTopicsItem{
            Topic: "newsletter",
            Status: email.UpsertContactRequestTopicsItemStatusOptedIn,
        },
    },
}
client.Email.Contacts.Upsert(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `string` — The contact's address. Display names are ignored; matching is case-insensitive.
    
</dd>
</dl>

<dl>
<dd>

**firstName:** `*string` — Their first name. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**lastName:** `*string` — Their last name. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**properties:** `map[string]*email.UpsertContactRequestPropertiesValue` — Custom properties by key (define them first, see contact properties). Merged into the contact's existing properties; `null` removes one.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*email.UpsertContactRequestStatus` — Sets the contact's consent. Omitted, a new contact is `subscribed` and an existing one keeps its status.
    
</dd>
</dl>

<dl>
<dd>

**audienceIDs:** `[]string` — Audiences to add the contact to (it stays in the others).
    
</dd>
</dl>

<dl>
<dd>

**topics:** `[]*email.UpsertContactRequestTopicsItem` — Choices per topic; topics left out keep the contact's choice.
    
</dd>
</dl>

<dl>
<dd>

**doubleOptIn:** `*bool` — Ask the contact to confirm first (default: the marketing settings' `double_opt_in_default`): a new or unsubscribed contact becomes `pending` and gets a confirmation email; it is `subscribed` once they click its link. Can't be combined with `status: "subscribed"`, nor can the default (pass `false` to subscribe directly).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.ResendConfirmation(ID) -> *coss.ContactConfirmation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sends a pending contact (double opt-in) its confirmation email again: at most once a day, and three times before it confirms (`status` says what happened).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ResendConfirmationContactsRequest{
    ID: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Contacts.ResendConfirmation(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.CreatePreferenceLinks(ID, request) -> *coss.PreferenceLinks</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The contact's preference center and unsubscribe links, for emails you build yourself. They never expire. Marketing email sent through coss.com gets them (and one-click unsubscribe headers) automatically. Needs `contact:update`: whoever has the links can change the contact's consent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CreatePreferenceLinksRequest{
    ID: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Topic: coss.String(
        "newsletter",
    ),
}
client.Email.Contacts.CreatePreferenceLinks(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**topic:** `*string` — The topic your email is about: its unsubscribe link leaves just that topic.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Import(request) -> *coss.ContactImport</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates or updates up to 1000 contacts at once (source `import`). Each entry is validated on its own: invalid ones are skipped and listed in `invalid`. Existing contacts get the new names and properties, but an import never re-subscribes an unsubscribed contact (`kept_unsubscribed`). Imports send no `contact.*` webhooks. Over the plan's contact limit nothing is imported.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ImportContactsRequest{
    Contacts: []*email.ImportContactsRequestContactsItem{
        &email.ImportContactsRequestContactsItem{
            Email: "ada@example.com",
            FirstName: coss.String(
                "Ada",
            ),
            Properties: map[string]*email.ImportContactsRequestContactsItemPropertiesValue{
                "plan": &email.ImportContactsRequestContactsItemPropertiesValue{
                    String: "pro",
                },
            },
        },
        &email.ImportContactsRequestContactsItem{
            Email: "grace@example.com",
            Status: coss.String(
                "unsubscribed",
            ),
        },
    },
}
client.Email.Contacts.Import(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**contacts:** `[]*email.ImportContactsRequestContactsItem` — The contacts to create or update, at most 1,000.
    
</dd>
</dl>

<dl>
<dd>

**audienceID:** `*string` — Adds every imported contact to this audience.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Export() -> string</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The contacts of the API key's environment (optionally filtered), oldest first, as CSV with the columns `email,first_name,last_name,status`, one column per custom property, then `created_at,id`. The file can be imported again as is. Values a spreadsheet would run as a formula are prefixed with `'`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ExportContactsRequest{}
client.Email.Contacts.Export(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `*email.ExportContactsRequestStatus` 
    
</dd>
</dl>

<dl>
<dd>

**audienceID:** `*string` — Only members of this audience.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Get(ID) -> *coss.Contact</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One contact of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetContactsRequest{
    ID: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Contacts.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Remove(ID) -> *coss.DeletedContact</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the contact with its audience memberships and topic choices. Its suppressions stay: they are about the address, not the contact.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RemoveContactsRequest{
    ID: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Contacts.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Update(ID, request) -> *coss.Contact</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given; `properties` are merged (`null` removes one).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateContactRequest{
    ID: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
    LastName: coss.String(
        "Byron",
    ),
    Properties: map[string]*email.UpdateContactRequestPropertiesValue{},
}
client.Email.Contacts.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**firstName:** `*string` — Their first name. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**lastName:** `*string` — Their last name. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**properties:** `map[string]*email.UpdateContactRequestPropertiesValue` — Custom properties by key (define them first, see contact properties). Merged into the contact's existing properties; `null` removes one.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*email.UpdateContactRequestStatus` — Sets the contact's consent. Omitted, a new contact is `subscribed` and an existing one keeps its status.
    
</dd>
</dl>

<dl>
<dd>

**topics:** `[]*email.UpdateContactRequestTopicsItem` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.GetTopics(ID) -> *coss.ContactTopics</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every topic of the environment with the contact's choice and whether its emails reach them.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetTopicsContactsRequest{
    ID: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Contacts.GetTopics(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.UpdateTopics(ID, request) -> *coss.ContactTopics</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Records the contact's choices for the topics given; the others keep theirs.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateContactTopicsRequest{
    ID: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Topics: []*email.UpdateContactTopicsRequestTopicsItem{
        &email.UpdateContactTopicsRequestTopicsItem{
            Topic: "product",
            Status: email.UpdateContactTopicsRequestTopicsItemStatusOptedOut,
        },
    },
}
client.Email.Contacts.UpdateTopics(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**topics:** `[]*email.UpdateContactTopicsRequestTopicsItem` — The contact's choices per topic. Topics not listed keep theirs.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Broadcasts
<details><summary><code>client.Email.Broadcasts.List() -> *coss.BroadcastList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The API key's environment's broadcasts, newest first, with their stats.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListBroadcastsRequest{}
client.Email.Broadcasts.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `*email.ListBroadcastsRequestStatus` 
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last broadcast of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Create(request) -> *coss.Broadcast</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a draft, or with `send` or `scheduled_at` a broadcast that starts sending (so it needs `broadcast:send` too). A broadcast goes to every contact of its audience or segment who is subscribed, reached by its topic and not suppressed, as one email each, at the plan's marketing rate.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CreateBroadcastRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Name: "October newsletter",
    SegmentID: coss.String(
        "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ),
    Topic: coss.String(
        "newsletter",
    ),
    From: "Acme <news@acme.com>",
    Subject: "What's new, {{{contact.first_name|there}}}",
    HTML: coss.String(
        `<p>Hi {{{contact.first_name|there}}},</p><p>…</p><p><a href="{{{unsubscribe_url}}}">Unsubscribe</a></p>`,
    ),
    ScheduledAt: coss.Time(
        coss.MustParseDateTime(
            "2026-10-20T09:00:00Z",
        ),
    ),
}
client.Email.Broadcasts.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the broadcast created first instead of creating another, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**name:** `string` — Shown only to you.
    
</dd>
</dl>

<dl>
<dd>

**audienceID:** `*string` — Send to this audience…
    
</dd>
</dl>

<dl>
<dd>

**segmentID:** `*string` — …or to this segment (one of the two).
    
</dd>
</dl>

<dl>
<dd>

**topic:** `*string` — The topic the broadcast is about (its key): only contacts it reaches get it, and its unsubscribe link leaves just that topic. It is the emails' `category`.
    
</dd>
</dl>

<dl>
<dd>

**from:** `string` 
    
</dd>
</dl>

<dl>
<dd>

**replyTo:** `[]string` — Addresses replies go to.
    
</dd>
</dl>

<dl>
<dd>

**subject:** `string` — May use `{{{contact.<key>|fallback}}}` (e.g. `{{{contact.first_name|there}}}`).
    
</dd>
</dl>

<dl>
<dd>

**previewText:** `*string` — The inbox preview line (a hidden preheader at the start of the HTML).
    
</dd>
</dl>

<dl>
<dd>

**html:** `*string` — `{{{contact.<key>|fallback}}}` for contact fields and properties (escaped), and `{{{unsubscribe_url}}}`, `{{{preferences_url}}}`, `{{{mailing_address}}}`; a footer with the postal address and an unsubscribe link is added unless they are there.
    
</dd>
</dl>

<dl>
<dd>

**text:** `*string` — The plain text part. Takes the same placeholders as `html`.
    
</dd>
</dl>

<dl>
<dd>

**tracking:** `*email.CreateBroadcastRequestTracking` — Which opens and clicks are tracked.
    
</dd>
</dl>

<dl>
<dd>

**ratePerSecond:** `*int` — Recipients per second, at most the plan's marketing rate (the default).
    
</dd>
</dl>

<dl>
<dd>

**send:** `*bool` — Start sending right away.
    
</dd>
</dl>

<dl>
<dd>

**scheduledAt:** `*time.Time` — Start sending at this time (ISO 8601 with an offset, at most 30 days ahead).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Get(ID) -> *coss.Broadcast</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One broadcast of the API key's environment, with its status and stats.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetBroadcastsRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Broadcasts.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Remove(ID) -> *coss.DeletedBroadcast</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes a draft, or a broadcast canceled before any of its emails were made.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RemoveBroadcastsRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Broadcasts.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Update(ID, request) -> *coss.Broadcast</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes a draft; fields left out keep their value, `null` clears one.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateBroadcastRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Subject: coss.String(
        "Our October news",
    ),
}
client.Email.Broadcasts.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Shown only to you.
    
</dd>
</dl>

<dl>
<dd>

**audienceID:** `*string` — Send to this audience. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**segmentID:** `*string` — Send to this segment. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**topic:** `*string` — The topic it's about (its key). `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**from:** `*string` 
    
</dd>
</dl>

<dl>
<dd>

**replyTo:** `[]string` — Addresses replies go to.
    
</dd>
</dl>

<dl>
<dd>

**subject:** `*string` — May use `{{{contact.<key>|fallback}}}` (e.g. `{{{contact.first_name|there}}}`).
    
</dd>
</dl>

<dl>
<dd>

**previewText:** `*string` — The inbox preview line. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**html:** `*string` — The HTML part. `null` removes it, if `text` remains.
    
</dd>
</dl>

<dl>
<dd>

**text:** `*string` — The plain text part. `null` removes it, if `html` remains.
    
</dd>
</dl>

<dl>
<dd>

**tracking:** `*email.UpdateBroadcastRequestTracking` — Which opens and clicks are tracked.
    
</dd>
</dl>

<dl>
<dd>

**ratePerSecond:** `*int` — Recipients per second. `null`: the plan's marketing rate.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Send(ID, request) -> *coss.Broadcast</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Starts sending a draft, now or at `scheduled_at`. Sending a broadcast that already started returns it as it is.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.SendBroadcastRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ScheduledAt: coss.Time(
        coss.MustParseDateTime(
            "2026-10-20T09:00:00Z",
        ),
    ),
}
client.Email.Broadcasts.Send(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**scheduledAt:** `*time.Time` — Omit to start right away.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Cancel(ID) -> *coss.Broadcast</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Stops it for good: its emails not yet handed to the provider are dropped (the ones on their way still go). Canceling a canceled broadcast returns it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CancelBroadcastsRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Broadcasts.Cancel(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Pause(ID) -> *coss.Broadcast</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Pauses a scheduled or sending broadcast; emails not yet handed to the provider are dropped and made again when it is resumed.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.PauseBroadcastsRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Broadcasts.Pause(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Resume(ID) -> *coss.Broadcast</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Resumes a paused broadcast where it stopped.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ResumeBroadcastsRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Broadcasts.Resume(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.Test(ID, request) -> *coss.BroadcastTest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sends its content to up to 5 addresses as ordinary marketing emails (subject prefixed `[Test]`), filled with `contact`'s values or the fallbacks. They count like any send.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.TestBroadcastRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
    To: []string{
        "me@acme.com",
    },
}
client.Email.Broadcasts.Test(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**to:** `[]string` — Who gets the test, at most 5 addresses.
    
</dd>
</dl>

<dl>
<dd>

**contact:** `*string` — A contact (id or address) whose values fill the template; default: fallbacks.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.ListEmails(ID) -> *coss.BroadcastEmailList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The emails made so far, one per contact, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListEmailsBroadcastsRequest{
    ID: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Broadcasts.ListEmails(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last email of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Audiences
<details><summary><code>client.Email.Audiences.List() -> *coss.AudienceList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The static contact lists of the API key's environment, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListAudiencesRequest{}
client.Email.Audiences.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.Create(request) -> *coss.Audience</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates a static contact list in the API key's environment. Names are unique within it (`name_taken`). Add its members with `POST /v1/audiences/{id}/contacts`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CreateAudienceRequest{
    Name: "Beta testers",
}
client.Email.Audiences.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — Your name for the list, unique in the environment.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.Get(ID) -> *coss.Audience</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One audience of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetAudiencesRequest{
    ID: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Audiences.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The audience's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.Remove(ID) -> *coss.DeletedAudience</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the audience; its contacts stay. Refused while a segment filters on it (`audience_in_use`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RemoveAudiencesRequest{
    ID: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Audiences.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The audience's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.Update(ID, request) -> *coss.Audience</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Renames an audience. Its members stay.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateAudienceRequest{
    ID: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Name: "Early access",
}
client.Email.Audiences.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `string` — Your name for the list, unique in the environment.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.ListContacts(ID) -> *coss.ContactList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The audience's members, whatever their status, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListContactsAudiencesRequest{
    ID: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Audiences.ListContacts(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.AddContacts(ID, request) -> *coss.AudienceContactsAdded</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Adds existing contacts, by id or address. Members already in it are counted in `existing`; unknown ones are listed in `missing` (create them first).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.AddAudienceContactsRequest{
    ID: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Contacts: []string{
        "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
        "grace@example.com",
    },
}
client.Email.Audiences.AddContacts(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**contacts:** `[]string` — Contact ids or addresses of existing contacts.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.RemoveContact(ID, ContactID) -> *email.RemoveContactAudiencesResponse</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Takes a contact out of the audience. The contact itself stays.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RemoveContactAudiencesRequest{
    ID: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ContactID: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Audiences.RemoveContact(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**contactID:** `string` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Segments
<details><summary><code>client.Email.Segments.List() -> *coss.SegmentList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The segments (contact filters) of the API key's environment, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListSegmentsRequest{}
client.Email.Segments.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.Create(request) -> *coss.Segment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A segment is a filter over the environment's contacts, evaluated whenever it is used, so its contacts are always current.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CreateSegmentRequest{
    Name: "Pro customers",
    Filter: &coss.SegmentFilter{
        Version: 1,
        Match: coss.SegmentFilterMatchAll,
        Conditions: []*coss.SegmentFilterConditionsItem{
            &coss.SegmentFilterConditionsItem{
                SegmentFilterConditionsItemKey: &coss.SegmentFilterConditionsItemKey{
                    Field: coss.SegmentFilterConditionsItemKeyFieldProperty,
                    Key: "plan",
                    Op: coss.SegmentFilterConditionsItemKeyOpEq,
                    Value: &coss.SegmentFilterConditionsItemKeyValue{
                        String: "pro",
                    },
                },
            },
            &coss.SegmentFilterConditionsItem{
                SegmentFilterConditionsItemConditions: &coss.SegmentFilterConditionsItemConditions{
                    Match: coss.SegmentFilterConditionsItemConditionsMatchAny,
                    Conditions: []*coss.SegmentFilterConditionsItemConditionsConditionsItem{
                        &coss.SegmentFilterConditionsItemConditionsConditionsItem{
                            Email: &coss.SegmentFilterConditionsItemConditionsConditionsItemEmail{
                                Op: coss.SegmentFilterConditionsItemConditionsConditionsItemEmailOpEndsWith,
                                Value: "@acme.com",
                            },
                        },
                        &coss.SegmentFilterConditionsItemConditionsConditionsItem{
                            Audience: &coss.SegmentFilterConditionsItemConditionsConditionsItemAudience{
                                Op: coss.SegmentFilterConditionsItemConditionsConditionsItemAudienceOpIn,
                                AudienceID: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
                            },
                        },
                    },
                },
            },
        },
    },
}
client.Email.Segments.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — Your name for the segment, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**filter:** `*coss.SegmentFilter` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.Get(ID) -> *coss.Segment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One segment of the API key's environment, with its filter.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetSegmentsRequest{
    ID: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Segments.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The segment's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.Remove(ID) -> *coss.DeletedSegment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes a segment. The contacts it matched stay.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RemoveSegmentsRequest{
    ID: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Segments.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The segment's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.Update(ID, request) -> *coss.Segment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes a segment's name or filter. Only the fields given change.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateSegmentRequest{
    ID: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Name: coss.String(
        "Pro and Scale customers",
    ),
}
client.Email.Segments.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The segment's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Your name for the segment, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**filter:** `*coss.SegmentFilter` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.ListContacts(ID) -> *coss.ContactList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The contacts the segment's filter matches now, whatever their status, newest first. A broadcast to the segment goes only to the subscribed ones its topic reaches.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListContactsSegmentsRequest{
    ID: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Segments.ListContacts(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The segment's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Topics
<details><summary><code>client.Email.Topics.List() -> *coss.TopicList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The subscription topics of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListTopicsRequest{}
client.Email.Topics.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Topics.Create(request) -> *coss.Topic</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A topic is what contacts subscribe to, built on categories: emails sent with `category` equal to the topic's `key` are about it, so contacts who opted out (or, for an `opt_out` topic, never opted in) are skipped. Public topics show in the preference center.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.CreateTopicRequest{
    Key: "newsletter",
    Name: "Newsletter",
    DefaultSubscription: email.CreateTopicRequestDefaultSubscriptionOptIn,
}
client.Email.Topics.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**key:** `string` — The `category` of the emails about this topic. Can't change.
    
</dd>
</dl>

<dl>
<dd>

**name:** `string` — Shown in the preference center.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Shown in the preference center under its name. `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**defaultSubscription:** `email.CreateTopicRequestDefaultSubscription` — `opt_in`: every subscribed contact gets the topic's emails unless they opt out. `opt_out`: only contacts who opted in do.
    
</dd>
</dl>

<dl>
<dd>

**visibility:** `*email.CreateTopicRequestVisibility` — `private` topics never show in the preference center (default `public`).
    
</dd>
</dl>

<dl>
<dd>

**position:** `*int` — Order in the preference center (ascending).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Topics.Get(ID) -> *coss.Topic</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One topic of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetTopicsRequest{
    ID: "topic_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Topics.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The topic's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Topics.Remove(ID) -> *coss.DeletedTopic</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the topic and every contact's choice for it. Refused while a segment filters on it (`topic_in_use`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.RemoveTopicsRequest{
    ID: "topic_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Topics.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The topic's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Topics.Update(ID, request) -> *coss.Topic</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given; the key can't change.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateTopicRequest{
    ID: "topic_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Visibility: email.UpdateTopicRequestVisibilityPrivate.Ptr(),
}
client.Email.Topics.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The topic's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Shown in the preference center.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Shown in the preference center under its name. `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**defaultSubscription:** `*email.UpdateTopicRequestDefaultSubscription` — `opt_in`: every subscribed contact gets the topic's emails unless they opt out. `opt_out`: only contacts who opted in do.
    
</dd>
</dl>

<dl>
<dd>

**visibility:** `*email.UpdateTopicRequestVisibility` — `private` topics never show in the preference center (default `public`).
    
</dd>
</dl>

<dl>
<dd>

**position:** `*int` — Order in the preference center (ascending).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email MarketingSettings
<details><summary><code>client.Email.MarketingSettings.Get() -> *coss.MarketingSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The API key's environment's sender name and the postal address its marketing emails carry.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Email.MarketingSettings.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.MarketingSettings.Update(request) -> *coss.MarketingSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given (`null` clears one).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.UpdateMarketingSettingsRequest{
    MailingAddress: coss.String(
        "Acme Inc., 548 Market St, San Francisco, CA 94104, USA",
    ),
}
client.Email.MarketingSettings.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**displayName:** `*string` — The sender's name in the preference center. `null`: the organization's.
    
</dd>
</dl>

<dl>
<dd>

**mailingAddress:** `*string` — The postal address every marketing email carries (CAN-SPAM). Marketing emails can't be sent without one.
    
</dd>
</dl>

<dl>
<dd>

**doubleOptInDefault:** `*bool` — Whether contacts upserted without `double_opt_in` must confirm first.
    
</dd>
</dl>

<dl>
<dd>

**confirmationFrom:** `*string` — The sender of confirmation emails (a verified domain's address for live keys).
    
</dd>
</dl>

<dl>
<dd>

**confirmationSubject:** `*string` — `null`: coss.com's default.
    
</dd>
</dl>

<dl>
<dd>

**confirmationHTML:** `*string` — `null`: coss.com's default. Must contain `{{{confirmation_url}}}`.
    
</dd>
</dl>

<dl>
<dd>

**confirmationText:** `*string` — `null`: coss.com's default. Must contain `{{{confirmation_url}}}`.
    
</dd>
</dl>

<dl>
<dd>

**confirmedRedirectURL:** `*string` — Where a confirmed contact is sent, an https URL. `null`: coss.com's own page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Received
<details><summary><code>client.Email.Received.List() -> *coss.ReceivedEmailList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Emails received by the API key's environment, newest first, without their bodies and headers (retrieve one for those). Pass the last `id` as `after` to get the next page while `has_more` is true. An `email.received` webhook announces each one as it arrives.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.ListReceivedRequest{}
client.Email.Received.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last email of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.Address() -> *coss.InboundAddress</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's own domain under coss.com's inbound domain: email sent to any address at it (e.g. `support@<domain>`) is received by this environment, with no DNS setup. To receive at your own domain, add a receiving domain instead.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Email.Received.Address(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.Get(ID) -> *coss.ReceivedEmail</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The received email with its headers, text and HTML bodies (each cut at 2 MB, see `truncated`) and attachment metadata. HTML is the sender's: sanitize it before showing it to anyone.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetReceivedRequest{
    ID: "rcvd_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Received.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The received email's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.Delete(ID) -> *coss.DeletedReceivedEmail</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the received email with its raw message and attachments right away, instead of at the end of its retention period.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.DeleteReceivedRequest{
    ID: "rcvd_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Received.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The received email's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.GetRaw(ID) -> string</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The whole message as received (`message/rfc822`), for your own MIME parser or archive.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetRawReceivedRequest{
    ID: "id",
}
client.Email.Received.GetRaw(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The received email's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.GetAttachment(ID, AttachmentID) -> string</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The attachment's bytes, always as `application/octet-stream` (its declared type is the attachment's `content_type`): treat them as untrusted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &email.GetAttachmentReceivedRequest{
    ID: "id",
    AttachmentID: "attachment_id",
}
client.Email.Received.GetAttachment(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The received email's id.
    
</dd>
</dl>

<dl>
<dd>

**attachmentID:** `string` — The attachment's id (from the received email's `attachments`).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Contacts Properties
<details><summary><code>client.Email.Contacts.Properties.List() -> *coss.ContactPropertyList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every custom contact property of the API key's environment (at most 50), by key.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Email.Contacts.Properties.List(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Properties.Create(request) -> *coss.ContactProperty</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Defines a custom property contacts can have. Its key and type can't change; `fallback` is what templates use for contacts without a value.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &contacts.CreateContactPropertyRequest{
    Key: "plan",
    Type: contacts.CreateContactPropertyRequestTypeString,
    Fallback: &contacts.CreateContactPropertyRequestFallback{
        String: "free",
    },
}
client.Email.Contacts.Properties.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**key:** `string` — How contacts and templates name it. Lower-case letters, digits and `_`, starting with a letter. Can't change.
    
</dd>
</dl>

<dl>
<dd>

**type_:** `contacts.CreateContactPropertyRequestType` — What values it takes. `date` values are ISO 8601 strings. Can't change.
    
</dd>
</dl>

<dl>
<dd>

**fallback:** `*contacts.CreateContactPropertyRequestFallback` — Used in templates for contacts without a value.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Properties.Get(ID) -> *coss.ContactProperty</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One contact property of the API key's environment: its key, type and fallback.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &contacts.GetPropertiesRequest{
    ID: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Contacts.Properties.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The property's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Properties.Remove(ID) -> *coss.DeletedContactProperty</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the property and removes its values from every contact. Refused while a segment filters on it (`property_in_use`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &contacts.RemovePropertiesRequest{
    ID: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Contacts.Properties.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The property's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Properties.Update(ID, request) -> *coss.ContactProperty</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the value used when a contact has none for this property. Its key and type can't change.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &contacts.UpdateContactPropertyRequest{
    ID: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Fallback: &contacts.UpdateContactPropertyRequestFallback{
        String: "starter",
    },
}
client.Email.Contacts.Properties.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The property's id.
    
</dd>
</dl>

<dl>
<dd>

**fallback:** `*contacts.UpdateContactPropertyRequestFallback` — Used in templates for contacts without a value. `null` removes it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Templates Versions
<details><summary><code>client.Email.Templates.Versions.List(ID) -> *coss.EmailTemplateVersionList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Published versions, newest first. Pass the last `version` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &templates.ListVersionsRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Email.Templates.Versions.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-20, default 10.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*int64` — Cursor: the `version` of the last version of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Versions.Get(ID, Version) -> *coss.EmailTemplateVersion</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A published version, which never changes.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &templates.GetVersionsRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Version: int64(1),
}
client.Email.Templates.Versions.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**version:** `int64` — A published version number.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Versions.Restore(ID, Version) -> *coss.EmailTemplateVersion</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Replaces the draft with a published version's variables and content. Publish the draft to make sends use it again.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &templates.RestoreVersionsRequest{
    ID: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Version: int64(1),
}
client.Email.Templates.Versions.Restore(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**version:** `int64` — A published version number.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Forms Submissions
<details><summary><code>client.Forms.Submissions.List(ID) -> *coss.FormSubmissionList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Newest first. `status` narrows them: `accepted` (delivered), `held` (Risk asked for a review), `spam` and `pending_confirmation` (waiting for the submitter's email link).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &forms.ListSubmissionsRequest{
    ID: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
}
client.Forms.Submissions.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*string` — Only submissions in these statuses, comma-separated: `held,spam`.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Submissions.Get(ID, SubmissionID) -> *coss.FormSubmission</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One submission of the form, with its data, files and Risk's assessment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &forms.GetSubmissionsRequest{
    ID: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
    SubmissionID: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k",
}
client.Forms.Submissions.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**submissionID:** `string` — The submission's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Submissions.Remove(ID, SubmissionID) -> *coss.DeletedFormSubmission</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the submission and its files.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &forms.RemoveSubmissionsRequest{
    ID: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
    SubmissionID: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k",
}
client.Forms.Submissions.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**submissionID:** `string` — The submission's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Submissions.Release(ID, SubmissionID) -> *coss.FormSubmission</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Not spam: a `held` or `spam` submission becomes `accepted` and is delivered (webhooks, notifications, contacts), and Risk records its assessment as `legitimate`. Releasing an accepted submission returns it as is.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &forms.ReleaseSubmissionsRequest{
    ID: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
    SubmissionID: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k",
}
client.Forms.Submissions.Release(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**submissionID:** `string` — The submission's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Submissions.File(ID, SubmissionID, FileID) -> string</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A file uploaded with the submission, as `application/octet-stream`: whatever its type, treat it as untrusted (a submitter chose it).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &forms.FileSubmissionsRequest{
    ID: "id",
    SubmissionID: "submission_id",
    FileID: "file_id",
}
client.Forms.Submissions.File(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**submissionID:** `string` — The submission's id.
    
</dd>
</dl>

<dl>
<dd>

**fileID:** `string` — The file's id (`files[].id` of the submission).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks EventTypes
<details><summary><code>client.Hooks.EventTypes.List() -> *coss.HookEventTypeList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's event types by name; archived ones only with `include_archived`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.ListEventTypesRequest{}
client.Hooks.EventTypes.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**includeArchived:** `*hooks.ListEventTypesRequestIncludeArchived` — Also list archived types (default `false`).
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `name` of the last type of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.EventTypes.Create(request) -> *coss.HookEventType</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Adds a type to the catalog your applications' users subscribe from (in the portal, or the `filter_types` of an endpoint), with a description, a JSON Schema and examples to show them. Messages can be sent with any type, registered or not. Hooks resources belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.CreateHookEventTypeRequest{
    Name: "invoice.paid",
    Description: coss.String(
        "An invoice was paid in full.",
    ),
    Examples: []map[string]any{
        map[string]any{
            "amount": 4200,
            "currency": "usd",
            "invoice_id": "in_1042",
        },
    },
}
client.Hooks.EventTypes.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — The type's name, which messages send as `event_type`. Letters, digits and `. _ -`.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — What this event means, shown to your users.
    
</dd>
</dl>

<dl>
<dd>

**schema:** `map[string]any` — A JSON Schema of the payload, shown to your users (not enforced).
    
</dd>
</dl>

<dl>
<dd>

**examples:** `[]map[string]any` — Up to 5 example payloads; the first is what a test send delivers.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.EventTypes.Get(Name) -> *coss.HookEventType</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An event type of the API key's environment, archived or not.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.GetEventTypesRequest{
    Name: "invoice.paid",
}
client.Hooks.EventTypes.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — The event type's name.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.EventTypes.Archive(Name) -> *coss.HookEventType</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Hides the type from the portal and from new subscriptions. Endpoints already subscribed keep receiving it. Restore it with `PATCH … { archived: false }`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.ArchiveEventTypesRequest{
    Name: "invoice.paid",
}
client.Hooks.EventTypes.Archive(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — The event type's name.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.EventTypes.Update(Name, request) -> *coss.HookEventType</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes its description, schema or examples, or archives or restores it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.UpdateHookEventTypeRequest{
    Name: "invoice.paid",
    Archived: coss.Bool(
        false,
    ),
}
client.Hooks.EventTypes.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — The event type's name.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — What this event means, shown to your users. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**schema:** `map[string]any` — A JSON Schema of the payload, shown to your users (not enforced).
    
</dd>
</dl>

<dl>
<dd>

**examples:** `[]map[string]any` — Up to 5 example payloads; the first is what a test send delivers.
    
</dd>
</dl>

<dl>
<dd>

**archived:** `*bool` — `false` restores an archived type.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Applications
<details><summary><code>client.Hooks.Applications.List() -> *coss.HookApplicationList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's applications, newest first. Hooks resources belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.ListApplicationsRequest{}
client.Hooks.Applications.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last application of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Applications.Create(request) -> *coss.HookApplication</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Creates an application: one of your customers (or users), who gets their own endpoints and portal. Give it a `uid` (e.g. your customer's id) to address it by in every path. Hooks resources belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.CreateHookApplicationRequest{
    Name: "Acme Corp",
    UID: coss.String(
        "customer_8812",
    ),
    Metadata: map[string]string{
        "plan": "pro",
    },
}
client.Hooks.Applications.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — Shown to the application's users in the portal.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `*string` — Your own id for it, to address it by in every path instead of its `id`.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Applications.Get(Application) -> *coss.HookApplication</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An application of the API key's environment, by its id or uid.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.GetApplicationsRequest{
    Application: "customer_8812",
}
client.Hooks.Applications.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Applications.Delete(Application) -> *coss.DeletedHookApplication</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the application with its endpoints and portal sessions; pending deliveries stop. Its messages are no longer reachable and are deleted with the rest of their day's data.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.DeleteApplicationsRequest{
    Application: "customer_8812",
}
client.Hooks.Applications.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Applications.Update(Application, request) -> *coss.HookApplication</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the name, uid or metadata. Fields left out keep their value.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.UpdateHookApplicationRequest{
    Application: "customer_8812",
    Name: coss.String(
        "Acme Corporation",
    ),
}
client.Hooks.Applications.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Shown to the application's users in the portal.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `*string` — `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Replaces the metadata.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Endpoints
<details><summary><code>client.Hooks.Endpoints.List(Application) -> *coss.HookEndpointList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The application's endpoints, oldest first. Secrets are never included.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.ListEndpointsRequest{
    Application: "customer_8812",
}
client.Hooks.Endpoints.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.Create(Application, request) -> *coss.HookEndpointWithSecret</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Registers a URL of the application's user that receives its messages, each request signed (Standard Webhooks) with the endpoint's own secret, returned here. Usually your users add endpoints themselves in the portal. Hooks resources belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.CreateHookEndpointRequest{
    Application: "customer_8812",
    URL: "https://example.com/webhooks",
    FilterTypes: []string{
        "invoice.paid",
    },
}
client.Hooks.Endpoints.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**url:** `string` 
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Your note about it.
    
</dd>
</dl>

<dl>
<dd>

**filterTypes:** `[]string` — Event types delivered to this endpoint (existing, unarchived ones). An empty array means every type, including ones added later.
    
</dd>
</dl>

<dl>
<dd>

**secret:** `*string` — A `whsec_` + base64 secret of 24-64 bytes to sign with, e.g. when migrating from another provider. Generated when omitted.
    
</dd>
</dl>

<dl>
<dd>

**rateLimitPerSecond:** `*int` — At most this many requests per second to this endpoint.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `*bool` — Default `true`. `false` creates it disabled, with `disabled_reason: manual`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.Get(Application, EndpointID) -> *coss.HookEndpoint</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An endpoint of the application.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.GetEndpointsRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Endpoints.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.Delete(Application, EndpointID) -> *coss.DeletedHookEndpoint</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes the endpoint; its pending deliveries fail. Its delivery log stays.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.DeleteEndpointsRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Endpoints.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.Update(Application, EndpointID, request) -> *coss.HookEndpoint</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the URL, description, filter types, rate limit, metadata or `enabled`. Enabling it again clears a failure streak. The secret stays the same (see roll secret).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.UpdateHookEndpointRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Enabled: coss.Bool(
        false,
    ),
}
client.Hooks.Endpoints.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**url:** `*string` — Where deliveries are sent.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Your note about it. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**filterTypes:** `[]string` — Event types delivered to this endpoint (existing, unarchived ones). An empty array means every type, including ones added later.
    
</dd>
</dl>

<dl>
<dd>

**rateLimitPerSecond:** `*int` — At most this many requests per second to this endpoint.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `*bool` — `false` disables it with `disabled_reason: manual`; `true` enables it again and clears the reason.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.GetSecret(Application, EndpointID) -> *coss.HookEndpointSecret</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The endpoint's current signing secret, e.g. to show its user. Needs `hook:update`, like rolling it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.GetSecretEndpointsRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Endpoints.GetSecret(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.RollSecret(Application, EndpointID, request) -> *coss.HookEndpointWithSecret</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Replaces the signing secret, returned here. Until `previous_secret_expires_at`, requests carry a signature with each secret, so the receiver can switch without rejecting any. Not idempotent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.RollHookEndpointSecretRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    PreviousSecretExpiresIn: coss.Int(
        3600,
    ),
}
client.Hooks.Endpoints.RollSecret(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**previousSecretExpiresIn:** `*int` — Seconds the current secret keeps signing next to the new one. Default 86400 (a day), at most 604800 (a week); `0` stops it immediately.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.Recover(Application, EndpointID, request) -> *coss.HookEndpointRecovery</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Queues every delivery to the endpoint that failed, of messages sent since `since`, for one more attempt each, e.g. after its receiver was down. coss.com works through them in the background (oldest first); follow `status` with the returned recovery. The endpoint must be enabled.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.RecoverHookEndpointRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Since: coss.MustParseDateTime(
        "2026-01-15T00:00:00Z",
    ),
}
client.Hooks.Endpoints.Recover(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**since:** `time.Time` — Requeue deliveries that failed, of messages sent from this time until now.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.GetRecovery(Application, EndpointID, RecoveryID) -> *coss.HookEndpointRecovery</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A recovery of the endpoint: `pending` while deliveries are still being requeued.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.GetRecoveryEndpointsRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    RecoveryID: "hrec_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Endpoints.GetRecovery(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**recoveryID:** `string` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.SendTest(Application, EndpointID, request) -> *coss.HookMessage</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sends a message to this endpoint only (whatever its filter), with the given payload or the event type's first example. It counts against the send quota like any message.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.SendHookTestRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    EventType: "invoice.paid",
}
client.Hooks.Endpoints.SendTest(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**eventType:** `string` — The event type to send as.
    
</dd>
</dl>

<dl>
<dd>

**payload:** `map[string]any` — Defaults to the event type's first example.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.ListDeliveries(Application, EndpointID) -> *coss.HookDeliveryList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The endpoint's deliveries, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.ListDeliveriesEndpointsRequest{
    Application: "customer_8812",
    EndpointID: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Endpoints.ListDeliveries(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpointID:** `string` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*hooks.ListDeliveriesEndpointsRequestStatus` — Only deliveries with this status.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last delivery of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Messages
<details><summary><code>client.Hooks.Messages.List(Application) -> *coss.HookMessageList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The application's messages, newest first (kept for 30 days).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.ListMessagesRequest{
    Application: "customer_8812",
}
client.Hooks.Messages.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**eventType:** `*string` — Only messages of this type.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last message of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Messages.Send(Application, request) -> *coss.HookMessage</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Queues a message to the application: coss.com delivers it to each of its enabled endpoints subscribed to `event_type` within seconds, signed with each endpoint's secret, and retries failures with backoff for about a day. Each request's `webhook-id` header is the message's id. Counts against the send quota once per endpoint it goes to (at least once). A live message is billed once, whatever its fan-out; retries and sandbox are free. Live sends are refused while the organization is suspended (`account_suspended`), on a billing hold (`billing_hold`), over a budget (`budget_exceeded`) or past Free's monthly messages (`usage_limit_exceeded`). Hooks resources belong to the API key's own environment: a `coss_test_…` key only ever sees sandbox ones, a `coss_live_…` key only production ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.SendHookMessageRequest{
    Application: "customer_8812",
    IdempotencyKey: coss.String(
        "invoice-1042-paid",
    ),
    EventType: "invoice.paid",
    Payload: map[string]any{
        "amount": 4200,
        "currency": "usd",
        "invoice_id": "in_1042",
    },
}
client.Hooks.Messages.Send(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original message instead of sending again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**eventType:** `string` — What happened, e.g. `invoice.paid`. Endpoints that filter by type only get the types they chose. The type doesn't have to be registered.
    
</dd>
</dl>

<dl>
<dd>

**payload:** `map[string]any` — The JSON object delivered as the request body (at most 256 KB serialized). It is parsed and serialized again: send integers beyond 2^53 as strings.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Messages.Get(Application, MessageID) -> *coss.HookMessage</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A message of the application, with its payload.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.GetMessagesRequest{
    Application: "customer_8812",
    MessageID: "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Messages.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**messageID:** `string` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Messages.ListDeliveries(Application, MessageID) -> *coss.HookDeliveryList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One delivery per endpoint the message went to.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.ListDeliveriesMessagesRequest{
    Application: "customer_8812",
    MessageID: "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Messages.ListDeliveries(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**messageID:** `string` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Deliveries
<details><summary><code>client.Hooks.Deliveries.Get(Application, DeliveryID) -> *coss.HookDelivery</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One message's delivery to one endpoint.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.GetDeliveriesRequest{
    Application: "customer_8812",
    DeliveryID: "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Deliveries.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**deliveryID:** `string` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Deliveries.ListAttempts(Application, DeliveryID) -> *coss.HookAttemptList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every HTTP request of the delivery, oldest first, with response excerpts.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.ListAttemptsDeliveriesRequest{
    Application: "customer_8812",
    DeliveryID: "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Deliveries.ListAttempts(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**deliveryID:** `string` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Deliveries.Retry(Application, DeliveryID) -> *coss.HookDelivery</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Queues a finished delivery for one more attempt within seconds, to the endpoint's current URL and secret. A `pending` delivery is returned unchanged.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.RetryDeliveriesRequest{
    Application: "customer_8812",
    DeliveryID: "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Hooks.Deliveries.Retry(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**deliveryID:** `string` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Portal
<details><summary><code>client.Hooks.Portal.CreateSession(Application, request) -> *coss.HookPortalSession</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Signs the application's user in to the portal, where they add endpoints, pick event types, see deliveries and retry them, without you building any UI. Create one each time the user opens it (from your backend: never expose the API key) and open or embed the returned `url`; embedding needs the site's origin in the environment's portal settings.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &hooks.CreateHookPortalSessionRequest{
    Application: "customer_8812",
    ExpiresIn: coss.Int(
        3600,
    ),
}
client.Hooks.Portal.CreateSession(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `string` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**expiresIn:** `*int` — Seconds until it expires: default 3600, at most 86400.
    
</dd>
</dl>

<dl>
<dd>

**readOnly:** `*bool` — The user can look but not change anything.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes Threads
<details><summary><code>client.Inboxes.Threads.List(InboxID) -> *coss.InboxThreadList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The inbox's conversations, the one with the latest message first, with a preview of that message. A thread whose `last_inbound_at` equals its `last_message_at` awaits a reply. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &inboxes.ListThreadsRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Inboxes.Threads.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Threads.Get(InboxID, ThreadID) -> *coss.InboxThread</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The conversation with its latest messages, oldest first, each with its text and `extracted_text` (its own words, without the quoted conversation): what an agent reads before it replies. HTML is the sender's: sanitize it before showing it to anyone.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &inboxes.GetThreadsRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ThreadID: "thread_01k7c8m4r0c2b8w9y3d5f6g7h8",
}
client.Inboxes.Threads.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**threadID:** `string` — The thread's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Threads.Delete(InboxID, ThreadID) -> *coss.DeletedInboxThread</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the conversation from the inbox. Its received emails and emails stay in the environment until their retention ends; a later reply starts a new thread.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &inboxes.DeleteThreadsRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ThreadID: "thread_01k7c8m4r0c2b8w9y3d5f6g7h8",
}
client.Inboxes.Threads.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**threadID:** `string` — The thread's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes Messages
<details><summary><code>client.Inboxes.Messages.List(InboxID) -> *coss.InboxMessageList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Messages of every thread, newest first, with a preview instead of their bodies (retrieve one for those). Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &inboxes.ListMessagesRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Inboxes.Messages.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**direction:** `*inboxes.ListMessagesRequestDirection` — Only inbound (received) or outbound (sent) messages.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Messages.Send(InboxID, request) -> *coss.InboxMessage</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Starts a thread with a message from the inbox's address, sent like any email (its `email_id` has its delivery events and webhooks; never tracked). Replies to it arrive in the same thread. Live inboxes send only from receiving domains under one of the organization's verified domains (`can_send`); sandbox ones always can, and deliver nothing. Recipients count against the send quota.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &inboxes.SendInboxMessageRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    To: &inboxes.SendInboxMessageRequestTo{
        String: "jane@example.com",
    },
    Subject: "Your order",
    Text: coss.String(
        "Hi Jane, your order has shipped.",
    ),
}
client.Inboxes.Messages.Send(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes the send safe to retry: a repeat with the same key and body returns the first message instead of sending again (keys are per inbox). 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**to:** `*inboxes.SendInboxMessageRequestTo` — Who it goes to.
    
</dd>
</dl>

<dl>
<dd>

**cc:** `*inboxes.SendInboxMessageRequestCc` — Who it's copied to.
    
</dd>
</dl>

<dl>
<dd>

**bcc:** `*inboxes.SendInboxMessageRequestBcc` — Who it's blind copied to.
    
</dd>
</dl>

<dl>
<dd>

**subject:** `string` — The new thread's subject.
    
</dd>
</dl>

<dl>
<dd>

**text:** `*string` — Plain-text body. Without it, an `html` email goes out with a text part generated from the HTML.
    
</dd>
</dl>

<dl>
<dd>

**html:** `*string` — HTML body. Provide `html`, `text`, or both.
    
</dd>
</dl>

<dl>
<dd>

**attachments:** `[]*coss.SendEmailAttachment` — Up to 20 files, at most 25 MB combined.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `[]*inboxes.SendInboxMessageRequestTagsItem` — Your tags on the email.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Messages.Get(InboxID, MessageID) -> *coss.InboxMessage</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The message with its text, HTML and `extracted_text`. An outbound message's delivery is its email's (`email_id`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &inboxes.GetMessagesRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
    MessageID: "imsg_01k7c8m4s1d3c9x0z4e6g7h8j9",
}
client.Inboxes.Messages.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**messageID:** `string` — The message's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Messages.GetAttachment(InboxID, MessageID, AttachmentID) -> string</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An inbound message's attachment, always as `application/octet-stream` (its declared type is the attachment's `content_type`): treat it as untrusted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &inboxes.GetAttachmentMessagesRequest{
    InboxID: "inbox_id",
    MessageID: "message_id",
    AttachmentID: "attachment_id",
}
client.Inboxes.Messages.GetAttachment(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**messageID:** `string` — The message's id.
    
</dd>
</dl>

<dl>
<dd>

**attachmentID:** `string` — The attachment's id (from the message's `attachments`).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Messages.Reply(InboxID, MessageID, request) -> *coss.InboxMessage</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Replies in the message's thread from the inbox's address: to its sender (its `Reply-To` first), or to an outbound message's recipients again for a follow-up; `reply_all` adds everyone else on it. The subject gets `Re:`, and `In-Reply-To`/`References` let the recipient's mail client thread it. Sent like any email, counted against the send quota.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &inboxes.ReplyInboxMessageRequest{
    InboxID: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
    MessageID: "imsg_01k7c8m4s1d3c9x0z4e6g7h8j9",
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Text: coss.String(
        "Sorry about that, Jane! A new one is on its way.",
    ),
}
client.Inboxes.Messages.Reply(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inboxID:** `string` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**messageID:** `string` — The message's id.
    
</dd>
</dl>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes the send safe to retry: a repeat with the same key and body returns the first message instead of sending again (keys are per inbox). 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**replyAll:** `*bool` — Also reply to everyone else on the message (its `to` and `cc`, but the inbox). Default `false`: only the sender (its `Reply-To`, when it has one).
    
</dd>
</dl>

<dl>
<dd>

**cc:** `*inboxes.ReplyInboxMessageRequestCc` — Who it's copied to.
    
</dd>
</dl>

<dl>
<dd>

**bcc:** `*inboxes.ReplyInboxMessageRequestBcc` — Who it's blind copied to.
    
</dd>
</dl>

<dl>
<dd>

**text:** `*string` — Plain-text body. Without it, an `html` email goes out with a text part generated from the HTML.
    
</dd>
</dl>

<dl>
<dd>

**html:** `*string` — HTML body. Provide `html`, `text`, or both.
    
</dd>
</dl>

<dl>
<dd>

**attachments:** `[]*coss.SendEmailAttachment` — Up to 20 files, at most 25 MB combined.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `[]*inboxes.ReplyInboxMessageRequestTagsItem` — Your tags on the email.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## LogDrains Batches
<details><summary><code>client.LogDrains.Batches.List(ID) -> *coss.LogDrainBatchList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The drain's delivery log, newest first: one batch per request, with every HTTP attempt. A failing batch is retried with backoff for about a day (10 attempts); if every attempt fails, the drain is disabled. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &logdrains.ListBatchesRequest{
    ID: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.LogDrains.Batches.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The log drain's id.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*logdrains.ListBatchesRequestStatus` — Only batches with this status.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last batch of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.Batches.Get(ID, BatchID) -> *coss.LogDrainBatch</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One batch of the drain, with every HTTP attempt.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &logdrains.GetBatchesRequest{
    ID: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
    BatchID: "drainbat_01k7c8n2b5d7f9h1k3m5p7r9tv",
}
client.LogDrains.Batches.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The log drain's id.
    
</dd>
</dl>

<dl>
<dd>

**batchID:** `string` — The batch's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Assessments
<details><summary><code>client.Risk.Assessments.List() -> *coss.RiskAssessmentList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The assessments of the API key's environment, newest first. `review_status=open` is the review queue. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.ListAssessmentsRequest{}
client.Risk.Assessments.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event:** `*coss.RiskEvent` — What is being assessed. `custom` events are named by `event_name`; velocity is counted per event.
    
</dd>
</dl>

<dl>
<dd>

**decision:** `*coss.RiskDecision` — `allow`: go ahead. `review`: suspicious; let it through with limits, or hold it for a person. `block`: refuse it.
    
</dd>
</dl>

<dl>
<dd>

**userID:** `*string` — Only assessments of this user.
    
</dd>
</dl>

<dl>
<dd>

**reviewStatus:** `*risk.ListAssessmentsRequestReviewStatus` — `open`: the review queue.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last entry of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Assessments.Get(ID) -> *coss.RiskAssessment</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The email address and IP address are removed 90 days after the assessment; the decision, reasons and signals stay for a year.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.GetAssessmentsRequest{
    ID: "rsk_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Risk.Assessments.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The assessment's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Lists
<details><summary><code>client.Risk.Lists.List() -> *coss.RiskListEntryList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's list entries, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.ListListsRequest{}
client.Risk.Lists.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**list:** `*coss.RiskList` — Which list: `allow` or `block`.
    
</dd>
</dl>

<dl>
<dd>

**type_:** `*coss.RiskListEntryType` — `email` (matched by mailbox, dots and `+tags` folded), `domain` (subdomains included), `ip` (an address or CIDR range), `asn`, `country` (ISO 3166-1 alpha-2), `user` (your user id).
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last entry of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Lists.Add(request) -> *coss.RiskListEntry</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Adds an email address (matched by mailbox), domain (with its subdomains), IP address or CIDR range, AS number, country or user id to the environment's allow or block list. An allow-list match makes the decision `allow` whatever else fired; a block-list match makes it `block`. Adding an entry that already exists returns it with status 200.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.CreateRiskListEntryRequest{
    List: coss.RiskListBlock,
    Type: coss.RiskListEntryTypeDomain,
    Value: "evil.example",
    Note: coss.String(
        "Card testing",
    ),
}
client.Risk.Lists.Add(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**list:** `coss.RiskList` 
    
</dd>
</dl>

<dl>
<dd>

**type_:** `coss.RiskListEntryType` 
    
</dd>
</dl>

<dl>
<dd>

**value:** `string` — What to match: the address, domain, IP, CIDR range, ASN or other value of its `type`.
    
</dd>
</dl>

<dl>
<dd>

**note:** `*string` — Your note about it.
    
</dd>
</dl>

<dl>
<dd>

**expiresAt:** `*time.Time` — The entry stops matching at this time (it is kept until deleted).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Lists.Get(ID) -> *coss.RiskListEntry</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One allow or block list entry of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.GetListsRequest{
    ID: "rskle_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Risk.Lists.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The list entry's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Lists.Remove(ID) -> *coss.DeletedRiskListEntry</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes an entry from its list. Later assessments no longer see it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.RemoveListsRequest{
    ID: "rskle_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Risk.Lists.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The list entry's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Users
<details><summary><code>client.Risk.Users.Forget(UserID) -> *coss.ForgottenRiskUser</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Call this when you delete one of your users: coss.com deletes what identifies them in the environment (their mailbox, fraud reports, and the user id, email address, IP address and user agent on their assessments). Decisions and reasons stay. Forgetting a user coss.com doesn't know succeeds too.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.ForgetUsersRequest{
    UserID: "u_42",
}
client.Risk.Users.Forget(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**userID:** `string` — Your id for the user.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Settings
<details><summary><code>client.Risk.Settings.Get() -> *coss.RiskSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The API key's environment's decision thresholds, disabled reasons and captcha provider (never its secret).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Risk.Settings.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Settings.Update(request) -> *coss.RiskSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given. `review_threshold` must not exceed `block_threshold`. Disabled reasons never fire (rules still see the facts behind them). Setting a captcha provider makes assessments verify their `captcha.token` with it; `required` adds `captcha.missing` to assessments without one. `reason_weights` replaces reasons' default weights (for example with calibration's `suggested_weight`); `null` restores a default.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.UpdateRiskSettingsRequest{
    BlockThreshold: coss.Float64(
        0.9,
    ),
    Captcha: &risk.UpdateRiskSettingsRequestCaptcha{
        Provider: risk.UpdateRiskSettingsRequestCaptchaProviderTurnstile,
        Secret: coss.String(
            "0x4AAA…",
        ),
        Required: coss.Bool(
            true,
        ),
    },
}
client.Risk.Settings.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**reviewThreshold:** `*float64` — Scores at or above it are `review`.
    
</dd>
</dl>

<dl>
<dd>

**blockThreshold:** `*float64` — Scores at or above it are `block`.
    
</dd>
</dl>

<dl>
<dd>

**disabledReasons:** `[]risk.UpdateRiskSettingsRequestDisabledReasonsItem` — Reasons that never fire in this environment. Replaces the list.
    
</dd>
</dl>

<dl>
<dd>

**captcha:** `*risk.UpdateRiskSettingsRequestCaptcha` — `null` turns captcha verification off and deletes the secret.
    
</dd>
</dl>

<dl>
<dd>

**contentThresholds:** `*risk.UpdateRiskSettingsRequestContentThresholds` — Changes the categories given: a score in (0, 1] sets the threshold, `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**reasonWeights:** `*risk.UpdateRiskSettingsRequestReasonWeights` — Changes the reasons given: a weight in [0, 0.99] replaces the default, `null` goes back to it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Rules
<details><summary><code>client.Risk.Rules.List() -> *coss.RiskRuleList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every rule of the API key's environment, in evaluation order.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Risk.Rules.List(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Rules.Create(request) -> *coss.RiskRule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Rules decide after the allow and block lists and before the score thresholds: the first enabled rule (lowest `position`, then oldest) whose conditions match the event sets the decision to its `action`. Conditions test the fields listed in the docs; a field without a value (no IP, no email) never matches. At most 50 rules per environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.CreateRiskRuleRequest{
    Name: "Disposable email from a data center",
    Events: []coss.RiskEvent{
        coss.RiskEventSignup,
    },
    Conditions: []*coss.RiskRuleCondition{
        &coss.RiskRuleCondition{
            Field: coss.RiskRuleConditionFieldEmailDisposable,
            Operator: coss.RiskRuleConditionOperatorIs,
            Value: &coss.RiskRuleConditionValue{
                Boolean: true,
            },
        },
        &coss.RiskRuleCondition{
            Field: coss.RiskRuleConditionFieldIPHosting,
            Operator: coss.RiskRuleConditionOperatorIs,
            Value: &coss.RiskRuleConditionValue{
                Boolean: true,
            },
        },
    },
    Action: coss.RiskDecisionBlock,
}
client.Risk.Rules.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — Your name for the rule, returned with reasons when it decides.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `*bool` — Default `true`.
    
</dd>
</dl>

<dl>
<dd>

**position:** `*int` — Default 0.
    
</dd>
</dl>

<dl>
<dd>

**events:** `[]coss.RiskEvent` — Events it applies to. Default: every event.
    
</dd>
</dl>

<dl>
<dd>

**match:** `*risk.CreateRiskRuleRequestMatch` — Default `all`.
    
</dd>
</dl>

<dl>
<dd>

**conditions:** `[]*coss.RiskRuleCondition` — What must hold, by `match`.
    
</dd>
</dl>

<dl>
<dd>

**action:** `coss.RiskDecision` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Rules.Get(ID) -> *coss.RiskRule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One rule of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.GetRulesRequest{
    ID: "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Risk.Rules.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The rule's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Rules.Delete(ID) -> *coss.DeletedRiskRule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes a rule. Later assessments no longer apply it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.DeleteRulesRequest{
    ID: "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Risk.Rules.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The rule's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Rules.Update(ID, request) -> *coss.RiskRule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given; `conditions` replaces the whole list.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.UpdateRiskRuleRequest{
    ID: "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Enabled: coss.Bool(
        false,
    ),
}
client.Risk.Rules.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The rule's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Your name for the rule.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `*bool` — `false` keeps it, and stops applying it.
    
</dd>
</dl>

<dl>
<dd>

**position:** `*int` — Rules are tried in ascending order.
    
</dd>
</dl>

<dl>
<dd>

**events:** `[]coss.RiskEvent` — Events it applies to. Empty: every event.
    
</dd>
</dl>

<dl>
<dd>

**match:** `*risk.UpdateRiskRuleRequestMatch` — `all`: every condition must hold. `any`: one is enough.
    
</dd>
</dl>

<dl>
<dd>

**conditions:** `[]*coss.RiskRuleCondition` — What must hold, by `match`.
    
</dd>
</dl>

<dl>
<dd>

**action:** `*coss.RiskDecision` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk LimitBuckets
<details><summary><code>client.Risk.LimitBuckets.List() -> *coss.RiskLimitBucketList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every bucket of the API key's environment, by name.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Risk.LimitBuckets.List(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.LimitBuckets.Create(request) -> *coss.RiskLimitBucket</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

At most 100 buckets per environment; names are unique in it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.CreateRiskLimitBucketRequest{
    Name: "password_reset",
    Limit: 5,
    PeriodSeconds: 3600,
}
client.Risk.LimitBuckets.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — Unique in the environment; can't be changed.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `int` — Tokens added per `period_seconds`.
    
</dd>
</dl>

<dl>
<dd>

**periodSeconds:** `int` — 1 second to 1 day.
    
</dd>
</dl>

<dl>
<dd>

**burst:** `*int` — How many requests a key can make at once. Defaults to `limit`.
    
</dd>
</dl>

<dl>
<dd>

**onFailure:** `*risk.CreateRiskLimitBucketRequestOnFailure` — The answer while coss.com can't count. Defaults to `allow`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.LimitBuckets.Get(ID) -> *coss.RiskLimitBucket</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One of the rate limit buckets you defined for `POST /v1/risk/limit`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.GetLimitBucketsRequest{
    ID: "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Risk.LimitBuckets.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The bucket's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.LimitBuckets.Delete(ID) -> *coss.DeletedRiskLimitBucket</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Checks naming it get a 404 from then on; a new bucket with its name starts empty.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.DeleteLimitBucketsRequest{
    ID: "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Risk.LimitBuckets.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The bucket's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.LimitBuckets.Update(ID, request) -> *coss.RiskLimitBucket</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given; the next check uses them. Keys keep what they spent, so a smaller bucket can deny a key until it refills.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &risk.UpdateRiskLimitBucketRequest{
    ID: "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Limit: coss.Int(
        10,
    ),
    Burst: coss.Int(
        20,
    ),
}
client.Risk.LimitBuckets.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The bucket's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — Tokens added per `period_seconds`.
    
</dd>
</dl>

<dl>
<dd>

**periodSeconds:** `*int` — How many seconds `limit` tokens take to be added.
    
</dd>
</dl>

<dl>
<dd>

**burst:** `*int` — The bucket's size: how many requests a key can make at once.
    
</dd>
</dl>

<dl>
<dd>

**onFailure:** `*risk.UpdateRiskLimitBucketRequestOnFailure` — The answer while coss.com can't count: `allow` or `deny`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Hosts
<details><summary><code>client.Scheduling.Hosts.List() -> *coss.SchedulingHostList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's hosts, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ListHostsRequest{}
client.Scheduling.Hosts.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — The last id of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Hosts.Create(request) -> *coss.SchedulingHost</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A person who can be booked: one of your users, such as a doctor or a tutor.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateHostRequest{
    UID: coss.String(
        "doctor_482",
    ),
    Name: "Dr. Ana Reyes",
    Email: coss.String(
        "ana@example.com",
    ),
    TimeZone: "America/New_York",
    Attributes: map[string]*scheduling.CreateHostRequestAttributesValue{
        "licensed_in": &scheduling.CreateHostRequestAttributesValue{
            StringList: []string{
                "NY",
                "NJ",
            },
        },
    },
    Locations: []*coss.SchedulingHostLocation{
        &coss.SchedulingHostLocation{
            InPerson: &coss.SchedulingHostLocationInPerson{
                Address: "12 Main St, New York, NY",
            },
        },
    },
}
client.Scheduling.Hosts.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**uid:** `*string` — Your own id for this host, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**name:** `string` — The host's name.
    
</dd>
</dl>

<dl>
<dd>

**email:** `*string` — Where this host's notifications go. Not an identity, and need not be unique.
    
</dd>
</dl>

<dl>
<dd>

**phone:** `*string` — Where this host's SMS reminders go, in E.164.
    
</dd>
</dl>

<dl>
<dd>

**calendarAccount:** `*string` — The mailbox a calendar delegation connects for this host, when it isn't `email` or the delegation doesn't match on email. In Microsoft 365, their user principal name.
    
</dd>
</dl>

<dl>
<dd>

**timeZone:** `string` — An IANA time zone name.
    
</dd>
</dl>

<dl>
<dd>

**locale:** `*string` — What this host's notifications are written in, such as `de`. Default: English. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `map[string]*scheduling.CreateHostRequestAttributesValue` — What pools filter hosts by, such as `{ "licensed_in": ["CA", "NY"], "language": "es" }`.
    
</dd>
</dl>

<dl>
<dd>

**locations:** `[]*coss.SchedulingHostLocation` — This host's own office, meeting link and phone number. An event type's location that leaves its value blank uses them.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs. Don't put sensitive data here.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Hosts.Get(Host) -> *coss.SchedulingHost</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A host by its id or your uid.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.GetHostsRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Hosts.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Hosts.Remove(Host) -> *coss.DeletedSchedulingHost</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes the host and its schedules and calendars. Refused while bookings are still to come (`host_has_live_bookings`): cancel them, or set the host's status to `disabled`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.RemoveHostsRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Hosts.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Hosts.Update(Host, request) -> *coss.SchedulingHost</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes what's given. A `disabled` host keeps its bookings but gets no new ones.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.UpdateHostRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Status: scheduling.UpdateHostRequestStatusDisabled.Ptr(),
}
client.Scheduling.Hosts.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `*string` — Your own id for this host, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — The host's name.
    
</dd>
</dl>

<dl>
<dd>

**email:** `*string` — Where this host's notifications go. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**phone:** `*string` — Where this host's SMS reminders go, in E.164. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**calendarAccount:** `*string` — Moves the host's delegated calendar to this mailbox. Refused while they have upcoming bookings or holds.
    
</dd>
</dl>

<dl>
<dd>

**timeZone:** `*string` — An IANA time zone name.
    
</dd>
</dl>

<dl>
<dd>

**locale:** `*string` — What this host's notifications are written in, such as `de`. Default: English. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `map[string]*scheduling.UpdateHostRequestAttributesValue` — What pools filter hosts by, such as `{ "licensed_in": ["CA", "NY"], "language": "es" }`.
    
</dd>
</dl>

<dl>
<dd>

**locations:** `[]*coss.SchedulingHostLocation` — Replaces this host's own locations. Existing bookings keep the location they have.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs. Don't put sensitive data here.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*scheduling.UpdateHostRequestStatus` — A `disabled` host isn't offered. Its existing bookings stay.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Schedules
<details><summary><code>client.Scheduling.Schedules.List(Host) -> *coss.SchedulingScheduleList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

All of the host's schedules, oldest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ListSchedulesRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Schedules.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Schedules.Create(Host, request) -> *coss.SchedulingSchedule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A host's weekly hours and date overrides, in local time. The first one is the host's default.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateSchedulesRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Body: &coss.UpsertScheduleRequest{
        Name: coss.String(
            "Clinic hours",
        ),
        Rules: []*coss.SchedulingWeeklyRule{
            &coss.SchedulingWeeklyRule{
                Days: []int{
                    1,
                    2,
                    3,
                    4,
                    5,
                },
                Start: "09:00",
                End: "17:00",
            },
        },
        Overrides: []*coss.SchedulingScheduleOverride{
            &coss.SchedulingScheduleOverride{
                Date: "2027-12-24",
                Ranges: []*coss.SchedulingScheduleOverrideRangesItem{
                    &coss.SchedulingScheduleOverrideRangesItem{
                        Start: "start",
                        End: "end",
                    },
                },
            },
        },
    },
}
client.Scheduling.Schedules.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request:** `*coss.UpsertScheduleRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Schedules.Get(Host, ScheduleID) -> *coss.SchedulingSchedule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One of the host's schedules.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.GetSchedulesRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    ScheduleID: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Schedules.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**scheduleID:** `string` — The schedule's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Schedules.Update(Host, ScheduleID, request) -> *coss.SchedulingSchedule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Replaces its weekly rules, and its overrides when given. Existing bookings stay: a schedule only decides what's offered next.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.UpdateSchedulesRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    ScheduleID: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Body: &coss.UpsertScheduleRequest{
        Name: coss.String(
            "Clinic hours",
        ),
        Rules: []*coss.SchedulingWeeklyRule{
            &coss.SchedulingWeeklyRule{
                Days: []int{
                    1,
                    2,
                    3,
                    4,
                    5,
                },
                Start: "09:00",
                End: "17:00",
            },
        },
        Overrides: []*coss.SchedulingScheduleOverride{
            &coss.SchedulingScheduleOverride{
                Date: "2027-12-24",
                Ranges: []*coss.SchedulingScheduleOverrideRangesItem{
                    &coss.SchedulingScheduleOverrideRangesItem{
                        Start: "start",
                        End: "end",
                    },
                },
            },
        },
    },
}
client.Scheduling.Schedules.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**scheduleID:** `string` — The schedule's id.
    
</dd>
</dl>

<dl>
<dd>

**request:** `*coss.UpsertScheduleRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Schedules.Remove(Host, ScheduleID) -> *coss.DeletedSchedulingSchedule</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Refused for the host's default schedule.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.RemoveSchedulesRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    ScheduleID: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Schedules.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**scheduleID:** `string` — The schedule's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling EventTypes
<details><summary><code>client.Scheduling.EventTypes.List() -> *coss.SchedulingEventTypeList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's event types, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ListEventTypesRequest{}
client.Scheduling.EventTypes.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — The last id of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.EventTypes.Create(request) -> *coss.SchedulingEventType</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

What can be booked: `one_on_one` with one host, `pool` for any free host, `collective` when every required host must be free, or `group` for a session with seats.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateEventTypeRequest{
    Kind: scheduling.CreateEventTypeRequestKindOneOnOne.Ptr(),
    Title: "Initial consultation",
    DurationMinutes: 30,
    BufferAfterMinutes: coss.Int(
        10,
    ),
    MinNoticeMinutes: coss.Int(
        120,
    ),
    Hosts: []*coss.SchedulingEventTypeHostInput{
        &coss.SchedulingEventTypeHostInput{
            Host: "doctor_482",
        },
    },
}
client.Scheduling.EventTypes.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**uid:** `*string` — Your own id for this event type, unique in the environment, accepted wherever its id is.
    
</dd>
</dl>

<dl>
<dd>

**kind:** `*scheduling.CreateEventTypeRequestKind` — Who a booking needs. `one_on_one`: one host. `pool`: any one of its hosts. `collective`: every `required` host, plus at most one `member`. `group`: one host, with attendees taking seats up to `capacity`. Fixed once created.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Plain text about the event type, shown on hosted booking pages and never in emails. Links, and anything shaped like a domain, must be on your organization's verified domains or their subdomains, and use `https`. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**title:** `string` — Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.
    
</dd>
</dl>

<dl>
<dd>

**durationMinutes:** `int` — How long a booking lasts by default, in minutes.
    
</dd>
</dl>

<dl>
<dd>

**durationOptions:** `[]int` — Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.
    
</dd>
</dl>

<dl>
<dd>

**stepMinutes:** `*int` — How far apart slots start. Default: the duration.
    
</dd>
</dl>

<dl>
<dd>

**gridTimeZone:** `*string` — The zone slots align in. Default: each host's own.
    
</dd>
</dl>

<dl>
<dd>

**bufferBeforeMinutes:** `*int` — Minutes kept free before each booking. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**bufferAfterMinutes:** `*int` — Minutes kept free after each booking. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**minNoticeMinutes:** `*int` — Slots starting sooner than this many minutes from now aren't offered. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**bookingWindow:** `*coss.SchedulingBookingWindow` 
    
</dd>
</dl>

<dl>
<dd>

**limits:** `[]*coss.SchedulingLimit` — Caps on bookings per day or week. Default: none.
    
</dd>
</dl>

<dl>
<dd>

**capacity:** `*int` — Attendees per session. Required for, and only allowed on, `group`.
    
</dd>
</dl>

<dl>
<dd>

**requiresApproval:** `*bool` — Bookings start as `pending_approval`, holding the time until approved or declined. Default: `false`.
    
</dd>
</dl>

<dl>
<dd>

**approvalTTLMinutes:** `*int` — How long a booking can wait for approval before it's declined, in minutes. Default: 1440.
    
</dd>
</dl>

<dl>
<dd>

**holdTTLSeconds:** `*int` — How long a hold keeps its slot, in seconds. Default: 600.
    
</dd>
</dl>

<dl>
<dd>

**cancelNoticeMinutes:** `*int` — Attendees can't cancel closer to the start than this. API keys can.
    
</dd>
</dl>

<dl>
<dd>

**rescheduleNoticeMinutes:** `*int` — Attendees can't reschedule closer to the start than this. API keys can. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**maxGuests:** `*int` — How many people an attendee can add to a booking. Default: 0. Guests are emailed about it. Not on `group`.
    
</dd>
</dl>

<dl>
<dd>

**maxActiveBookingsPerAttendee:** `*int` — How many upcoming bookings of this event type one person can have at a time, known by `uid` or email. Default: `null`, no limit. Past this, booking answers `attendee_limit_reached`. Guests don't count, and each occurrence of a series does.
    
</dd>
</dl>

<dl>
<dd>

**hostCalendarDetails:** `*scheduling.CreateEventTypeRequestHostCalendarDetails` — What hosts' calendars say about a booking. `neutral` (the default): a private event titled "Appointment". `full`: a private event with this title and the attendee's name, plus names, emails and phone numbers in its description, which go to the host's calendar provider. Never answers. Refused in HIPAA mode.
    
</dd>
</dl>

<dl>
<dd>

**questions:** `[]*coss.SchedulingQuestion` — What attendees are asked when booking. Keys must be unique.
    
</dd>
</dl>

<dl>
<dd>

**locations:** `[]*coss.SchedulingLocation` — Where bookings can meet. A browser only chooses among these. A `group` event type can't use `zoom`.
    
</dd>
</dl>

<dl>
<dd>

**hostFilter:** `map[string]*scheduling.CreateEventTypeRequestHostFilterValue` — Pool members also include active hosts matching all of these attributes.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `map[string]*scheduling.CreateEventTypeRequestNotificationsValue` — Per event, overriding your settings for this event type.
    
</dd>
</dl>

<dl>
<dd>

**reminders:** `[]*coss.SchedulingReminderInput` — Replaces your settings' `reminders` for this event type. `null` inherits them; an empty list means none.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs.
    
</dd>
</dl>

<dl>
<dd>

**hosts:** `[]*coss.SchedulingEventTypeHostInput` — Who can be booked. `one_on_one` and `group` take one; `collective` needs at least one `required` host.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.EventTypes.Get(EventType) -> *coss.SchedulingEventType</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An event type by its id or your uid.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.GetEventTypesRequest{
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.EventTypes.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**eventType:** `string` — The event type's id or uid.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.EventTypes.Update(EventType, request) -> *coss.SchedulingEventType</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes what's given. Existing bookings keep what they were booked with. Set `status` to `archived` to stop new bookings.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.UpdateEventTypeRequest{
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
    MinNoticeMinutes: coss.Int(
        240,
    ),
}
client.Scheduling.EventTypes.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**eventType:** `string` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `*string` — Your own id for this event type. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**description:** `*string` — Plain text about the event type, shown on hosted booking pages and never in emails. Links, and anything shaped like a domain, must be on your organization's verified domains or their subdomains, and use `https`. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**title:** `*string` — Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.
    
</dd>
</dl>

<dl>
<dd>

**durationMinutes:** `*int` — How long a booking lasts by default, in minutes.
    
</dd>
</dl>

<dl>
<dd>

**durationOptions:** `[]int` — Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.
    
</dd>
</dl>

<dl>
<dd>

**stepMinutes:** `*int` — How far apart slots start. Default: the duration.
    
</dd>
</dl>

<dl>
<dd>

**gridTimeZone:** `*string` — The zone slots align in. Default: each host's own.
    
</dd>
</dl>

<dl>
<dd>

**bufferBeforeMinutes:** `*int` — Minutes kept free before each booking. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**bufferAfterMinutes:** `*int` — Minutes kept free after each booking. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**minNoticeMinutes:** `*int` — Slots starting sooner than this many minutes from now aren't offered. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**bookingWindow:** `*coss.SchedulingBookingWindow` 
    
</dd>
</dl>

<dl>
<dd>

**limits:** `[]*coss.SchedulingLimit` — Caps on bookings per day or week. Default: none.
    
</dd>
</dl>

<dl>
<dd>

**capacity:** `*int` — Attendees per session. Required for, and only allowed on, `group`.
    
</dd>
</dl>

<dl>
<dd>

**requiresApproval:** `*bool` — Bookings start as `pending_approval`, holding the time until approved or declined. Default: `false`.
    
</dd>
</dl>

<dl>
<dd>

**approvalTTLMinutes:** `*int` — How long a booking can wait for approval before it's declined, in minutes. Default: 1440.
    
</dd>
</dl>

<dl>
<dd>

**holdTTLSeconds:** `*int` — How long a hold keeps its slot, in seconds. Default: 600.
    
</dd>
</dl>

<dl>
<dd>

**cancelNoticeMinutes:** `*int` — Attendees can't cancel closer to the start than this. API keys can.
    
</dd>
</dl>

<dl>
<dd>

**rescheduleNoticeMinutes:** `*int` — Attendees can't reschedule closer to the start than this. API keys can. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**maxGuests:** `*int` — How many people an attendee can add to a booking. Default: 0. Guests are emailed about it. Not on `group`.
    
</dd>
</dl>

<dl>
<dd>

**maxActiveBookingsPerAttendee:** `*int` — How many upcoming bookings of this event type one person can have at a time, known by `uid` or email. Default: `null`, no limit. Past this, booking answers `attendee_limit_reached`. Guests don't count, and each occurrence of a series does.
    
</dd>
</dl>

<dl>
<dd>

**hostCalendarDetails:** `*scheduling.UpdateEventTypeRequestHostCalendarDetails` — What hosts' calendars say about a booking. `neutral` (the default): a private event titled "Appointment". `full`: a private event with this title and the attendee's name, plus names, emails and phone numbers in its description, which go to the host's calendar provider. Never answers. Refused in HIPAA mode.
    
</dd>
</dl>

<dl>
<dd>

**questions:** `[]*coss.SchedulingQuestion` — What attendees are asked when booking. Keys must be unique.
    
</dd>
</dl>

<dl>
<dd>

**locations:** `[]*coss.SchedulingLocation` — Where bookings can meet. A browser only chooses among these. A `group` event type can't use `zoom`.
    
</dd>
</dl>

<dl>
<dd>

**hostFilter:** `map[string]*scheduling.UpdateEventTypeRequestHostFilterValue` — Pool members also include active hosts matching all of these attributes.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `map[string]*scheduling.UpdateEventTypeRequestNotificationsValue` — Per event, overriding your settings for this event type.
    
</dd>
</dl>

<dl>
<dd>

**reminders:** `[]*coss.SchedulingReminderInput` — Replaces your settings' `reminders` for this event type. `null` inherits them; an empty list means none.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*scheduling.UpdateEventTypeRequestStatus` — `archived` stops new bookings, and keeps existing ones.
    
</dd>
</dl>

<dl>
<dd>

**hosts:** `[]*coss.SchedulingEventTypeHostInput` — Replaces the assigned hosts. Removed hosts keep their existing bookings.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Slots
<details><summary><code>client.Scheduling.Slots.List(EventType) -> *coss.SchedulingSlotList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Starts an attendee can book between `start` and `end` (at most 62 days), as UTC instants to show in their own time zone. A host whose calendar can't be read isn't offered.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ListSlotsRequest{
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Start: "2027-01-04T15:00:00.000Z",
    End: "2027-01-04T15:00:00.000Z",
}
client.Scheduling.Slots.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**eventType:** `string` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**end:** `string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**host:** `*string` — Only this host's slots (id or uid).
    
</dd>
</dl>

<dl>
<dd>

**durationMinutes:** `*int` 
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `*string` — A JSON object narrowing a pool, such as `{"licensed_in":"CA"}`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Slots.Explain(EventType) -> *coss.SchedulingSlotExplanation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Why one start can or can't be booked right now, host by host, decided the same way a booking is. For support and debugging: it says when a host is busy, so don't show it to attendees.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ExplainSlotsRequest{
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Start: "2027-01-04T15:00:00.000Z",
}
client.Scheduling.Slots.Explain(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**eventType:** `string` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**host:** `*string` — Only this host (id or uid).
    
</dd>
</dl>

<dl>
<dd>

**durationMinutes:** `*int` 
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `*string` — A JSON object narrowing a pool, such as `{"licensed_in":"CA"}`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Availability
<details><summary><code>client.Scheduling.Availability.Search(request) -> *coss.SchedulingAvailabilitySearchResult</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

For "who's free" pages: each matching host's soonest slots, soonest first, across up to 500 hosts.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.AvailabilitySearchRequest{
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Start: "2027-01-04T00:00:00.000Z",
    End: "2027-01-18T00:00:00.000Z",
    Attributes: map[string]*scheduling.AvailabilitySearchRequestAttributesValue{
        "licensed_in": &scheduling.AvailabilitySearchRequestAttributesValue{
            String: "CA",
        },
    },
}
client.Scheduling.Availability.Search(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**eventType:** `string` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**end:** `string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `map[string]*scheduling.AvailabilitySearchRequestAttributesValue` — Only hosts matching all of these.
    
</dd>
</dl>

<dl>
<dd>

**hosts:** `[]string` — Only these hosts (ids or uids). Default: everyone the event type could offer.
    
</dd>
</dl>

<dl>
<dd>

**slotsPerHost:** `*int` — How many of each host's soonest slots to return.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — Hosts to return, soonest availability first.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Bookings
<details><summary><code>client.Scheduling.Bookings.List() -> *coss.SchedulingBookingList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's bookings, newest first. Answers aren't included.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ListBookingsRequest{
    StartAfter: coss.String(
        "2027-01-04T15:00:00.000Z",
    ),
    StartBefore: coss.String(
        "2027-01-04T15:00:00.000Z",
    ),
}
client.Scheduling.Bookings.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — The last id of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**host:** `*string` 
    
</dd>
</dl>

<dl>
<dd>

**eventType:** `*string` 
    
</dd>
</dl>

<dl>
<dd>

**status:** `*scheduling.ListBookingsRequestStatus` 
    
</dd>
</dl>

<dl>
<dd>

**attendeeUID:** `*string` 
    
</dd>
</dl>

<dl>
<dd>

**startAfter:** `*string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**startBefore:** `*string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.Create(request) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Books a slot, or joins a group session. Without a `host`, a pool chooses fairly among those free. An event type that requires approval answers with a `pending_approval` booking.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateBookingRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Start: "2027-01-04T15:00:00.000Z",
    Attendee: &coss.SchedulingAttendeeInput{
        UID: coss.String(
            "patient_77",
        ),
        Name: coss.String(
            "Sam Lee",
        ),
        Email: coss.String(
            "sam@example.com",
        ),
        TimeZone: "UTC",
    },
}
client.Scheduling.Bookings.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**eventType:** `string` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**host:** `*string` — A specific host (id or uid). Default: chosen fairly from those free.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `map[string]*scheduling.CreateBookingRequestAttributesValue` — Only choose among pool hosts matching all of these.
    
</dd>
</dl>

<dl>
<dd>

**durationMinutes:** `*int` — One of the event type's `duration_options`.
    
</dd>
</dl>

<dl>
<dd>

**attendee:** `*coss.SchedulingAttendeeInput` 
    
</dd>
</dl>

<dl>
<dd>

**guests:** `[]*coss.SchedulingGuestInput` — Up to the event type's `max_guests`.
    
</dd>
</dl>

<dl>
<dd>

**answers:** `map[string]*scheduling.CreateBookingRequestAnswersValue` — Answers to the event type's questions. Stored encrypted, and returned only by retrieving the booking.
    
</dd>
</dl>

<dl>
<dd>

**location:** `*scheduling.CreateBookingRequestLocation` — One of the event type's `locations`, with your link filled in if it has none.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs. Don't put sensitive data here.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.Get(ID) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A booking with its attendees and their answers.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.GetBookingsRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Bookings.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.Reschedule(ID, request) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Moves it to a new time, keeping its id. The old time stays booked if the new one isn't free.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.RescheduleBookingRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Start: "2027-01-05T15:00:00.000Z",
}
client.Scheduling.Bookings.Reschedule(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**start:** `string` — The new start. The old time stays booked unless this one's free.
    
</dd>
</dl>

<dl>
<dd>

**host:** `*string` — Move a pool booking to this host. Default: its current hosts.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.Cancel(ID, request) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Frees the time and removes the calendar event. A cancelled booking stays charged.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CancelSchedulingBookingRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Reason: coss.String(
        "Feeling better",
    ),
}
client.Scheduling.Bookings.Cancel(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**reason:** `*string` — Why it's being cancelled. Only retrieving this booking returns it: it's never in webhooks, logs or emails.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.Events(ID) -> *coss.SchedulingBookingEventList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

What's happened to a booking, oldest first, and who did it. There's no personal data in here.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.EventsBookingsRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Bookings.Events(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — The last id of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.Approve(ID) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Confirms a `pending_approval` booking.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ApproveBookingsRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Bookings.Approve(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.Decline(ID) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Refuses a `pending_approval` booking and frees the time.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.DeclineBookingsRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Bookings.Decline(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.Notifications(ID) -> *coss.SchedulingBookingNotificationList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

What's been queued for this booking and what became of it, newest first, including why something wasn't sent. It never says who it went to.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.NotificationsBookingsRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Bookings.Notifications(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — The last id of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.MarkNoShow(ID) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Records that the attendee didn't come, once the booking has started.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.MarkNoShowBookingsRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Bookings.MarkNoShow(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.UpdateLocation(ID, request) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Where it happens, such as the meeting link you made after the `scheduling.booking.confirmed` webhook.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.UpdateBookingLocationRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Location: &coss.SchedulingLocation{
        Link: &coss.SchedulingLocationLink{
            URL: coss.String(
                "https://meet.example.com/abc",
            ),
        },
    },
}
client.Scheduling.Bookings.UpdateLocation(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**location:** `*coss.SchedulingLocation` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Holds
<details><summary><code>client.Scheduling.Holds.Create(request) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Keeps a slot for a while (the event type's `hold_ttl_seconds`) so you can take payment, then confirm it. Answers with a `held` booking, which isn't charged and sends nothing.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateHoldRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Start: "2027-01-04T15:00:00.000Z",
    Attendee: &coss.SchedulingAttendeeInput{
        UID: coss.String(
            "patient_77",
        ),
        TimeZone: "UTC",
    },
}
client.Scheduling.Holds.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**eventType:** `string` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `string` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**host:** `*string` — A specific host (id or uid). Default: chosen fairly from those free.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `map[string]*scheduling.CreateHoldRequestAttributesValue` — Only choose among pool hosts matching all of these.
    
</dd>
</dl>

<dl>
<dd>

**durationMinutes:** `*int` — One of the event type's `duration_options`.
    
</dd>
</dl>

<dl>
<dd>

**attendee:** `*coss.SchedulingAttendeeInput` 
    
</dd>
</dl>

<dl>
<dd>

**guests:** `[]*coss.SchedulingGuestInput` — Up to the event type's `max_guests`.
    
</dd>
</dl>

<dl>
<dd>

**answers:** `map[string]*scheduling.CreateHoldRequestAnswersValue` — Answers to the event type's questions. Stored encrypted, and returned only by retrieving the booking.
    
</dd>
</dl>

<dl>
<dd>

**location:** `*scheduling.CreateHoldRequestLocation` — One of the event type's `locations`, with your link filled in if it has none.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs. Don't put sensitive data here.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Holds.Confirm(ID, request) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Turns a hold into a booking. Always succeeds before the hold expires. Repeating it is safe.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ConfirmHoldRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
    IfStillFree: coss.Bool(
        true,
    ),
}
client.Scheduling.Holds.Confirm(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**ifStillFree:** `*bool` — After the hold expired, book anyway if nobody else took the slot. Default: refuse with `hold_expired`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Holds.Release(ID) -> *coss.SchedulingBooking</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Gives the slot back early.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ReleaseHoldsRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Holds.Release(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Series
<details><summary><code>client.Scheduling.Series.Create(request) -> *coss.SchedulingSeries</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Books up to 52 occurrences, keeping the attendee's local time across DST changes. Each one is an ordinary booking that can move on its own, and a pool keeps one host throughout.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateSeriesBody{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Body: &coss.CreateSeriesRequest{
        EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Start: "2027-01-04T15:00:00.000Z",
        Attendee: &coss.SchedulingAttendeeInput{
            UID: coss.String(
                "patient_77",
            ),
            TimeZone: "America/New_York",
        },
        Recurrence: &coss.CreateSeriesRequestRecurrence{
            Frequency: coss.CreateSeriesRequestRecurrenceFrequencyWeekly,
            Interval: coss.Int(
                1,
            ),
            Count: 12,
        },
    },
}
client.Scheduling.Series.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**request:** `*coss.CreateSeriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Series.Preview(request) -> *coss.SchedulingSeriesPreview</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Which occurrences would be free, without booking anything.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateSeriesRequest{
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Start: "2027-01-04T15:00:00.000Z",
    Attendee: &coss.SchedulingAttendeeInput{
        UID: coss.String(
            "patient_77",
        ),
        TimeZone: "America/New_York",
    },
    Recurrence: &coss.CreateSeriesRequestRecurrence{
        Frequency: coss.CreateSeriesRequestRecurrenceFrequencyWeekly,
        Interval: coss.Int(
            1,
        ),
        Count: 12,
    },
}
client.Scheduling.Series.Preview(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `*coss.CreateSeriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Series.Cancel(ID, request) -> *coss.SchedulingCancelledSeries</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cancels the occurrences from `from_index` on, or all of them.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CancelSeriesRequest{
    ID: "series_01kd2m9a0b1c2d3e4f5g6h7j8m",
    FromIndex: coss.Int64(
        int64(4),
    ),
}
client.Scheduling.Series.Cancel(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The series' id.
    
</dd>
</dl>

<dl>
<dd>

**fromIndex:** `*int64` — Cancel this occurrence and those after it. Default: all of them.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Attendees
<details><summary><code>client.Scheduling.Attendees.Erase(UID) -> *coss.SchedulingAttendeeErasure</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes this person's details and answers from every booking now, and ends any booker session fixed to them. The bookings themselves stay.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.EraseAttendeesRequest{
    UID: "patient_77",
}
client.Scheduling.Attendees.Erase(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**uid:** `string` — Your id for the attendee.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Attendees.EraseByEmail(request) -> *coss.SchedulingAttendeeErasureByEmail</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Removes this address's details and answers from every booking now, for someone you have no `uid` for, such as a guest. The bookings themselves stay.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.EraseSchedulingAttendeeByEmailRequest{
    Email: "sam@example.com",
}
client.Scheduling.Attendees.EraseByEmail(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `string` — The address to forget, an attendee's or a guest's.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Calendars
<details><summary><code>client.Scheduling.Calendars.Authorize(Host, request) -> *coss.SchedulingCalendarAuthorization</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A URL for the host to give consent at Google or Microsoft. Open it in a new window: providers refuse to be framed. Coss.com reads only busy times, and writes events with a neutral title unless the event type's `host_calendar_details` is `full`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.AuthorizeCalendarRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Provider: scheduling.AuthorizeCalendarRequestProviderGoogle,
}
client.Scheduling.Calendars.Authorize(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**provider:** `scheduling.AuthorizeCalendarRequestProvider` — Whose consent page to open. CalDAV connects with a password instead.
    
</dd>
</dl>

<dl>
<dd>

**returnURL:** `*string` — Where to send the browser afterwards, on one of the environment's allowed origins. `coss_calendar` says what happened: `connected`, `denied` or `invalid`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.List(Host) -> *coss.SchedulingCalendarConnectionList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

With each connection's calendars and which of them count.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ListCalendarsRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Calendars.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.Connect(Host, request) -> *coss.SchedulingCalendarConnection</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

CalDAV (Apple and others) with an app password, or, in sandbox environments, a `simulated` calendar whose busy times you set yourself. Google and Microsoft use `authorize`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.ConnectCalendarsRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Body: &coss.CreateCalendarConnectionRequest{
        Caldav: &coss.CreateCalendarConnectionRequestCaldav{
            URL: "url",
            Username: "username",
            Password: "password",
        },
    },
}
client.Scheduling.Calendars.Connect(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request:** `*coss.CreateCalendarConnectionRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.Disconnect(Host, ID) -> *coss.DeletedSchedulingCalendarConnection</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Revokes coss.com's access and deletes every busy time read through it. One a calendar delegation manages is refused (`calendar_managed`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.DisconnectCalendarsRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    ID: "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Calendars.Disconnect(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**id:** `string` — The connection's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.Update(Host, CalendarID, request) -> *coss.SchedulingCalendarConnectionList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Whether its busy times block slots, and whether bookings are written to it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.UpdateCalendarRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    CalendarID: "cal_01kd2m9a0b1c2d3e4f5g6h7j8m",
    ReadBusy: coss.Bool(
        true,
    ),
}
client.Scheduling.Calendars.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**calendarID:** `string` — The calendar's id.
    
</dd>
</dl>

<dl>
<dd>

**readBusy:** `*bool` — Whether this calendar's busy times block slots.
    
</dd>
</dl>

<dl>
<dd>

**writeTarget:** `*bool` — Bookings are written to one calendar; setting this moves it here.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.SetSimulatedBusy(Host, request) -> error</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sandbox environments only: test how bookings react to a busy calendar.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.SetSimulatedBusyRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Intervals: []*scheduling.SetSimulatedBusyRequestIntervalsItem{
        &scheduling.SetSimulatedBusyRequestIntervalsItem{
            Start: "2027-01-04T15:00:00.000Z",
            End: "2027-01-04T16:00:00.000Z",
        },
    },
}
client.Scheduling.Calendars.SetSimulatedBusy(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**intervals:** `[]*scheduling.SetSimulatedBusyRequestIntervalsItem` — The simulated calendar's busy times.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling CalendarDelegations
<details><summary><code>client.Scheduling.CalendarDelegations.List() -> *coss.SchedulingCalendarDelegationList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

With how many hosts each has connected.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Scheduling.CalendarDelegations.List(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.Create(request) -> *coss.SchedulingCalendarDelegation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An admin authorizes once, and every host on the domain gets their calendar with no consent screen. It stays `pending`: authorize what it returns, then verify it. Credentials are never returned.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &coss.CreateCalendarDelegationRequest{
    Google: &coss.CreateCalendarDelegationRequestGoogle{
        Domain: "domain",
        ServiceAccountKey: "service_account_key",
    },
}
client.Scheduling.CalendarDelegations.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `*coss.CreateCalendarDelegationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.Get(ID) -> *coss.SchedulingCalendarDelegation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Its status, what to authorize, and how many hosts it has connected.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.GetCalendarDelegationsRequest{
    ID: "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.CalendarDelegations.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The delegation's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.Delete(ID) -> *coss.DeletedSchedulingCalendarDelegation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Its hosts lose these calendars within minutes. They stay bookable with no conflict check, and events already written stay on their calendars, out of reach of later moves or cancellations.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.DeleteCalendarDelegationsRequest{
    ID: "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.CalendarDelegations.Delete(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The delegation's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.Update(ID, request) -> *coss.SchedulingCalendarDelegation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

New credentials are tried on the verified mailbox before they replace the old ones, and end an outage if they work.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.UpdateCalendarDelegationRequest{
    ID: "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
    MatchHostEmail: coss.Bool(
        false,
    ),
}
client.Scheduling.CalendarDelegations.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The delegation's id.
    
</dd>
</dl>

<dl>
<dd>

**matchHostEmail:** `*bool` — Whether a host's `email` picks their mailbox when `calendar_account` isn't set. Turn it off if end users can type their own email into your app: otherwise one could name a colleague's address and reach that calendar.
    
</dd>
</dl>

<dl>
<dd>

**serviceAccountKey:** `*string` — A new key. It's tried on the verified mailbox before it replaces the old one.
    
</dd>
</dl>

<dl>
<dd>

**clientSecret:** `*string` — A new client secret. It's tried on the verified mailbox before it replaces the old one.
    
</dd>
</dl>

<dl>
<dd>

**secretExpiresAt:** `*time.Time` — When the Entra client secret expires. Owners and admins are warned 14 days before.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.Verify(ID, request) -> *coss.SchedulingCalendarDelegation</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Tries one real mailbox. Passing makes it `active`, and its hosts start connecting. Google can take up to 24 hours to apply a new authorization, so a refusal may just need time.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.VerifyCalendarDelegationRequest{
    ID: "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Account: "ana@example.com",
}
client.Scheduling.CalendarDelegations.Verify(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The delegation's id.
    
</dd>
</dl>

<dl>
<dd>

**account:** `string` — A real mailbox on the domain to try. In Microsoft 365, a user principal name.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Sessions
<details><summary><code>client.Scheduling.Sessions.CreateForHost(Host, request) -> *coss.SchedulingSession</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Lets one host manage their own hours, calendars and locations, on coss.com's hosted page or your own UI. Send the `url` to their browser, or embed it with `coss/scheduling`.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateSchedulingHostSessionRequest{
    Host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
    ExpiresIn: coss.Int(
        3600,
    ),
}
client.Scheduling.Sessions.CreateForHost(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `string` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**expiresIn:** `*int` — Seconds until it stops working. At most a day.
    
</dd>
</dl>

<dl>
<dd>

**readOnly:** `*bool` — The host can look but not change anything.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Sessions.CreateForBooker(request) -> *coss.SchedulingSession</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Lets a browser book one event type, on coss.com's hosted page or your own UI, without your API key.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateSchedulingBookerSessionRequest{
    EventType: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
    Attendee: &scheduling.CreateSchedulingBookerSessionRequestAttendee{
        UID: coss.String(
            "patient_77",
        ),
        Name: coss.String(
            "Sam Lee",
        ),
        TimeZone: "UTC",
    },
}
client.Scheduling.Sessions.CreateForBooker(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**eventType:** `string` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**host:** `*string` — Only this host (id or uid).
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `map[string]*scheduling.CreateSchedulingBookerSessionRequestAttributesValue` — Only offer times, and book, among pool hosts matching all of these. The browser can't see or change them.
    
</dd>
</dl>

<dl>
<dd>

**attendee:** `*scheduling.CreateSchedulingBookerSessionRequestAttendee` — Who's booking, if you already know: the browser then can't change it.
    
</dd>
</dl>

<dl>
<dd>

**expiresIn:** `*int` — Seconds until it stops working. At most a day.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Sessions.CreateForBooking(ID) -> *coss.SchedulingSession</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Lets an attendee reschedule or cancel this one booking, within the event type's cutoffs. Stops working when the booking's cancelled, or a day after it ends.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.CreateForBookingSessionsRequest{
    ID: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
}
client.Scheduling.Sessions.CreateForBooking(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The booking's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Settings
<details><summary><code>client.Scheduling.Settings.Get() -> *coss.SchedulingSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The environment's scheduling settings.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Scheduling.Settings.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Settings.Update(request) -> *coss.SchedulingSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes what's given.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &scheduling.UpdateSchedulingSettingsRequest{
    BrandName: coss.String(
        "Acme Health",
    ),
}
client.Scheduling.Settings.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**allowedOrigins:** `[]string` — Sites allowed to embed coss.com's hosted pages and call the client API, as `https://host` origins.
    
</dd>
</dl>

<dl>
<dd>

**brandName:** `*string` — Your name on hosted pages and on emails sent from `email_from`. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**accentColor:** `*string` — The accent color as `#RRGGBB`. `null` restores the default.
    
</dd>
</dl>

<dl>
<dd>

**logo:** `*scheduling.UpdateSchedulingSettingsRequestLogo` — Your logo, a PNG or JPEG. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**emailFrom:** `*string` — Sender of booking emails, on a verified domain. `null`: coss.com's own address.
    
</dd>
</dl>

<dl>
<dd>

**smsFrom:** `*string` — Your approved number for SMS reminders, in E.164. `null`: no SMS is sent.
    
</dd>
</dl>

<dl>
<dd>

**calendarFailureMode:** `*scheduling.UpdateSchedulingSettingsRequestCalendarFailureMode` — When a host's calendar can't be read: `hide` stops offering them, `last_known` keeps offering their last known times.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `map[string]*scheduling.UpdateSchedulingSettingsRequestNotificationsValue` — Per event (`confirmed`, `pending_approval`, `rescheduled`, `cancelled`, `declined`, `reminder`), overriding the defaults. `null` restores them.
    
</dd>
</dl>

<dl>
<dd>

**emailReplyTo:** `*string` — Where replies go, for emails from `email_from`.
    
</dd>
</dl>

<dl>
<dd>

**reminders:** `[]*coss.SchedulingReminderInput` — What goes out around a booking, unless an event type has its own. `null` goes back to a reminder a day before.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Documents
<details><summary><code>client.Sign.Documents.List() -> *coss.SignDocumentList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Documents uploaded to the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.ListDocumentsRequest{}
client.Sign.Documents.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Documents.Upload(request) -> *coss.SignDocument</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Uploads a PDF (base64, at most 25 MB and 500 pages, not password-protected) for signature requests to use. The response lists each page's size and the text anchors found in it (`{{signature:signer_1}}`), which fields can be placed by. Requests can also take PDFs inline.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.UploadSignDocumentRequest{
    Filename: "agreement.pdf",
    Content: "JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNCAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTEKL0Jhc2VGb250IC9IZWx2ZXRpY2EKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA8PAovSGVsdmV0aWNhLTcwOTg0ODA3ODkgMyAwIFIKPj4KL1hPYmplY3QgPDwKPj4KL0V4dEdTdGF0ZSA8PAo+Pgo+PgovTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdCi9Bbm5vdHMgWyBdCi9Db250ZW50cyBbIDUgMCBSIF0KPj4KZW5kb2JqCgo1IDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9MZW5ndGggMTIwCj4+CnN0cmVhbQp4nG2KMQrCQBBF+znF1II4O7s7fxckYEjEwkaYC4hEiWgREc9vtLCSV/3330Stk/CHx4VWu+H2Gp7j6biE1JKKoFQOyn4mTex7Ct80MJQhwn6ndY5WDdZbQEKGWo4bFbQzf56fm3fexoAOXcN+JV9Q73SgN3RWIBIKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE2IDAwMDAwIG4gCjAwMDAwMDAwNzYgMDAwMDAgbiAKMDAwMDAwMDEyNiAwMDAwMCBuIAowMDAwMDAwMjI0IDAwMDAwIG4gCjAwMDAwMDA0MTkgMDAwMDAgbiAKCnRyYWlsZXIKPDwKL1NpemUgNgovUm9vdCAyIDAgUgo+PgoKc3RhcnR4cmVmCjYxMgolJUVPRg==",
}
client.Sign.Documents.Upload(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**filename:** `string` — The file's name, ending in `.pdf`.
    
</dd>
</dl>

<dl>
<dd>

**content:** `string` — The PDF's bytes, base64-encoded (at most 25 MB decoded).
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Documents.Get(ID) -> *coss.SignDocument</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

An uploaded document's details: its hash, page sizes and text anchors. Its bytes are never returned here.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.GetDocumentsRequest{
    ID: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Documents.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The document's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Documents.Remove(ID) -> *coss.DeletedSignDocument</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes an uploaded document and its file. Documents a request uses can't be deleted.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.RemoveDocumentsRequest{
    ID: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Documents.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The document's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Requests
<details><summary><code>client.Sign.Requests.List() -> *coss.SignRequestList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Signature requests of the API key's environment, newest first. Pass the last `id` as `after` to get the next page while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.ListRequestsRequest{}
client.Sign.Requests.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `*string` — Only requests in these statuses, comma-separated: `sent,draft`.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.Create(request) -> *coss.SignRequest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Asks one or more signers to sign one or more PDFs. Give documents by id (uploaded) or inline, and each signer's fields by position (`page`, `x`, `y`, `width`, `height` in PDF points from the page's top left) or by text anchor (`{{signature:signer_1}}`). Every signer needs a `signature` field. Sent at once unless `send` is `false` (a `draft`). Each signer signs by email (`delivery: "email"`, the default) or in your app (`"embedded"`).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.CreateSignRequestRequest{
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Title: "Services agreement",
    Documents: []*sign.CreateSignRequestRequestDocumentsItem{
        &sign.CreateSignRequestRequestDocumentsItem{
            CreateSignRequestRequestDocumentsItemDocumentID: &sign.CreateSignRequestRequestDocumentsItemDocumentID{
                DocumentID: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz",
            },
        },
    },
    Signers: []*sign.CreateSignRequestRequestSignersItem{
        &sign.CreateSignRequestRequestSignersItem{
            Name: "Ada Lovelace",
            Email: "ada@example.com",
            Fields: []*coss.SignFieldInput{
                &coss.SignFieldInput{
                    SignFieldInputAnchor: &coss.SignFieldInputAnchor{
                        Type: coss.SignFieldInputAnchorTypeSignature,
                        Anchor: "{{signature:signer_1}}",
                    },
                },
                &coss.SignFieldInput{
                    SignFieldInputDocument: &coss.SignFieldInputDocument{
                        Type: coss.SignFieldInputDocumentTypeDateSigned,
                        Page: int64(2),
                        X: 320,
                        Y: 640,
                        Width: 120,
                        Height: 18,
                    },
                },
            },
        },
    },
}
client.Sign.Requests.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original request (in its current state) instead of creating another, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**title:** `string` — Shown to signers.
    
</dd>
</dl>

<dl>
<dd>

**message:** `*string` — A note to signers.
    
</dd>
</dl>

<dl>
<dd>

**documents:** `[]*sign.CreateSignRequestRequestDocumentsItem` — Uploaded documents by id, or PDFs inline (base64).
    
</dd>
</dl>

<dl>
<dd>

**signers:** `[]*sign.CreateSignRequestRequestSignersItem` — Who signs, and what each fills.
    
</dd>
</dl>

<dl>
<dd>

**signingOrder:** `*sign.CreateSignRequestRequestSigningOrder` — `parallel` (default): everyone at once. `sequential`: in each signer's `order`.
    
</dd>
</dl>

<dl>
<dd>

**expiresAt:** `*time.Time` — When unsigned requests expire (at most 365 days ahead).
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs, returned with the request and its webhooks.
    
</dd>
</dl>

<dl>
<dd>

**reminderIntervalDays:** `*int` — Email signers who haven't signed get a reminder every this many days (up to 3). Default: your Sign settings' `reminder_interval_days`; `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**send:** `*bool` — Default `true`: send at once. `false` keeps a `draft` to send later.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.Get(ID) -> *coss.SignRequest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A signature request with its documents, signers and fields, and `signed_document` once it's sealed.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.GetRequestsRequest{
    ID: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Requests.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The signature request's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.Remove(ID) -> *coss.DeletedSignRequest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Deletes a request that isn't `sent` (cancel it first) with its signers, fields, audit trail, signatures and signed document, for good. Its documents stay (delete them on their own). Keep the signed document first if you need it: it is your record.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.RemoveRequestsRequest{
    ID: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Requests.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The signature request's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.Send(ID) -> *coss.SignRequest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sends a `draft`. An already sent request is returned as is.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.SendRequestsRequest{
    ID: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Requests.Send(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The signature request's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.Cancel(ID) -> *coss.SignRequest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Cancels a `draft` or `sent` request: its signers can no longer sign. An already canceled request is returned as is.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.CancelRequestsRequest{
    ID: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Requests.Cancel(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The signature request's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.AuditTrail(ID) -> *coss.SignEventList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Everything that happened to the request, oldest first: who did it, from which address, the documents' SHA-256 when it mattered, and a hash chain (`previous_hash`, `hash`) that shows the trail is complete and unchanged.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.AuditTrailRequestsRequest{
    ID: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Requests.AuditTrail(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The signature request's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.Remind(ID) -> *coss.SignRequest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Emails a reminder, with a fresh link, to every email signer of a sent request who hasn't signed and whose turn it is, unless they were emailed in the last hour. Embedded signers are yours to remind. Sent within seconds; each is a `reminded` event in the audit trail.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.RemindRequestsRequest{
    ID: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Requests.Remind(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The signature request's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.SignedDocument(ID) -> string</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The completed request's sealed PDF: every document with the signatures and values filled in, then a certificate of completion (signers, how they were identified, what they agreed to, the documents' SHA-256 and the audit trail). coss.com's seal makes any later change visible in PDF viewers. Ready once `signed_document` is set, which the `sign_request.completed` webhook announces.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.SignedDocumentRequestsRequest{
    ID: "id",
}
client.Sign.Requests.SignedDocument(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The signature request's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Sessions
<details><summary><code>client.Sign.Sessions.Create(ID, SignerID, request) -> *coss.SignSession</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A short-lived link to the signing page for one `embedded` signer of a sent request. Your app vouches for who the signer is (the audit trail records `customer_asserted`), so create it only for that signed-in user, when they open the page that shows it. Embed the `url` in an iframe from an origin in your Sign settings' `allowed_origins` (`mountSigning` from `coss/sign` does it), or redirect to it. Each call creates a new session.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.CreateSignSessionRequest{
    ID: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
    SignerID: "ssgn_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ExpiresIn: coss.Int(
        3600,
    ),
}
client.Sign.Sessions.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**signerID:** `string` — The signer's id (`signers[].id` of the request).
    
</dd>
</dl>

<dl>
<dd>

**expiresIn:** `*int` — Seconds until the link expires: default 3600, at most 86400. Mint one when your user opens the page that shows it.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Settings
<details><summary><code>client.Sign.Settings.Get() -> *coss.SignSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The API key's environment's settings: which sites may embed the signing page, how it looks, and the consent text signers accept.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Sign.Settings.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Settings.Update(request) -> *coss.SignSettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given; the others keep their values.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.UpdateSignSettingsRequest{
    AllowedOrigins: []string{
        "https://app.example.com",
    },
    DisplayName: coss.String(
        "Acme",
    ),
}
client.Sign.Settings.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**allowedOrigins:** `[]string` — Origins that may embed the signing page in an iframe, like `https://app.example.com` (sandbox environments also `http://localhost:<port>`). Empty: it can only be opened on its own.
    
</dd>
</dl>

<dl>
<dd>

**displayName:** `*string` — The requester's name signers see. `null`: the organization's name.
    
</dd>
</dl>

<dl>
<dd>

**accentColor:** `*string` — The signing page's accent color, as `#RRGGBB`. `null`: the default.
    
</dd>
</dl>

<dl>
<dd>

**theme:** `*sign.UpdateSignSettingsRequestTheme` — The signing page's theme. `system` follows the signer's device.
    
</dd>
</dl>

<dl>
<dd>

**disclosure:** `*string` — Your own consent text signers accept before they see a document. `null`: coss.com's default. Have your counsel review a replacement.
    
</dd>
</dl>

<dl>
<dd>

**emailFrom:** `*string` — Signing emails come from this address, on a verified domain in live environments. `null`: from coss.com, as "<display name> via coss.com".
    
</dd>
</dl>

<dl>
<dd>

**reminderIntervalDays:** `*int` — The default days between reminders for new requests. `null`: none.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Templates
<details><summary><code>client.Sign.Templates.List() -> *coss.SignTemplateList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Newest first. Pass the last `id` as `after` while `has_more` is true.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.ListTemplatesRequest{}
client.Sign.Templates.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.Create(request) -> *coss.SignTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Documents with fields for roles (`client`, `company`) instead of named signers, made into requests by naming a signer per role. Fields by position or text anchor (resolved now). Can start empty and be built in the embedded builder (create a builder session).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.CreateSignTemplateRequest{
    Name: "Mutual NDA",
    Documents: []*sign.CreateSignTemplateRequestDocumentsItem{
        &sign.CreateSignTemplateRequestDocumentsItem{
            CreateSignTemplateRequestDocumentsItemDocumentID: &sign.CreateSignTemplateRequestDocumentsItemDocumentID{
                DocumentID: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz",
            },
        },
    },
    Roles: []*sign.CreateSignTemplateRequestRolesItem{
        &sign.CreateSignTemplateRequestRolesItem{
            Key: "client",
            Name: "Client",
        },
        &sign.CreateSignTemplateRequestRolesItem{
            Key: "company",
            Name: "Company",
        },
    },
    Fields: []*sign.CreateSignTemplateRequestFieldsItem{
        &sign.CreateSignTemplateRequestFieldsItem{
            CreateSignTemplateRequestFieldsItemAnchor: &sign.CreateSignTemplateRequestFieldsItemAnchor{
                Type: sign.CreateSignTemplateRequestFieldsItemAnchorTypeSignature,
                Anchor: "{{signature:client}}",
                Role: "client",
            },
        },
        &sign.CreateSignTemplateRequestFieldsItem{
            CreateSignTemplateRequestFieldsItemDocument: &sign.CreateSignTemplateRequestFieldsItemDocument{
                Type: sign.CreateSignTemplateRequestFieldsItemDocumentTypeText,
                Page: int64(1),
                X: 72,
                Y: 140,
                Width: 200,
                Height: 18,
                Role: "client",
                MergeKey: coss.String(
                    "client_company",
                ),
            },
        },
        &sign.CreateSignTemplateRequestFieldsItem{
            CreateSignTemplateRequestFieldsItemAnchor: &sign.CreateSignTemplateRequestFieldsItemAnchor{
                Type: sign.CreateSignTemplateRequestFieldsItemAnchorTypeSignature,
                Anchor: "{{signature:company}}",
                Role: "company",
            },
        },
    },
}
client.Sign.Templates.Create(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `string` — Your name for the template.
    
</dd>
</dl>

<dl>
<dd>

**title:** `*string` — Requests' title (a request may set its own). Default: `name`.
    
</dd>
</dl>

<dl>
<dd>

**message:** `*string` — Requests' message to signers (a request may set its own).
    
</dd>
</dl>

<dl>
<dd>

**signingOrder:** `*sign.CreateSignTemplateRequestSigningOrder` — `parallel`: everyone at once. `sequential`: in each signer's `order`. Default for its requests.
    
</dd>
</dl>

<dl>
<dd>

**documents:** `[]*sign.CreateSignTemplateRequestDocumentsItem` — Uploaded documents by id, or PDFs inline (base64).
    
</dd>
</dl>

<dl>
<dd>

**roles:** `[]*sign.CreateSignTemplateRequestRolesItem` — Who signs: each request names one signer per role.
    
</dd>
</dl>

<dl>
<dd>

**fields:** `[]*sign.CreateSignTemplateRequestFieldsItem` — Each role's fields, by position or text anchor (resolved when saved). A template can be used once every role has a `signature` field.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.Get(ID) -> *coss.SignTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A template with its documents, roles and fields. `ready` says whether requests can be made from it.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.GetTemplatesRequest{
    ID: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Templates.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.Remove(ID) -> *coss.DeletedSignTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Requests made from it, and its documents, stay.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.RemoveTemplatesRequest{
    ID: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sign.Templates.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.Update(ID, request) -> *coss.SignTemplate</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given. `documents`, `roles` and `fields` each replace the whole list. Requests already made from it don't change.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.UpdateSignTemplateRequest{
    ID: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    Name: coss.String(
        "Mutual NDA (2026)",
    ),
}
client.Sign.Templates.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `*string` — Your name for the template.
    
</dd>
</dl>

<dl>
<dd>

**title:** `*string` — Requests' title (a request may set its own). Default: `name`.
    
</dd>
</dl>

<dl>
<dd>

**message:** `*string` — Requests' message to signers (a request may set its own).
    
</dd>
</dl>

<dl>
<dd>

**signingOrder:** `*sign.UpdateSignTemplateRequestSigningOrder` — `parallel`: everyone at once. `sequential`: in each signer's `order`. Default for its requests.
    
</dd>
</dl>

<dl>
<dd>

**documents:** `[]*sign.UpdateSignTemplateRequestDocumentsItem` — Uploaded documents by id, or PDFs inline (base64).
    
</dd>
</dl>

<dl>
<dd>

**roles:** `[]*sign.UpdateSignTemplateRequestRolesItem` — Who signs: each request names one signer per role.
    
</dd>
</dl>

<dl>
<dd>

**fields:** `[]*sign.UpdateSignTemplateRequestFieldsItem` — Each role's fields, by position or text anchor (resolved when saved). A template can be used once every role has a `signature` field.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.CreateRequest(ID, request) -> *coss.SignRequest</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A signature request with the template's documents and fields: name one signer for each role, and give its merge fields' values. Like creating a request, it is sent at once unless `send` is `false`, and an `Idempotency-Key` makes retries safe.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.CreateSignRequestFromTemplateRequest{
    ID: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    IdempotencyKey: coss.String(
        "welcome-user-123",
    ),
    Signers: []*sign.CreateSignRequestFromTemplateRequestSignersItem{
        &sign.CreateSignRequestFromTemplateRequestSignersItem{
            Role: "client",
            Name: "Ada Lovelace",
            Email: "ada@example.com",
        },
        &sign.CreateSignRequestFromTemplateRequestSignersItem{
            Role: "company",
            Name: "Grace Hopper",
            Email: "grace@acme.com",
            Delivery: sign.CreateSignRequestFromTemplateRequestSignersItemDeliveryEmbedded.Ptr(),
        },
    },
    MergeFields: map[string]string{
        "client_company": "Analytical Engines Ltd",
    },
}
client.Sign.Templates.CreateRequest(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id.
    
</dd>
</dl>

<dl>
<dd>

**idempotencyKey:** `*string` — Makes retries safe: a repeated request with the same key and body returns the original request (in its current state) instead of creating another, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**title:** `*string` — Default: the template's title (else its name).
    
</dd>
</dl>

<dl>
<dd>

**message:** `*string` — Default: the template's message.
    
</dd>
</dl>

<dl>
<dd>

**signers:** `[]*sign.CreateSignRequestFromTemplateRequestSignersItem` — One signer for each of the template's roles.
    
</dd>
</dl>

<dl>
<dd>

**mergeFields:** `map[string]string` — Values of the template's merge fields, by `merge_key`.
    
</dd>
</dl>

<dl>
<dd>

**signingOrder:** `*sign.CreateSignRequestFromTemplateRequestSigningOrder` — Default: the template's.
    
</dd>
</dl>

<dl>
<dd>

**expiresAt:** `*time.Time` — When an unfinished request expires, at most 365 days ahead.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `map[string]string` — Your own key-value pairs, returned with the request and its webhooks.
    
</dd>
</dl>

<dl>
<dd>

**reminderIntervalDays:** `*int` — Days between reminders to email signers. Default: your Sign settings'. `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**send:** `*bool` — Default `true`.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.CreateBuilderSession(ID, request) -> *coss.SignBuilderSession</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

A short-lived link to the embedded builder for this template: upload documents, add roles, and drag fields onto pages. Embed it with `mountBuilder` from `coss/sign` (from an origin in your Sign settings' `allowed_origins`) for whoever edits the template.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sign.CreateSignBuilderSessionRequest{
    ID: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
    ExpiresIn: coss.Int(
        3600,
    ),
}
client.Sign.Templates.CreateBuilderSession(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The template's id.
    
</dd>
</dl>

<dl>
<dd>

**expiresIn:** `*int` — Seconds until the link expires: default 3600, at most 86400.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Suppressions
<details><summary><code>client.Sms.Suppressions.List() -> *coss.SmsSuppressionList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The SMS suppression list of the API key's environment, newest first: opt-outs, invalid numbers and numbers you added.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sms.ListSuppressionsRequest{}
client.Sms.Suppressions.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**phoneNumber:** `*string` — Only this number's entry.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Suppressions.Add(request) -> *coss.SmsSuppression</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Later sends from the API key's environment to the number are skipped. Adding a number already on the list returns its entry with status 200.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sms.CreateSmsSuppressionRequest{
    PhoneNumber: "+14155550199",
}
client.Sms.Suppressions.Add(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**phoneNumber:** `string` — The number to suppress, in E.164.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Suppressions.Check() -> *coss.SmsSuppressionCheck</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Whether a phone number is on the SMS suppression list of the API key's environment, with its entry if it is.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sms.CheckSuppressionsRequest{
    PhoneNumber: "phone_number",
}
client.Sms.Suppressions.Check(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**phoneNumber:** `string` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Suppressions.Get(ID) -> *coss.SmsSuppression</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One entry of the SMS suppression list of the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sms.GetSuppressionsRequest{
    ID: "smssup_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sms.Suppressions.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The entry's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Suppressions.Remove(ID) -> *coss.DeletedSmsSuppression</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Sends to the number go out again. Remove an opt-out only when the person asked to receive messages again (they can also reply START).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sms.RemoveSuppressionsRequest{
    ID: "smssup_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sms.Suppressions.Remove(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The entry's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Received
<details><summary><code>client.Sms.Received.List() -> *coss.ReceivedSmsList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Messages sent to the organization's numbers whose replies go to the API key's environment, newest first.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sms.ListReceivedRequest{}
client.Sms.Received.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**from:** `*string` — Only messages from this number.
    
</dd>
</dl>

<dl>
<dd>

**to:** `*string` — Only messages to this number of yours.
    
</dd>
</dl>

<dl>
<dd>

**createdAfter:** `*time.Time` 
    
</dd>
</dl>

<dl>
<dd>

**createdBefore:** `*time.Time` 
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Received.Get(ID) -> *coss.ReceivedSms</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One message received on a number of the organization and routed to the API key's environment.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &sms.GetReceivedRequest{
    ID: "smsin_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.Sms.Received.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The received message's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Numbers
<details><summary><code>client.Sms.Numbers.List() -> *coss.SmsNumberList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Every number of the organization, whether it can send live messages now (its carrier registration is approved) and whether its replies arrive in the API key's environment. Numbers are bought and registered in the dashboard.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Sms.Numbers.List(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Verify Settings
<details><summary><code>client.Verify.Settings.Get() -> *coss.VerifySettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The API key's environment's settings, with defaults filled in: the name codes are sent for, code length, lifetime and attempts, the senders, and the countries SMS codes may go to.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
client.Verify.Settings.Get(
    context.TODO(),
)
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.Settings.Update(request) -> *coss.VerifySettings</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Changes the fields given; the others keep their values. `sms_from` must be one of the organization's numbers, and a live key's `email_from` must be on one of its verified domains.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &verify.UpdateVerifySettingsRequest{
    SmsFrom: coss.String(
        "+14155550100",
    ),
    AllowedCountries: []string{
        "CA",
        "GB",
        "US",
    },
}
client.Verify.Settings.Update(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**appName:** `*string` — The name codes are sent for; `null`: the project's.
    
</dd>
</dl>

<dl>
<dd>

**codeLength:** `*int` — Digits in a code, 4-10.
    
</dd>
</dl>

<dl>
<dd>

**ttlSeconds:** `*int` — How long a code works, 60-1800 s.
    
</dd>
</dl>

<dl>
<dd>

**maxAttempts:** `*int` — Wrong codes before a verification fails, 1-10.
    
</dd>
</dl>

<dl>
<dd>

**smsFrom:** `*string` — One of the organization's numbers; `null`: coss.com's shared numbers.
    
</dd>
</dl>

<dl>
<dd>

**emailFrom:** `*string` — An address on one of the organization's verified domains (live keys); `null`: coss.com's.
    
</dd>
</dl>

<dl>
<dd>

**allowedCountries:** `[]string` — ISO 3166 countries SMS codes may go to.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookEndpoints Deliveries
<details><summary><code>client.WebhookEndpoints.Deliveries.List(ID) -> *coss.WebhookDeliveryList</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

The endpoint's delivery log, newest first: one delivery per event sent to it, with every HTTP attempt and the payload as sent. Pass the last `id` as `after` to get the next page while `has_more` is true. Deleting the endpoint deletes its log.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &webhookendpoints.ListDeliveriesRequest{
    ID: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
}
client.WebhookEndpoints.Deliveries.List(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**status:** `*webhookendpoints.ListDeliveriesRequestStatus` — Only deliveries with this status.
    
</dd>
</dl>

<dl>
<dd>

**eventID:** `*string` — Only the delivery of this event.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `*int` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `*string` — Cursor: the `id` of the last delivery of the previous page.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Deliveries.Get(ID, DeliveryID) -> *coss.WebhookDelivery</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

One delivery of the endpoint, with every HTTP attempt and the payload as sent.
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &webhookendpoints.GetDeliveriesRequest{
    ID: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    DeliveryID: "whdel_01k7c8n2b5d7f9h1k3m5p7r9tv",
}
client.WebhookEndpoints.Deliveries.Get(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**deliveryID:** `string` — The delivery's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Deliveries.Retry(ID, DeliveryID) -> *coss.WebhookDelivery</code></summary>
<dl>
<dd>

#### 📝 Description

<dl>
<dd>

<dl>
<dd>

Queues a finished delivery (`succeeded` or `failed`) for one more attempt, made within seconds, signed with the endpoint's current secret and sent to its current URL. A delivery that is still `pending` is returned unchanged: it is already scheduled for `next_attempt_at` (automatic retries stop after 8 attempts).
</dd>
</dl>
</dd>
</dl>

#### 🔌 Usage

<dl>
<dd>

<dl>
<dd>

```go
request := &webhookendpoints.RetryDeliveriesRequest{
    ID: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    DeliveryID: "whdel_01k7c8n2b5d7f9h1k3m5p7r9tv",
}
client.WebhookEndpoints.Deliveries.Retry(
    context.TODO(),
    request,
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `string` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**deliveryID:** `string` — The delivery's id.
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

