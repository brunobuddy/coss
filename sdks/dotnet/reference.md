# Reference
## Environment
<details><summary><code>client.Environment.<a href="/src/Coss/Environment/EnvironmentClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;Environment&gt;</code></summary>
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

```csharp
await client.Environment.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## ApiKey
<details><summary><code>client.ApiKey.<a href="/src/Coss/ApiKey/ApiKeyClient.cs">RevokeAsync</a>() -> WithRawResponseTask&lt;DeletedApiKey&gt;</code></summary>
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

```csharp
await client.ApiKey.RevokeAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email
<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">ListAsync</a>(ListEmailRequest { ... }) -> WithRawResponseTask&lt;EmailSummaryList&gt;</code></summary>
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

```csharp
await client.Email.ListAsync(new ListEmailRequest { To = "user@example.com" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">SendAsync</a>(SendEmailBody { ... }) -> WithRawResponseTask&lt;EmailMessage&gt;</code></summary>
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

```csharp
await client.Email.SendAsync(
    new SendEmailBody
    {
        IdempotencyKey = "welcome-user-123",
        Body = new SendEmailRequest
        {
            From = "Acme <onboarding@acme.com>",
            To = "user@example.com",
            Subject = "Welcome to Acme",
            Html = "<p>Thanks for signing up!</p>",
            Tags = new List<SendEmailRequestTagsItem>()
            {
                new SendEmailRequestTagsItem { Name = "template", Value = "welcome" },
            },
            Category = "onboarding",
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SendEmailBody` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">SendBatchAsync</a>(SendEmailBatchRequest { ... }) -> WithRawResponseTask&lt;EmailBatch&gt;</code></summary>
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

```csharp
await client.Email.SendBatchAsync(
    new SendEmailBatchRequest
    {
        IdempotencyKey = "welcome-user-123",
        Emails = new List<SendEmailRequest>()
        {
            new SendEmailRequest
            {
                From = "Acme <notifications@acme.com>",
                To = "ada@example.com",
                Subject = "Your weekly summary",
                Html = "<p>Hi Ada, here is your week.</p>",
                Category = "digest",
            },
            new SendEmailRequest
            {
                From = "Acme <notifications@acme.com>",
                To = "grace@example.com",
                Subject = "Your weekly summary",
                Html = "<p>Hi Grace, here is your week.</p>",
                Category = "digest",
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SendEmailBatchRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">GetBatchAsync</a>(GetBatchEmailRequest { ... }) -> WithRawResponseTask&lt;EmailBatch&gt;</code></summary>
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

```csharp
await client.Email.GetBatchAsync(
    new GetBatchEmailRequest { Id = "batch_01k8d0n6x5f3w2e1r9t7y4u6i8" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetBatchEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">GetAsync</a>(GetEmailRequest { ... }) -> WithRawResponseTask&lt;EmailMessage&gt;</code></summary>
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

```csharp
await client.Email.GetAsync(new GetEmailRequest { Id = "email_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">CancelAsync</a>(CancelEmailRequest { ... }) -> WithRawResponseTask&lt;EmailMessage&gt;</code></summary>
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

```csharp
await client.Email.CancelAsync(new CancelEmailRequest { Id = "email_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CancelEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">RescheduleAsync</a>(RescheduleEmailRequest { ... }) -> WithRawResponseTask&lt;EmailMessage&gt;</code></summary>
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

```csharp
await client.Email.RescheduleAsync(
    new RescheduleEmailRequest
    {
        Id = "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
        ScheduledAt = new DateTime(2026, 10, 12, 09, 00, 00, 000),
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RescheduleEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">ListEventsAsync</a>(ListEventsEmailRequest { ... }) -> WithRawResponseTask&lt;EmailEventList&gt;</code></summary>
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

```csharp
await client.Email.ListEventsAsync(
    new ListEventsEmailRequest { Id = "email_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListEventsEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.<a href="/src/Coss/Email/EmailClient.cs">ListLinksAsync</a>(ListLinksEmailRequest { ... }) -> WithRawResponseTask&lt;EmailLinkList&gt;</code></summary>
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

```csharp
await client.Email.ListLinksAsync(
    new ListLinksEmailRequest { Id = "email_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListLinksEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains
<details><summary><code>client.Domains.<a href="/src/Coss/Domains/DomainsClient.cs">ListAsync</a>(ListDomainsRequest { ... }) -> WithRawResponseTask&lt;DomainList&gt;</code></summary>
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

```csharp
await client.Domains.ListAsync(new ListDomainsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListDomainsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.<a href="/src/Coss/Domains/DomainsClient.cs">CreateAsync</a>(CreateDomainRequest { ... }) -> WithRawResponseTask&lt;Domain&gt;</code></summary>
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

```csharp
await client.Domains.CreateAsync(new CreateDomainRequest { Name = "acme.com" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateDomainRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.<a href="/src/Coss/Domains/DomainsClient.cs">GetAsync</a>(GetDomainsRequest { ... }) -> WithRawResponseTask&lt;Domain&gt;</code></summary>
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

```csharp
await client.Domains.GetAsync(new GetDomainsRequest { Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetDomainsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.<a href="/src/Coss/Domains/DomainsClient.cs">DeleteAsync</a>(DeleteDomainsRequest { ... }) -> WithRawResponseTask&lt;DeletedDomain&gt;</code></summary>
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

```csharp
await client.Domains.DeleteAsync(
    new DeleteDomainsRequest { Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteDomainsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.<a href="/src/Coss/Domains/DomainsClient.cs">UpdateAsync</a>(UpdateDomainRequest { ... }) -> WithRawResponseTask&lt;Domain&gt;</code></summary>
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

```csharp
await client.Domains.UpdateAsync(
    new UpdateDomainRequest { Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz", SharedWithSubaccounts = true }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateDomainRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.<a href="/src/Coss/Domains/DomainsClient.cs">VerifyAsync</a>(VerifyDomainsRequest { ... }) -> WithRawResponseTask&lt;Domain&gt;</code></summary>
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

```csharp
await client.Domains.VerifyAsync(
    new VerifyDomainsRequest { Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `VerifyDomainsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Webhook endpoints
<details><summary><code>client.WebhookEndpoints.<a href="/src/Coss/WebhookEndpoints/WebhookEndpointsClient.cs">ListAsync</a>() -> WithRawResponseTask&lt;WebhookEndpointList&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.ListAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.<a href="/src/Coss/WebhookEndpoints/WebhookEndpointsClient.cs">CreateAsync</a>(CreateWebhookEndpointRequest { ... }) -> WithRawResponseTask&lt;WebhookEndpointWithSecret&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.CreateAsync(
    new CreateWebhookEndpointRequest
    {
        Url = "https://example.com/webhooks/coss",
        Description = "Production receiver",
        EventTypes = new List<CreateWebhookEndpointRequestEventTypesItem>()
        {
            CreateWebhookEndpointRequestEventTypesItem.EmailSent,
            CreateWebhookEndpointRequestEventTypesItem.EmailDelivered,
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateWebhookEndpointRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.<a href="/src/Coss/WebhookEndpoints/WebhookEndpointsClient.cs">GetAsync</a>(GetWebhookEndpointsRequest { ... }) -> WithRawResponseTask&lt;WebhookEndpoint&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.GetAsync(
    new GetWebhookEndpointsRequest { Id = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetWebhookEndpointsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.<a href="/src/Coss/WebhookEndpoints/WebhookEndpointsClient.cs">DeleteAsync</a>(DeleteWebhookEndpointsRequest { ... }) -> WithRawResponseTask&lt;DeletedWebhookEndpoint&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.DeleteAsync(
    new DeleteWebhookEndpointsRequest { Id = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteWebhookEndpointsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.<a href="/src/Coss/WebhookEndpoints/WebhookEndpointsClient.cs">UpdateAsync</a>(UpdateWebhookEndpointRequest { ... }) -> WithRawResponseTask&lt;WebhookEndpoint&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.UpdateAsync(
    new UpdateWebhookEndpointRequest { Id = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz", Enabled = false }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateWebhookEndpointRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.<a href="/src/Coss/WebhookEndpoints/WebhookEndpointsClient.cs">RollSecretAsync</a>(RollWebhookEndpointSecretRequest { ... }) -> WithRawResponseTask&lt;WebhookEndpointWithSecret&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.RollSecretAsync(
    new RollWebhookEndpointSecretRequest
    {
        Id = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        PreviousSecretExpiresIn = 3600,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RollWebhookEndpointSecretRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.<a href="/src/Coss/WebhookEndpoints/WebhookEndpointsClient.cs">RecoverAsync</a>(RecoverWebhookEndpointRequest { ... }) -> WithRawResponseTask&lt;WebhookEndpointRecovery&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.RecoverAsync(
    new RecoverWebhookEndpointRequest
    {
        Id = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Since = new DateTime(2026, 01, 15, 09, 00, 00, 000),
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RecoverWebhookEndpointRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookListeners
<details><summary><code>client.WebhookListeners.<a href="/src/Coss/WebhookListeners/WebhookListenersClient.cs">CreateAsync</a>(CreateWebhookListenerRequest { ... }) -> WithRawResponseTask&lt;WebhookListener&gt;</code></summary>
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

```csharp
await client.WebhookListeners.CreateAsync(
    new CreateWebhookListenerRequest
    {
        EventTypes = new List<CreateWebhookListenerRequestEventTypesItem>()
        {
            CreateWebhookListenerRequestEventTypesItem.EmailSent,
            CreateWebhookListenerRequestEventTypesItem.EmailDelivered,
        },
        Description = "localhost:3000/webhooks",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateWebhookListenerRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookListeners.<a href="/src/Coss/WebhookListeners/WebhookListenersClient.cs">PollAsync</a>(PollWebhookListenerRequest { ... }) -> WithRawResponseTask&lt;WebhookListenerPoll&gt;</code></summary>
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

```csharp
await client.WebhookListeners.PollAsync(
    new PollWebhookListenerRequest
    {
        Id = "whlis_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Acks = new List<WebhookListenerAck>()
        {
            new WebhookListenerAck
            {
                DeliveryId = "whlisdel_01k7c8n2b5d7f9h1k3m5p7r9tv",
                AckToken = "mfz3k2a8",
                StatusCode = 200,
                DurationMs = 12,
                Error = null,
            },
        },
        WaitMs = 20000,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `PollWebhookListenerRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookListeners.<a href="/src/Coss/WebhookListeners/WebhookListenersClient.cs">DeleteAsync</a>(DeleteWebhookListenersRequest { ... }) -> WithRawResponseTask&lt;DeletedWebhookListener&gt;</code></summary>
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

```csharp
await client.WebhookListeners.DeleteAsync(
    new DeleteWebhookListenersRequest { Id = "whlis_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteWebhookListenersRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookEvents
<details><summary><code>client.WebhookEvents.<a href="/src/Coss/WebhookEvents/WebhookEventsClient.cs">TestAsync</a>(CreateTestWebhookEventRequest { ... }) -> WithRawResponseTask&lt;WebhookTestEvent&gt;</code></summary>
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

```csharp
await client.WebhookEvents.TestAsync(
    new CreateTestWebhookEventRequest
    {
        Type = CreateTestWebhookEventRequestType.EmailBounced,
        Data = new Dictionary<string, object?>() { { "recipient", "ada@example.com" } },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateTestWebhookEventRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## SMS
<details><summary><code>client.Sms.<a href="/src/Coss/Sms/SmsClient.cs">ListAsync</a>(ListSmsRequest { ... }) -> WithRawResponseTask&lt;SmsList&gt;</code></summary>
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

```csharp
await client.Sms.ListAsync(new ListSmsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListSmsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.<a href="/src/Coss/Sms/SmsClient.cs">SendAsync</a>(SendSmsRequest { ... }) -> WithRawResponseTask&lt;Sms&gt;</code></summary>
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

```csharp
await client.Sms.SendAsync(
    new SendSmsRequest
    {
        IdempotencyKey = "welcome-user-123",
        From = "+14155550123",
        To = "+14155550199",
        Body = "Your Acme code is 482913",
        Tags = new List<SendSmsRequestTagsItem>()
        {
            new SendSmsRequestTagsItem { Name = "flow", Value = "sign_in" },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SendSmsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.<a href="/src/Coss/Sms/SmsClient.cs">GetAsync</a>(GetSmsRequest { ... }) -> WithRawResponseTask&lt;Sms&gt;</code></summary>
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

```csharp
await client.Sms.GetAsync(new GetSmsRequest { Id = "sms_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetSmsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.<a href="/src/Coss/Sms/SmsClient.cs">ListEventsAsync</a>(ListEventsSmsRequest { ... }) -> WithRawResponseTask&lt;SmsEventList&gt;</code></summary>
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

```csharp
await client.Sms.ListEventsAsync(
    new ListEventsSmsRequest { Id = "sms_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListEventsSmsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.<a href="/src/Coss/Sms/SmsClient.cs">CancelAsync</a>(CancelSmsRequest { ... }) -> WithRawResponseTask&lt;Sms&gt;</code></summary>
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

```csharp
await client.Sms.CancelAsync(new CancelSmsRequest { Id = "sms_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CancelSmsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Verify
<details><summary><code>client.Verify.<a href="/src/Coss/Verify/VerifyClient.cs">ListAsync</a>(ListVerifyRequest { ... }) -> WithRawResponseTask&lt;VerificationList&gt;</code></summary>
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

```csharp
await client.Verify.ListAsync(new ListVerifyRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListVerifyRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.<a href="/src/Coss/Verify/VerifyClient.cs">StartAsync</a>(StartVerificationRequest { ... }) -> WithRawResponseTask&lt;Verification&gt;</code></summary>
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

```csharp
await client.Verify.StartAsync(
    new StartVerificationRequest
    {
        IdempotencyKey = "welcome-user-123",
        To = "+14155550199",
        Ip = "203.0.113.7",
        UserId = "user_42",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `StartVerificationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.<a href="/src/Coss/Verify/VerifyClient.cs">CheckAsync</a>(CheckVerificationRequest { ... }) -> WithRawResponseTask&lt;VerificationCheck&gt;</code></summary>
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

```csharp
await client.Verify.CheckAsync(
    new CheckVerificationRequest
    {
        IdempotencyKey = "welcome-user-123",
        To = "+14155550199",
        Code = "482913",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CheckVerificationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.<a href="/src/Coss/Verify/VerifyClient.cs">GetAsync</a>(GetVerifyRequest { ... }) -> WithRawResponseTask&lt;Verification&gt;</code></summary>
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

```csharp
await client.Verify.GetAsync(new GetVerifyRequest { Id = "vrf_01k8e2m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetVerifyRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.<a href="/src/Coss/Verify/VerifyClient.cs">CancelAsync</a>(CancelVerifyRequest { ... }) -> WithRawResponseTask&lt;Verification&gt;</code></summary>
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

```csharp
await client.Verify.CancelAsync(new CancelVerifyRequest { Id = "vrf_01k8e2m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CancelVerifyRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Forms
<details><summary><code>client.Forms.<a href="/src/Coss/Forms/FormsClient.cs">ListAsync</a>(ListFormsRequest { ... }) -> WithRawResponseTask&lt;FormList&gt;</code></summary>
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

```csharp
await client.Forms.ListAsync(new ListFormsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListFormsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.<a href="/src/Coss/Forms/FormsClient.cs">CreateAsync</a>(CreateFormRequest { ... }) -> WithRawResponseTask&lt;Form&gt;</code></summary>
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

```csharp
await client.Forms.CreateAsync(
    new CreateFormRequest
    {
        Name = "Contact us",
        AllowedOrigins = new List<string>() { "https://www.example.com" },
        Notifications = new CreateFormRequestNotifications
        {
            Recipients = new List<string>() { "support@example.com" },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateFormRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.<a href="/src/Coss/Forms/FormsClient.cs">GetAsync</a>(GetFormsRequest { ... }) -> WithRawResponseTask&lt;Form&gt;</code></summary>
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

```csharp
await client.Forms.GetAsync(new GetFormsRequest { Id = "form_01kd2m8n3p4q5r6s7t8v9w0x1y" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetFormsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.<a href="/src/Coss/Forms/FormsClient.cs">RemoveAsync</a>(RemoveFormsRequest { ... }) -> WithRawResponseTask&lt;DeletedForm&gt;</code></summary>
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

```csharp
await client.Forms.RemoveAsync(new RemoveFormsRequest { Id = "form_01kd2m8n3p4q5r6s7t8v9w0x1y" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveFormsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.<a href="/src/Coss/Forms/FormsClient.cs">UpdateAsync</a>(UpdateFormRequest { ... }) -> WithRawResponseTask&lt;Form&gt;</code></summary>
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

```csharp
await client.Forms.UpdateAsync(
    new UpdateFormRequest
    {
        Id = "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
        Spam = new UpdateFormRequestSpam { Captcha = UpdateFormRequestSpamCaptcha.Required },
        Contacts = new UpdateFormRequestContacts { Enabled = true },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateFormRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Reputation
<details><summary><code>client.Reputation.<a href="/src/Coss/Reputation/ReputationClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;Reputation&gt;</code></summary>
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

```csharp
await client.Reputation.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Logs
<details><summary><code>client.Logs.<a href="/src/Coss/Logs/LogsClient.cs">ListAsync</a>(ListLogsRequest { ... }) -> WithRawResponseTask&lt;LogList&gt;</code></summary>
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

```csharp
await client.Logs.ListAsync(new ListLogsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListLogsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Logs.<a href="/src/Coss/Logs/LogsClient.cs">GetAsync</a>(GetLogsRequest { ... }) -> WithRawResponseTask&lt;Log&gt;</code></summary>
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

```csharp
await client.Logs.GetAsync(new GetLogsRequest { Id = "log_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetLogsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## AuditEvents
<details><summary><code>client.AuditEvents.<a href="/src/Coss/AuditEvents/AuditEventsClient.cs">ListAsync</a>(ListAuditEventsRequest { ... }) -> WithRawResponseTask&lt;AuditEventList&gt;</code></summary>
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

```csharp
await client.AuditEvents.ListAsync(new ListAuditEventsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListAuditEventsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.AuditEvents.<a href="/src/Coss/AuditEvents/AuditEventsClient.cs">GetAsync</a>(GetAuditEventsRequest { ... }) -> WithRawResponseTask&lt;AuditEvent&gt;</code></summary>
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

```csharp
await client.AuditEvents.GetAsync(
    new GetAuditEventsRequest { Id = "oaudit_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetAuditEventsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing
<details><summary><code>client.Billing.<a href="/src/Coss/Billing/BillingClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;BillingOverview&gt;</code></summary>
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

```csharp
await client.Billing.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Billing.<a href="/src/Coss/Billing/BillingClient.cs">UsageAsync</a>(UsageBillingRequest { ... }) -> WithRawResponseTask&lt;UsageList&gt;</code></summary>
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

```csharp
await client.Billing.UsageAsync(new UsageBillingRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UsageBillingRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Log drains
<details><summary><code>client.LogDrains.<a href="/src/Coss/LogDrains/LogDrainsClient.cs">ListAsync</a>() -> WithRawResponseTask&lt;LogDrainList&gt;</code></summary>
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

```csharp
await client.LogDrains.ListAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.<a href="/src/Coss/LogDrains/LogDrainsClient.cs">CreateAsync</a>(CreateLogDrainRequest { ... }) -> WithRawResponseTask&lt;LogDrainWithSecret&gt;</code></summary>
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

```csharp
await client.LogDrains.CreateAsync(
    new CreateLogDrainRequest
    {
        Url = "https://logs.example.com/coss",
        Description = "Production logs",
        Sources = new List<LogDrainSource>() { LogDrainSource.Api, LogDrainSource.Email },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateLogDrainRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.<a href="/src/Coss/LogDrains/LogDrainsClient.cs">GetAsync</a>(GetLogDrainsRequest { ... }) -> WithRawResponseTask&lt;LogDrain&gt;</code></summary>
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

```csharp
await client.LogDrains.GetAsync(
    new GetLogDrainsRequest { Id = "drain_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetLogDrainsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.<a href="/src/Coss/LogDrains/LogDrainsClient.cs">DeleteAsync</a>(DeleteLogDrainsRequest { ... }) -> WithRawResponseTask&lt;DeletedLogDrain&gt;</code></summary>
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

```csharp
await client.LogDrains.DeleteAsync(
    new DeleteLogDrainsRequest { Id = "drain_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteLogDrainsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.<a href="/src/Coss/LogDrains/LogDrainsClient.cs">UpdateAsync</a>(UpdateLogDrainRequest { ... }) -> WithRawResponseTask&lt;LogDrain&gt;</code></summary>
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

```csharp
await client.LogDrains.UpdateAsync(
    new UpdateLogDrainRequest { Id = "drain_01k7c8m4q2f3e9v6t5r1n0p8yz", Enabled = false }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateLogDrainRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes
<details><summary><code>client.Inboxes.<a href="/src/Coss/Inboxes/InboxesClient.cs">ListAsync</a>(ListInboxesRequest { ... }) -> WithRawResponseTask&lt;InboxList&gt;</code></summary>
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

```csharp
await client.Inboxes.ListAsync(new ListInboxesRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListInboxesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.<a href="/src/Coss/Inboxes/InboxesClient.cs">CreateAsync</a>(CreateInboxRequest { ... }) -> WithRawResponseTask&lt;Inbox&gt;</code></summary>
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

```csharp
await client.Inboxes.CreateAsync(
    new CreateInboxRequest
    {
        Username = "support-agent",
        DisplayName = "Acme Support",
        ClientId = "agent-42",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateInboxRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.<a href="/src/Coss/Inboxes/InboxesClient.cs">GetAsync</a>(GetInboxesRequest { ... }) -> WithRawResponseTask&lt;Inbox&gt;</code></summary>
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

```csharp
await client.Inboxes.GetAsync(
    new GetInboxesRequest { InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetInboxesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.<a href="/src/Coss/Inboxes/InboxesClient.cs">DeleteAsync</a>(DeleteInboxesRequest { ... }) -> WithRawResponseTask&lt;DeletedInbox&gt;</code></summary>
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

```csharp
await client.Inboxes.DeleteAsync(
    new DeleteInboxesRequest { InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteInboxesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.<a href="/src/Coss/Inboxes/InboxesClient.cs">UpdateAsync</a>(UpdateInboxRequest { ... }) -> WithRawResponseTask&lt;Inbox&gt;</code></summary>
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

```csharp
await client.Inboxes.UpdateAsync(
    new UpdateInboxRequest
    {
        InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
        DisplayName = "Acme Help",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateInboxRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk
<details><summary><code>client.Risk.<a href="/src/Coss/Risk/RiskClient.cs">AssessAsync</a>(CreateRiskAssessmentRequest { ... }) -> WithRawResponseTask&lt;RiskAssessment&gt;</code></summary>
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

```csharp
await client.Risk.AssessAsync(
    new CreateRiskAssessmentRequest
    {
        IdempotencyKey = "welcome-user-123",
        Event = RiskEvent.Signup,
        User = new CreateRiskAssessmentRequestUser { Email = "ada@gmail.con" },
        Ip = "203.0.113.7",
        UserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateRiskAssessmentRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.<a href="/src/Coss/Risk/RiskClient.cs">FeedbackAsync</a>(CreateRiskFeedbackRequest { ... }) -> WithRawResponseTask&lt;RiskAssessment&gt;</code></summary>
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

```csharp
await client.Risk.FeedbackAsync(
    new CreateRiskFeedbackRequest
    {
        Id = "rsk_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Outcome = RiskOutcome.Fraud,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateRiskFeedbackRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.<a href="/src/Coss/Risk/RiskClient.cs">CalibrationAsync</a>() -> WithRawResponseTask&lt;RiskCalibration&gt;</code></summary>
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

```csharp
await client.Risk.CalibrationAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.<a href="/src/Coss/Risk/RiskClient.cs">CheckEmailAsync</a>(RiskEmailCheckRequest { ... }) -> WithRawResponseTask&lt;RiskEmailCheck&gt;</code></summary>
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

```csharp
await client.Risk.CheckEmailAsync(new RiskEmailCheckRequest { Email = "ada@gnail.com" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RiskEmailCheckRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.<a href="/src/Coss/Risk/RiskClient.cs">CheckIpAsync</a>(RiskIpCheckRequest { ... }) -> WithRawResponseTask&lt;RiskIpCheck&gt;</code></summary>
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

```csharp
await client.Risk.CheckIpAsync(new RiskIpCheckRequest { Ip = "185.220.101.1" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RiskIpCheckRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.<a href="/src/Coss/Risk/RiskClient.cs">CheckPhoneAsync</a>(RiskPhoneCheckRequest { ... }) -> WithRawResponseTask&lt;RiskPhoneCheck&gt;</code></summary>
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

```csharp
await client.Risk.CheckPhoneAsync(new RiskPhoneCheckRequest { Phone = "+14155550123" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RiskPhoneCheckRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.<a href="/src/Coss/Risk/RiskClient.cs">ClassifyAsync</a>(RiskContentClassifyRequest { ... }) -> WithRawResponseTask&lt;RiskContentClassification&gt;</code></summary>
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

```csharp
await client.Risk.ClassifyAsync(
    new RiskContentClassifyRequest
    {
        Text = "Earn $5,000 a week from home! DM me on Telegram: t.me/fast-cash",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RiskContentClassifyRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.<a href="/src/Coss/Risk/RiskClient.cs">LimitAsync</a>(CheckRiskLimitRequest { ... }) -> WithRawResponseTask&lt;RiskLimit&gt;</code></summary>
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

```csharp
await client.Risk.LimitAsync(
    new CheckRiskLimitRequest
    {
        IdempotencyKey = "welcome-user-123",
        Bucket = "password_reset",
        Key = "ada@example.com",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CheckRiskLimitRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing Invoices
<details><summary><code>client.Billing.Invoices.<a href="/src/Coss/Billing/Invoices/InvoicesClient.cs">ListAsync</a>(ListInvoicesRequest { ... }) -> WithRawResponseTask&lt;InvoiceList&gt;</code></summary>
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

```csharp
await client.Billing.Invoices.ListAsync(new ListInvoicesRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListInvoicesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Billing.Invoices.<a href="/src/Coss/Billing/Invoices/InvoicesClient.cs">GetAsync</a>(GetInvoicesRequest { ... }) -> WithRawResponseTask&lt;Invoice&gt;</code></summary>
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

```csharp
await client.Billing.Invoices.GetAsync(
    new GetInvoicesRequest { Id = "inv_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetInvoicesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing Credits
<details><summary><code>client.Billing.Credits.<a href="/src/Coss/Billing/Credits/CreditsClient.cs">ListAsync</a>(ListCreditsRequest { ... }) -> WithRawResponseTask&lt;CreditList&gt;</code></summary>
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

```csharp
await client.Billing.Credits.ListAsync(new ListCreditsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListCreditsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Tracking
<details><summary><code>client.Domains.Tracking.<a href="/src/Coss/Domains/Tracking/TrackingClient.cs">CreateAsync</a>(CreateTrackingDomainRequest { ... }) -> WithRawResponseTask&lt;Domain&gt;</code></summary>
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

```csharp
await client.Domains.Tracking.CreateAsync(
    new CreateTrackingDomainRequest
    {
        Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Hostname = "links.acme.com",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateTrackingDomainRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Tracking.<a href="/src/Coss/Domains/Tracking/TrackingClient.cs">DeleteAsync</a>(DeleteTrackingRequest { ... }) -> WithRawResponseTask&lt;Domain&gt;</code></summary>
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

```csharp
await client.Domains.Tracking.DeleteAsync(
    new DeleteTrackingRequest { Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteTrackingRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Receiving
<details><summary><code>client.Domains.Receiving.<a href="/src/Coss/Domains/Receiving/ReceivingClient.cs">CreateAsync</a>(CreateReceivingDomainRequest { ... }) -> WithRawResponseTask&lt;Domain&gt;</code></summary>
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

```csharp
await client.Domains.Receiving.CreateAsync(
    new CreateReceivingDomainRequest
    {
        Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Hostname = "inbound.acme.com",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateReceivingDomainRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Receiving.<a href="/src/Coss/Domains/Receiving/ReceivingClient.cs">DeleteAsync</a>(DeleteReceivingRequest { ... }) -> WithRawResponseTask&lt;Domain&gt;</code></summary>
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

```csharp
await client.Domains.Receiving.DeleteAsync(
    new DeleteReceivingRequest { Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteReceivingRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Dmarc
<details><summary><code>client.Domains.Dmarc.<a href="/src/Coss/Domains/Dmarc/DmarcClient.cs">GetAsync</a>(GetDmarcRequest { ... }) -> WithRawResponseTask&lt;DomainDmarc&gt;</code></summary>
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

```csharp
await client.Domains.Dmarc.GetAsync(new GetDmarcRequest { Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetDmarcRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Dmarc Reports
<details><summary><code>client.Domains.Dmarc.Reports.<a href="/src/Coss/Domains/Dmarc/Reports/ReportsClient.cs">ListAsync</a>(ListReportsRequest { ... }) -> WithRawResponseTask&lt;DmarcReportList&gt;</code></summary>
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

```csharp
await client.Domains.Dmarc.Reports.ListAsync(
    new ListReportsRequest { Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListReportsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Domains.Dmarc.Reports.<a href="/src/Coss/Domains/Dmarc/Reports/ReportsClient.cs">GetAsync</a>(GetReportsRequest { ... }) -> WithRawResponseTask&lt;DmarcReport&gt;</code></summary>
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

```csharp
await client.Domains.Dmarc.Reports.GetAsync(
    new GetReportsRequest
    {
        Id = "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
        ReportId = "dmarcrep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetReportsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Templates
<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">ListAsync</a>(ListTemplatesRequest { ... }) -> WithRawResponseTask&lt;EmailTemplateList&gt;</code></summary>
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

```csharp
await client.Email.Templates.ListAsync(new Coss.Email.ListTemplatesRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListTemplatesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">CreateAsync</a>(CreateEmailTemplateRequest { ... }) -> WithRawResponseTask&lt;EmailTemplate&gt;</code></summary>
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

```csharp
await client.Email.Templates.CreateAsync(
    new CreateEmailTemplateRequest
    {
        Name = "Welcome",
        Alias = "welcome",
        DefaultLocale = "en",
        Variables = new List<TemplateVariableInput>()
        {
            new TemplateVariableInput
            {
                Name = "first_name",
                Type = TemplateVariableInputType.String,
                Required = true,
            },
        },
        SampleVariables = new Dictionary<string, object?>() { { "first_name", "Ada" } },
        Contents = new List<TemplateContentInput>()
        {
            new TemplateContentInput
            {
                Locale = "en",
                Subject = "Welcome, {{first_name}}",
                Html = "<p>Hi {{first_name}}, thanks for signing up!</p>",
            },
            new TemplateContentInput
            {
                Locale = "de",
                Subject = "Willkommen, {{first_name}}",
                Html = "<p>Hallo {{first_name}}, danke für deine Anmeldung!</p>",
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateEmailTemplateRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">GetAsync</a>(GetTemplatesRequest { ... }) -> WithRawResponseTask&lt;EmailTemplate&gt;</code></summary>
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

```csharp
await client.Email.Templates.GetAsync(
    new Coss.Email.GetTemplatesRequest { Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetTemplatesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">DeleteAsync</a>(DeleteTemplatesRequest { ... }) -> WithRawResponseTask&lt;DeletedEmailTemplate&gt;</code></summary>
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

```csharp
await client.Email.Templates.DeleteAsync(
    new DeleteTemplatesRequest { Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteTemplatesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">UpdateAsync</a>(UpdateEmailTemplateRequest { ... }) -> WithRawResponseTask&lt;EmailTemplate&gt;</code></summary>
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

```csharp
await client.Email.Templates.UpdateAsync(
    new UpdateEmailTemplateRequest
    {
        Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Name = "Welcome (new users)",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateEmailTemplateRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">GetDraftAsync</a>(GetDraftTemplatesRequest { ... }) -> WithRawResponseTask&lt;EmailTemplateVersion&gt;</code></summary>
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

```csharp
await client.Email.Templates.GetDraftAsync(
    new GetDraftTemplatesRequest { Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetDraftTemplatesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">UpdateDraftAsync</a>(UpdateEmailTemplateDraftRequest { ... }) -> WithRawResponseTask&lt;EmailTemplateVersion&gt;</code></summary>
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

```csharp
await client.Email.Templates.UpdateDraftAsync(
    new UpdateEmailTemplateDraftRequest
    {
        Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Revision = 3,
        DefaultLocale = "en",
        Variables = new List<TemplateVariableInput>()
        {
            new TemplateVariableInput
            {
                Name = "first_name",
                Type = TemplateVariableInputType.String,
                Required = true,
            },
        },
        SampleVariables = new Dictionary<string, object?>() { { "first_name", "Ada" } },
        Contents = new List<TemplateContentInput>()
        {
            new TemplateContentInput
            {
                Locale = "en",
                Subject = "Welcome, {{first_name}}",
                Html = "<p>Hi {{first_name}}, thanks for signing up!</p>",
            },
            new TemplateContentInput
            {
                Locale = "de",
                Subject = "Willkommen, {{first_name}}",
                Html = "<p>Hallo {{first_name}}, danke für deine Anmeldung!</p>",
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateEmailTemplateDraftRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">PublishAsync</a>(PublishEmailTemplateRequest { ... }) -> WithRawResponseTask&lt;EmailTemplateVersion&gt;</code></summary>
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

```csharp
await client.Email.Templates.PublishAsync(
    new PublishEmailTemplateRequest { Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz", Revision = 3 }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `PublishEmailTemplateRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.<a href="/src/Coss/Email/Templates/TemplatesClient.cs">RenderAsync</a>(RenderEmailTemplateRequest { ... }) -> WithRawResponseTask&lt;RenderedEmailTemplate&gt;</code></summary>
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

```csharp
await client.Email.Templates.RenderAsync(
    new RenderEmailTemplateRequest
    {
        Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Locale = "en",
        Variables = new Dictionary<string, object?>() { { "first_name", "Ada" } },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RenderEmailTemplateRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email DedicatedIps
<details><summary><code>client.Email.DedicatedIps.<a href="/src/Coss/Email/DedicatedIps/DedicatedIpsClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;DedicatedIpPool&gt;</code></summary>
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

```csharp
await client.Email.DedicatedIps.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Suppressions
<details><summary><code>client.Email.Suppressions.<a href="/src/Coss/Email/Suppressions/SuppressionsClient.cs">ListAsync</a>(ListSuppressionsRequest { ... }) -> WithRawResponseTask&lt;SuppressionList&gt;</code></summary>
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

```csharp
await client.Email.Suppressions.ListAsync(
    new Coss.Email.ListSuppressionsRequest { Subaccount = "user_8812" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.<a href="/src/Coss/Email/Suppressions/SuppressionsClient.cs">AddAsync</a>(CreateSuppressionRequest { ... }) -> WithRawResponseTask&lt;Suppression&gt;</code></summary>
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

```csharp
await client.Email.Suppressions.AddAsync(
    new CreateSuppressionRequest { Address = "user@example.com", Scope = "marketing" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSuppressionRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.<a href="/src/Coss/Email/Suppressions/SuppressionsClient.cs">CheckAsync</a>(CheckSuppressionsRequest { ... }) -> WithRawResponseTask&lt;SuppressionCheck&gt;</code></summary>
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

```csharp
await client.Email.Suppressions.CheckAsync(
    new Coss.Email.CheckSuppressionsRequest { Address = "user@example.com" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CheckSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.<a href="/src/Coss/Email/Suppressions/SuppressionsClient.cs">ImportAsync</a>(ImportSuppressionsRequest { ... }) -> WithRawResponseTask&lt;SuppressionImport&gt;</code></summary>
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

```csharp
await client.Email.Suppressions.ImportAsync(
    new ImportSuppressionsRequest
    {
        Suppressions = new List<ImportSuppressionsRequestSuppressionsItem>()
        {
            new ImportSuppressionsRequestSuppressionsItem { Address = "user@example.com" },
            new ImportSuppressionsRequestSuppressionsItem
            {
                Address = "other@example.com",
                Scope = "marketing",
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ImportSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.<a href="/src/Coss/Email/Suppressions/SuppressionsClient.cs">ExportAsync</a>(ExportSuppressionsRequest { ... }) -> WithRawResponseTask&lt;string&gt;</code></summary>
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

```csharp
await client.Email.Suppressions.ExportAsync(new ExportSuppressionsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ExportSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.<a href="/src/Coss/Email/Suppressions/SuppressionsClient.cs">GetAsync</a>(GetSuppressionsRequest { ... }) -> WithRawResponseTask&lt;Suppression&gt;</code></summary>
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

```csharp
await client.Email.Suppressions.GetAsync(
    new Coss.Email.GetSuppressionsRequest { Id = "sup_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Suppressions.<a href="/src/Coss/Email/Suppressions/SuppressionsClient.cs">RemoveAsync</a>(RemoveSuppressionsRequest { ... }) -> WithRawResponseTask&lt;DeletedSuppression&gt;</code></summary>
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

```csharp
await client.Email.Suppressions.RemoveAsync(
    new Coss.Email.RemoveSuppressionsRequest { Id = "sup_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Subaccounts
<details><summary><code>client.Email.Subaccounts.<a href="/src/Coss/Email/Subaccounts/SubaccountsClient.cs">ListAsync</a>(ListSubaccountsRequest { ... }) -> WithRawResponseTask&lt;SubaccountList&gt;</code></summary>
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

```csharp
await client.Email.Subaccounts.ListAsync(
    new ListSubaccountsRequest { After = "sub_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListSubaccountsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.<a href="/src/Coss/Email/Subaccounts/SubaccountsClient.cs">CreateAsync</a>(CreateSubaccountRequest { ... }) -> WithRawResponseTask&lt;Subaccount&gt;</code></summary>
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

```csharp
await client.Email.Subaccounts.CreateAsync(
    new CreateSubaccountRequest
    {
        Name = "Acme Bakery",
        Uid = "user_8812",
        Quotas = new CreateSubaccountRequestQuotas { RecipientsPerDay = 5000 },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSubaccountRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.<a href="/src/Coss/Email/Subaccounts/SubaccountsClient.cs">GetAsync</a>(GetSubaccountsRequest { ... }) -> WithRawResponseTask&lt;Subaccount&gt;</code></summary>
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

```csharp
await client.Email.Subaccounts.GetAsync(new GetSubaccountsRequest { Subaccount = "user_8812" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetSubaccountsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.<a href="/src/Coss/Email/Subaccounts/SubaccountsClient.cs">DeleteAsync</a>(DeleteSubaccountsRequest { ... }) -> WithRawResponseTask&lt;Subaccount&gt;</code></summary>
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

```csharp
await client.Email.Subaccounts.DeleteAsync(
    new DeleteSubaccountsRequest { Subaccount = "user_8812" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteSubaccountsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.<a href="/src/Coss/Email/Subaccounts/SubaccountsClient.cs">UpdateAsync</a>(UpdateSubaccountRequest { ... }) -> WithRawResponseTask&lt;Subaccount&gt;</code></summary>
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

```csharp
await client.Email.Subaccounts.UpdateAsync(
    new UpdateSubaccountRequest
    {
        Subaccount = "user_8812",
        Status = UpdateSubaccountRequestStatus.Disabled,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateSubaccountRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.<a href="/src/Coss/Email/Subaccounts/SubaccountsClient.cs">ReinstateAsync</a>(ReinstateSubaccountsRequest { ... }) -> WithRawResponseTask&lt;Subaccount&gt;</code></summary>
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

```csharp
await client.Email.Subaccounts.ReinstateAsync(
    new ReinstateSubaccountsRequest { Subaccount = "user_8812" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ReinstateSubaccountsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Subaccounts.<a href="/src/Coss/Email/Subaccounts/SubaccountsClient.cs">StatsAsync</a>(StatsSubaccountsRequest { ... }) -> WithRawResponseTask&lt;SubaccountStats&gt;</code></summary>
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

```csharp
await client.Email.Subaccounts.StatsAsync(
    new StatsSubaccountsRequest
    {
        Subaccount = "user_8812",
        From = new DateOnly(2026, 10, 1),
        To = new DateOnly(2026, 10, 15),
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `StatsSubaccountsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Tracking
<details><summary><code>client.Email.Tracking.<a href="/src/Coss/Email/Tracking/TrackingClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;TrackingSettings&gt;</code></summary>
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

```csharp
await client.Email.Tracking.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Tracking.<a href="/src/Coss/Email/Tracking/TrackingClient.cs">RemoveDefaultAsync</a>() -> WithRawResponseTask&lt;DeletedTrackingRule&gt;</code></summary>
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

```csharp
await client.Email.Tracking.RemoveDefaultAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Tracking.<a href="/src/Coss/Email/Tracking/TrackingClient.cs">UpdateDefaultAsync</a>(UpdateTrackingRuleRequest { ... }) -> WithRawResponseTask&lt;TrackingRule&gt;</code></summary>
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

```csharp
await client.Email.Tracking.UpdateDefaultAsync(
    new UpdateTrackingRuleRequest { Opens = false, Clicks = false }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateTrackingRuleRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Tracking.<a href="/src/Coss/Email/Tracking/TrackingClient.cs">RemoveCategoryAsync</a>(RemoveCategoryTrackingRequest { ... }) -> WithRawResponseTask&lt;DeletedTrackingRule&gt;</code></summary>
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

```csharp
await client.Email.Tracking.RemoveCategoryAsync(
    new RemoveCategoryTrackingRequest { Category = "password-reset" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveCategoryTrackingRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Tracking.<a href="/src/Coss/Email/Tracking/TrackingClient.cs">UpdateCategoryAsync</a>(UpdateCategoryTrackingRequest { ... }) -> WithRawResponseTask&lt;TrackingRule&gt;</code></summary>
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

```csharp
await client.Email.Tracking.UpdateCategoryAsync(
    new UpdateCategoryTrackingRequest
    {
        Category = "password-reset",
        Body = new UpdateTrackingRuleRequest { Opens = false, Clicks = false },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateCategoryTrackingRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Storage
<details><summary><code>client.Email.Storage.<a href="/src/Coss/Email/Storage/StorageClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;StorageSettings&gt;</code></summary>
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

```csharp
await client.Email.Storage.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Storage.<a href="/src/Coss/Email/Storage/StorageClient.cs">UpdateAsync</a>(UpdateStorageSettingsRequest { ... }) -> WithRawResponseTask&lt;StorageSettings&gt;</code></summary>
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

```csharp
await client.Email.Storage.UpdateAsync(
    new UpdateStorageSettingsRequest
    {
        ContentStorage = UpdateStorageSettingsRequestContentStorage.Discard,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateStorageSettingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Contacts
<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">ListAsync</a>(ListContactsRequest { ... }) -> WithRawResponseTask&lt;ContactList&gt;</code></summary>
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

```csharp
await client.Email.Contacts.ListAsync(new ListContactsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListContactsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">UpsertAsync</a>(UpsertContactRequest { ... }) -> WithRawResponseTask&lt;Contact&gt;</code></summary>
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

```csharp
await client.Email.Contacts.UpsertAsync(
    new UpsertContactRequest
    {
        Email = "ada@example.com",
        FirstName = "Ada",
        Properties = new Dictionary<string, OneOf<string, double, bool>?>() { { "plan", "pro" } },
        Topics = new List<UpsertContactRequestTopicsItem>()
        {
            new UpsertContactRequestTopicsItem
            {
                Topic = "newsletter",
                Status = UpsertContactRequestTopicsItemStatus.OptedIn,
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpsertContactRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">ResendConfirmationAsync</a>(ResendConfirmationContactsRequest { ... }) -> WithRawResponseTask&lt;ContactConfirmation&gt;</code></summary>
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

```csharp
await client.Email.Contacts.ResendConfirmationAsync(
    new ResendConfirmationContactsRequest { Id = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ResendConfirmationContactsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">CreatePreferenceLinksAsync</a>(CreatePreferenceLinksRequest { ... }) -> WithRawResponseTask&lt;PreferenceLinks&gt;</code></summary>
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

```csharp
await client.Email.Contacts.CreatePreferenceLinksAsync(
    new CreatePreferenceLinksRequest
    {
        Id = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Topic = "newsletter",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreatePreferenceLinksRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">ImportAsync</a>(ImportContactsRequest { ... }) -> WithRawResponseTask&lt;ContactImport&gt;</code></summary>
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

```csharp
await client.Email.Contacts.ImportAsync(
    new ImportContactsRequest
    {
        Contacts = new List<ImportContactsRequestContactsItem>()
        {
            new ImportContactsRequestContactsItem
            {
                Email = "ada@example.com",
                FirstName = "Ada",
                Properties = new Dictionary<string, OneOf<string, double, bool>?>()
                {
                    { "plan", "pro" },
                },
            },
            new ImportContactsRequestContactsItem
            {
                Email = "grace@example.com",
                Status = "unsubscribed",
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ImportContactsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">ExportAsync</a>(ExportContactsRequest { ... }) -> WithRawResponseTask&lt;string&gt;</code></summary>
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

```csharp
await client.Email.Contacts.ExportAsync(new ExportContactsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ExportContactsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">GetAsync</a>(GetContactsRequest { ... }) -> WithRawResponseTask&lt;Contact&gt;</code></summary>
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

```csharp
await client.Email.Contacts.GetAsync(
    new GetContactsRequest { Id = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetContactsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">RemoveAsync</a>(RemoveContactsRequest { ... }) -> WithRawResponseTask&lt;DeletedContact&gt;</code></summary>
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

```csharp
await client.Email.Contacts.RemoveAsync(
    new RemoveContactsRequest { Id = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveContactsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">UpdateAsync</a>(UpdateContactRequest { ... }) -> WithRawResponseTask&lt;Contact&gt;</code></summary>
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

```csharp
await client.Email.Contacts.UpdateAsync(
    new UpdateContactRequest
    {
        Id = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
        LastName = "Byron",
        Properties = new Dictionary<string, OneOf<string, double, bool>?>() { { "seats", null } },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateContactRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">GetTopicsAsync</a>(GetTopicsContactsRequest { ... }) -> WithRawResponseTask&lt;ContactTopics&gt;</code></summary>
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

```csharp
await client.Email.Contacts.GetTopicsAsync(
    new GetTopicsContactsRequest { Id = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetTopicsContactsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.<a href="/src/Coss/Email/Contacts/ContactsClient.cs">UpdateTopicsAsync</a>(UpdateContactTopicsRequest { ... }) -> WithRawResponseTask&lt;ContactTopics&gt;</code></summary>
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

```csharp
await client.Email.Contacts.UpdateTopicsAsync(
    new UpdateContactTopicsRequest
    {
        Id = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Topics = new List<UpdateContactTopicsRequestTopicsItem>()
        {
            new UpdateContactTopicsRequestTopicsItem
            {
                Topic = "product",
                Status = UpdateContactTopicsRequestTopicsItemStatus.OptedOut,
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateContactTopicsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Broadcasts
<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">ListAsync</a>(ListBroadcastsRequest { ... }) -> WithRawResponseTask&lt;BroadcastList&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.ListAsync(new ListBroadcastsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListBroadcastsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">CreateAsync</a>(CreateBroadcastRequest { ... }) -> WithRawResponseTask&lt;Broadcast&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.CreateAsync(
    new CreateBroadcastRequest
    {
        IdempotencyKey = "welcome-user-123",
        Name = "October newsletter",
        SegmentId = "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Topic = "newsletter",
        From = "Acme <news@acme.com>",
        Subject = "What's new, {{{contact.first_name|there}}}",
        Html =
            "<p>Hi {{{contact.first_name|there}}},</p><p>…</p><p><a href=\"{{{unsubscribe_url}}}\">Unsubscribe</a></p>",
        ScheduledAt = new DateTime(2026, 10, 20, 09, 00, 00, 000),
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateBroadcastRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">GetAsync</a>(GetBroadcastsRequest { ... }) -> WithRawResponseTask&lt;Broadcast&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.GetAsync(
    new GetBroadcastsRequest { Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetBroadcastsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">RemoveAsync</a>(RemoveBroadcastsRequest { ... }) -> WithRawResponseTask&lt;DeletedBroadcast&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.RemoveAsync(
    new RemoveBroadcastsRequest { Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveBroadcastsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">UpdateAsync</a>(UpdateBroadcastRequest { ... }) -> WithRawResponseTask&lt;Broadcast&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.UpdateAsync(
    new UpdateBroadcastRequest
    {
        Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Subject = "Our October news",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateBroadcastRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">SendAsync</a>(SendBroadcastRequest { ... }) -> WithRawResponseTask&lt;Broadcast&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.SendAsync(
    new SendBroadcastRequest
    {
        Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
        ScheduledAt = new DateTime(2026, 10, 20, 09, 00, 00, 000),
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SendBroadcastRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">CancelAsync</a>(CancelBroadcastsRequest { ... }) -> WithRawResponseTask&lt;Broadcast&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.CancelAsync(
    new CancelBroadcastsRequest { Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CancelBroadcastsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">PauseAsync</a>(PauseBroadcastsRequest { ... }) -> WithRawResponseTask&lt;Broadcast&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.PauseAsync(
    new PauseBroadcastsRequest { Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `PauseBroadcastsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">ResumeAsync</a>(ResumeBroadcastsRequest { ... }) -> WithRawResponseTask&lt;Broadcast&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.ResumeAsync(
    new ResumeBroadcastsRequest { Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ResumeBroadcastsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">TestAsync</a>(TestBroadcastRequest { ... }) -> WithRawResponseTask&lt;BroadcastTest&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.TestAsync(
    new TestBroadcastRequest
    {
        Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
        To = new List<string>() { "me@acme.com" },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `TestBroadcastRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Broadcasts.<a href="/src/Coss/Email/Broadcasts/BroadcastsClient.cs">ListEmailsAsync</a>(ListEmailsBroadcastsRequest { ... }) -> WithRawResponseTask&lt;BroadcastEmailList&gt;</code></summary>
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

```csharp
await client.Email.Broadcasts.ListEmailsAsync(
    new ListEmailsBroadcastsRequest { Id = "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListEmailsBroadcastsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Audiences
<details><summary><code>client.Email.Audiences.<a href="/src/Coss/Email/Audiences/AudiencesClient.cs">ListAsync</a>(ListAudiencesRequest { ... }) -> WithRawResponseTask&lt;AudienceList&gt;</code></summary>
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

```csharp
await client.Email.Audiences.ListAsync(new ListAudiencesRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListAudiencesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.<a href="/src/Coss/Email/Audiences/AudiencesClient.cs">CreateAsync</a>(CreateAudienceRequest { ... }) -> WithRawResponseTask&lt;Audience&gt;</code></summary>
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

```csharp
await client.Email.Audiences.CreateAsync(new CreateAudienceRequest { Name = "Beta testers" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateAudienceRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.<a href="/src/Coss/Email/Audiences/AudiencesClient.cs">GetAsync</a>(GetAudiencesRequest { ... }) -> WithRawResponseTask&lt;Audience&gt;</code></summary>
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

```csharp
await client.Email.Audiences.GetAsync(
    new GetAudiencesRequest { Id = "aud_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetAudiencesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.<a href="/src/Coss/Email/Audiences/AudiencesClient.cs">RemoveAsync</a>(RemoveAudiencesRequest { ... }) -> WithRawResponseTask&lt;DeletedAudience&gt;</code></summary>
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

```csharp
await client.Email.Audiences.RemoveAsync(
    new RemoveAudiencesRequest { Id = "aud_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveAudiencesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.<a href="/src/Coss/Email/Audiences/AudiencesClient.cs">UpdateAsync</a>(UpdateAudienceRequest { ... }) -> WithRawResponseTask&lt;Audience&gt;</code></summary>
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

```csharp
await client.Email.Audiences.UpdateAsync(
    new UpdateAudienceRequest { Id = "aud_01k7c8m4q2f3e9v6t5r1n0p8yz", Name = "Early access" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateAudienceRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.<a href="/src/Coss/Email/Audiences/AudiencesClient.cs">ListContactsAsync</a>(ListContactsAudiencesRequest { ... }) -> WithRawResponseTask&lt;ContactList&gt;</code></summary>
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

```csharp
await client.Email.Audiences.ListContactsAsync(
    new ListContactsAudiencesRequest { Id = "aud_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListContactsAudiencesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.<a href="/src/Coss/Email/Audiences/AudiencesClient.cs">AddContactsAsync</a>(AddAudienceContactsRequest { ... }) -> WithRawResponseTask&lt;AudienceContactsAdded&gt;</code></summary>
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

```csharp
await client.Email.Audiences.AddContactsAsync(
    new AddAudienceContactsRequest
    {
        Id = "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Contacts = new List<string>() { "contact_01k7c8m4q2f3e9v6t5r1n0p8yz", "grace@example.com" },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `AddAudienceContactsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Audiences.<a href="/src/Coss/Email/Audiences/AudiencesClient.cs">RemoveContactAsync</a>(RemoveContactAudiencesRequest { ... }) -> WithRawResponseTask&lt;RemoveContactAudiencesResponse&gt;</code></summary>
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

```csharp
await client.Email.Audiences.RemoveContactAsync(
    new RemoveContactAudiencesRequest
    {
        Id = "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
        ContactId = "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveContactAudiencesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Segments
<details><summary><code>client.Email.Segments.<a href="/src/Coss/Email/Segments/SegmentsClient.cs">ListAsync</a>(ListSegmentsRequest { ... }) -> WithRawResponseTask&lt;SegmentList&gt;</code></summary>
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

```csharp
await client.Email.Segments.ListAsync(new ListSegmentsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListSegmentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.<a href="/src/Coss/Email/Segments/SegmentsClient.cs">CreateAsync</a>(CreateSegmentRequest { ... }) -> WithRawResponseTask&lt;Segment&gt;</code></summary>
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

```csharp
await client.Email.Segments.CreateAsync(
    new CreateSegmentRequest
    {
        Name = "Pro customers",
        Filter = new SegmentFilter
        {
            Version = 1,
            Match = SegmentFilterMatch.All,
            Conditions = new List<
                OneOf<
                    SegmentFilterConditionsItemKey,
                    SegmentFilterConditionsItemOne,
                    SegmentFilterConditionsItemAudienceId,
                    SegmentFilterConditionsItemTopic,
                    SegmentFilterConditionsItemField,
                    SegmentFilterConditionsItemConditions
                >
            >()
            {
                new SegmentFilterConditionsItemKey
                {
                    Field = SegmentFilterConditionsItemKeyField.Property,
                    Key = "plan",
                    Op = SegmentFilterConditionsItemKeyOp.Eq,
                    Value = "pro",
                },
                new SegmentFilterConditionsItemConditions
                {
                    Match = SegmentFilterConditionsItemConditionsMatch.Any,
                    Conditions = new List<SegmentFilterConditionsItemConditionsConditionsItem>()
                    {
                        new SegmentFilterConditionsItemConditionsConditionsItem(
                            new Coss.SegmentFilterConditionsItemConditionsConditionsItem.Email(
                                new SegmentFilterConditionsItemConditionsConditionsItemEmail
                                {
                                    Op =
                                        SegmentFilterConditionsItemConditionsConditionsItemEmailOp.EndsWith,
                                    Value = "@acme.com",
                                }
                            )
                        ),
                        new SegmentFilterConditionsItemConditionsConditionsItem(
                            new SegmentFilterConditionsItemConditionsConditionsItem.Audience(
                                new SegmentFilterConditionsItemConditionsConditionsItemAudience
                                {
                                    Op =
                                        SegmentFilterConditionsItemConditionsConditionsItemAudienceOp.In,
                                    AudienceId = "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
                                }
                            )
                        ),
                    },
                },
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSegmentRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.<a href="/src/Coss/Email/Segments/SegmentsClient.cs">GetAsync</a>(GetSegmentsRequest { ... }) -> WithRawResponseTask&lt;Segment&gt;</code></summary>
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

```csharp
await client.Email.Segments.GetAsync(
    new GetSegmentsRequest { Id = "seg_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetSegmentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.<a href="/src/Coss/Email/Segments/SegmentsClient.cs">RemoveAsync</a>(RemoveSegmentsRequest { ... }) -> WithRawResponseTask&lt;DeletedSegment&gt;</code></summary>
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

```csharp
await client.Email.Segments.RemoveAsync(
    new RemoveSegmentsRequest { Id = "seg_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveSegmentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.<a href="/src/Coss/Email/Segments/SegmentsClient.cs">UpdateAsync</a>(UpdateSegmentRequest { ... }) -> WithRawResponseTask&lt;Segment&gt;</code></summary>
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

```csharp
await client.Email.Segments.UpdateAsync(
    new UpdateSegmentRequest
    {
        Id = "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Name = "Pro and Scale customers",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateSegmentRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Segments.<a href="/src/Coss/Email/Segments/SegmentsClient.cs">ListContactsAsync</a>(ListContactsSegmentsRequest { ... }) -> WithRawResponseTask&lt;ContactList&gt;</code></summary>
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

```csharp
await client.Email.Segments.ListContactsAsync(
    new ListContactsSegmentsRequest { Id = "seg_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListContactsSegmentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Topics
<details><summary><code>client.Email.Topics.<a href="/src/Coss/Email/Topics/TopicsClient.cs">ListAsync</a>(ListTopicsRequest { ... }) -> WithRawResponseTask&lt;TopicList&gt;</code></summary>
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

```csharp
await client.Email.Topics.ListAsync(new ListTopicsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListTopicsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Topics.<a href="/src/Coss/Email/Topics/TopicsClient.cs">CreateAsync</a>(CreateTopicRequest { ... }) -> WithRawResponseTask&lt;Topic&gt;</code></summary>
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

```csharp
await client.Email.Topics.CreateAsync(
    new CreateTopicRequest
    {
        Key = "newsletter",
        Name = "Newsletter",
        DefaultSubscription = CreateTopicRequestDefaultSubscription.OptIn,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateTopicRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Topics.<a href="/src/Coss/Email/Topics/TopicsClient.cs">GetAsync</a>(GetTopicsRequest { ... }) -> WithRawResponseTask&lt;Topic&gt;</code></summary>
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

```csharp
await client.Email.Topics.GetAsync(
    new GetTopicsRequest { Id = "topic_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetTopicsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Topics.<a href="/src/Coss/Email/Topics/TopicsClient.cs">RemoveAsync</a>(RemoveTopicsRequest { ... }) -> WithRawResponseTask&lt;DeletedTopic&gt;</code></summary>
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

```csharp
await client.Email.Topics.RemoveAsync(
    new RemoveTopicsRequest { Id = "topic_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveTopicsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Topics.<a href="/src/Coss/Email/Topics/TopicsClient.cs">UpdateAsync</a>(UpdateTopicRequest { ... }) -> WithRawResponseTask&lt;Topic&gt;</code></summary>
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

```csharp
await client.Email.Topics.UpdateAsync(
    new UpdateTopicRequest
    {
        Id = "topic_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Visibility = UpdateTopicRequestVisibility.Private,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateTopicRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email MarketingSettings
<details><summary><code>client.Email.MarketingSettings.<a href="/src/Coss/Email/MarketingSettings/MarketingSettingsClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;MarketingSettings&gt;</code></summary>
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

```csharp
await client.Email.MarketingSettings.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.MarketingSettings.<a href="/src/Coss/Email/MarketingSettings/MarketingSettingsClient.cs">UpdateAsync</a>(UpdateMarketingSettingsRequest { ... }) -> WithRawResponseTask&lt;MarketingSettings&gt;</code></summary>
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

```csharp
await client.Email.MarketingSettings.UpdateAsync(
    new UpdateMarketingSettingsRequest
    {
        MailingAddress = "Acme Inc., 548 Market St, San Francisco, CA 94104, USA",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateMarketingSettingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Received
<details><summary><code>client.Email.Received.<a href="/src/Coss/Email/Received/ReceivedClient.cs">ListAsync</a>(ListReceivedRequest { ... }) -> WithRawResponseTask&lt;ReceivedEmailList&gt;</code></summary>
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

```csharp
await client.Email.Received.ListAsync(new Coss.Email.ListReceivedRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListReceivedRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.<a href="/src/Coss/Email/Received/ReceivedClient.cs">AddressAsync</a>() -> WithRawResponseTask&lt;InboundAddress&gt;</code></summary>
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

```csharp
await client.Email.Received.AddressAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.<a href="/src/Coss/Email/Received/ReceivedClient.cs">GetAsync</a>(GetReceivedRequest { ... }) -> WithRawResponseTask&lt;ReceivedEmail&gt;</code></summary>
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

```csharp
await client.Email.Received.GetAsync(
    new Coss.Email.GetReceivedRequest { Id = "rcvd_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetReceivedRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.<a href="/src/Coss/Email/Received/ReceivedClient.cs">DeleteAsync</a>(DeleteReceivedRequest { ... }) -> WithRawResponseTask&lt;DeletedReceivedEmail&gt;</code></summary>
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

```csharp
await client.Email.Received.DeleteAsync(
    new DeleteReceivedRequest { Id = "rcvd_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteReceivedRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.<a href="/src/Coss/Email/Received/ReceivedClient.cs">GetRawAsync</a>(GetRawReceivedRequest { ... }) -> WithRawResponseTask&lt;Stream&gt;</code></summary>
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

```csharp
await client.Email.Received.GetRawAsync(new GetRawReceivedRequest { Id = "id" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetRawReceivedRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Received.<a href="/src/Coss/Email/Received/ReceivedClient.cs">GetAttachmentAsync</a>(GetAttachmentReceivedRequest { ... }) -> WithRawResponseTask&lt;Stream&gt;</code></summary>
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

```csharp
await client.Email.Received.GetAttachmentAsync(
    new GetAttachmentReceivedRequest { Id = "id", AttachmentId = "attachment_id" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetAttachmentReceivedRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Contacts Properties
<details><summary><code>client.Email.Contacts.Properties.<a href="/src/Coss/Email/Contacts/Properties/PropertiesClient.cs">ListAsync</a>() -> WithRawResponseTask&lt;ContactPropertyList&gt;</code></summary>
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

```csharp
await client.Email.Contacts.Properties.ListAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Properties.<a href="/src/Coss/Email/Contacts/Properties/PropertiesClient.cs">CreateAsync</a>(CreateContactPropertyRequest { ... }) -> WithRawResponseTask&lt;ContactProperty&gt;</code></summary>
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

```csharp
await client.Email.Contacts.Properties.CreateAsync(
    new CreateContactPropertyRequest
    {
        Key = "plan",
        Type = CreateContactPropertyRequestType.String,
        Fallback = "free",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateContactPropertyRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Properties.<a href="/src/Coss/Email/Contacts/Properties/PropertiesClient.cs">GetAsync</a>(GetPropertiesRequest { ... }) -> WithRawResponseTask&lt;ContactProperty&gt;</code></summary>
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

```csharp
await client.Email.Contacts.Properties.GetAsync(
    new GetPropertiesRequest { Id = "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetPropertiesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Properties.<a href="/src/Coss/Email/Contacts/Properties/PropertiesClient.cs">RemoveAsync</a>(RemovePropertiesRequest { ... }) -> WithRawResponseTask&lt;DeletedContactProperty&gt;</code></summary>
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

```csharp
await client.Email.Contacts.Properties.RemoveAsync(
    new RemovePropertiesRequest { Id = "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemovePropertiesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Contacts.Properties.<a href="/src/Coss/Email/Contacts/Properties/PropertiesClient.cs">UpdateAsync</a>(UpdateContactPropertyRequest { ... }) -> WithRawResponseTask&lt;ContactProperty&gt;</code></summary>
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

```csharp
await client.Email.Contacts.Properties.UpdateAsync(
    new UpdateContactPropertyRequest
    {
        Id = "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Fallback = "starter",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateContactPropertyRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Templates Versions
<details><summary><code>client.Email.Templates.Versions.<a href="/src/Coss/Email/Templates/Versions/VersionsClient.cs">ListAsync</a>(ListVersionsRequest { ... }) -> WithRawResponseTask&lt;EmailTemplateVersionList&gt;</code></summary>
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

```csharp
await client.Email.Templates.Versions.ListAsync(
    new ListVersionsRequest { Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListVersionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Versions.<a href="/src/Coss/Email/Templates/Versions/VersionsClient.cs">GetAsync</a>(GetVersionsRequest { ... }) -> WithRawResponseTask&lt;EmailTemplateVersion&gt;</code></summary>
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

```csharp
await client.Email.Templates.Versions.GetAsync(
    new GetVersionsRequest { Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz", Version = 1 }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetVersionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Email.Templates.Versions.<a href="/src/Coss/Email/Templates/Versions/VersionsClient.cs">RestoreAsync</a>(RestoreVersionsRequest { ... }) -> WithRawResponseTask&lt;EmailTemplateVersion&gt;</code></summary>
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

```csharp
await client.Email.Templates.Versions.RestoreAsync(
    new RestoreVersionsRequest { Id = "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz", Version = 1 }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RestoreVersionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Forms Submissions
<details><summary><code>client.Forms.Submissions.<a href="/src/Coss/Forms/Submissions/SubmissionsClient.cs">ListAsync</a>(ListSubmissionsRequest { ... }) -> WithRawResponseTask&lt;FormSubmissionList&gt;</code></summary>
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

```csharp
await client.Forms.Submissions.ListAsync(
    new ListSubmissionsRequest { Id = "form_01kd2m8n3p4q5r6s7t8v9w0x1y" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListSubmissionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Submissions.<a href="/src/Coss/Forms/Submissions/SubmissionsClient.cs">GetAsync</a>(GetSubmissionsRequest { ... }) -> WithRawResponseTask&lt;FormSubmission&gt;</code></summary>
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

```csharp
await client.Forms.Submissions.GetAsync(
    new GetSubmissionsRequest
    {
        Id = "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
        SubmissionId = "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetSubmissionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Submissions.<a href="/src/Coss/Forms/Submissions/SubmissionsClient.cs">RemoveAsync</a>(RemoveSubmissionsRequest { ... }) -> WithRawResponseTask&lt;DeletedFormSubmission&gt;</code></summary>
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

```csharp
await client.Forms.Submissions.RemoveAsync(
    new RemoveSubmissionsRequest
    {
        Id = "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
        SubmissionId = "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveSubmissionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Submissions.<a href="/src/Coss/Forms/Submissions/SubmissionsClient.cs">ReleaseAsync</a>(ReleaseSubmissionsRequest { ... }) -> WithRawResponseTask&lt;FormSubmission&gt;</code></summary>
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

```csharp
await client.Forms.Submissions.ReleaseAsync(
    new ReleaseSubmissionsRequest
    {
        Id = "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
        SubmissionId = "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ReleaseSubmissionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Forms.Submissions.<a href="/src/Coss/Forms/Submissions/SubmissionsClient.cs">FileAsync</a>(FileSubmissionsRequest { ... }) -> WithRawResponseTask&lt;Stream&gt;</code></summary>
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

```csharp
await client.Forms.Submissions.FileAsync(
    new FileSubmissionsRequest
    {
        Id = "id",
        SubmissionId = "submission_id",
        FileId = "file_id",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `FileSubmissionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks EventTypes
<details><summary><code>client.Hooks.EventTypes.<a href="/src/Coss/Hooks/EventTypes/EventTypesClient.cs">ListAsync</a>(ListEventTypesRequest { ... }) -> WithRawResponseTask&lt;HookEventTypeList&gt;</code></summary>
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

```csharp
await client.Hooks.EventTypes.ListAsync(new Coss.Hooks.ListEventTypesRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListEventTypesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.EventTypes.<a href="/src/Coss/Hooks/EventTypes/EventTypesClient.cs">CreateAsync</a>(CreateHookEventTypeRequest { ... }) -> WithRawResponseTask&lt;HookEventType&gt;</code></summary>
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

```csharp
await client.Hooks.EventTypes.CreateAsync(
    new CreateHookEventTypeRequest
    {
        Name = "invoice.paid",
        Description = "An invoice was paid in full.",
        Examples = new List<Dictionary<string, object?>>()
        {
            new Dictionary<string, object?>()
            {
                { "invoice_id", "in_1042" },
                { "amount", 4200 },
                { "currency", "usd" },
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateHookEventTypeRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.EventTypes.<a href="/src/Coss/Hooks/EventTypes/EventTypesClient.cs">GetAsync</a>(GetEventTypesRequest { ... }) -> WithRawResponseTask&lt;HookEventType&gt;</code></summary>
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

```csharp
await client.Hooks.EventTypes.GetAsync(
    new Coss.Hooks.GetEventTypesRequest { Name = "invoice.paid" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetEventTypesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.EventTypes.<a href="/src/Coss/Hooks/EventTypes/EventTypesClient.cs">ArchiveAsync</a>(ArchiveEventTypesRequest { ... }) -> WithRawResponseTask&lt;HookEventType&gt;</code></summary>
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

```csharp
await client.Hooks.EventTypes.ArchiveAsync(new ArchiveEventTypesRequest { Name = "invoice.paid" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ArchiveEventTypesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.EventTypes.<a href="/src/Coss/Hooks/EventTypes/EventTypesClient.cs">UpdateAsync</a>(UpdateHookEventTypeRequest { ... }) -> WithRawResponseTask&lt;HookEventType&gt;</code></summary>
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

```csharp
await client.Hooks.EventTypes.UpdateAsync(
    new UpdateHookEventTypeRequest { Name = "invoice.paid", Archived = false }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateHookEventTypeRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Applications
<details><summary><code>client.Hooks.Applications.<a href="/src/Coss/Hooks/Applications/ApplicationsClient.cs">ListAsync</a>(ListApplicationsRequest { ... }) -> WithRawResponseTask&lt;HookApplicationList&gt;</code></summary>
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

```csharp
await client.Hooks.Applications.ListAsync(new ListApplicationsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListApplicationsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Applications.<a href="/src/Coss/Hooks/Applications/ApplicationsClient.cs">CreateAsync</a>(CreateHookApplicationRequest { ... }) -> WithRawResponseTask&lt;HookApplication&gt;</code></summary>
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

```csharp
await client.Hooks.Applications.CreateAsync(
    new CreateHookApplicationRequest
    {
        Name = "Acme Corp",
        Uid = "customer_8812",
        Metadata = new Dictionary<string, string>() { { "plan", "pro" } },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateHookApplicationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Applications.<a href="/src/Coss/Hooks/Applications/ApplicationsClient.cs">GetAsync</a>(GetApplicationsRequest { ... }) -> WithRawResponseTask&lt;HookApplication&gt;</code></summary>
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

```csharp
await client.Hooks.Applications.GetAsync(
    new GetApplicationsRequest { Application = "customer_8812" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetApplicationsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Applications.<a href="/src/Coss/Hooks/Applications/ApplicationsClient.cs">DeleteAsync</a>(DeleteApplicationsRequest { ... }) -> WithRawResponseTask&lt;DeletedHookApplication&gt;</code></summary>
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

```csharp
await client.Hooks.Applications.DeleteAsync(
    new DeleteApplicationsRequest { Application = "customer_8812" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteApplicationsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Applications.<a href="/src/Coss/Hooks/Applications/ApplicationsClient.cs">UpdateAsync</a>(UpdateHookApplicationRequest { ... }) -> WithRawResponseTask&lt;HookApplication&gt;</code></summary>
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

```csharp
await client.Hooks.Applications.UpdateAsync(
    new UpdateHookApplicationRequest { Application = "customer_8812", Name = "Acme Corporation" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateHookApplicationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Endpoints
<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">ListAsync</a>(ListEndpointsRequest { ... }) -> WithRawResponseTask&lt;HookEndpointList&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.ListAsync(new ListEndpointsRequest { Application = "customer_8812" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListEndpointsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">CreateAsync</a>(CreateHookEndpointRequest { ... }) -> WithRawResponseTask&lt;HookEndpointWithSecret&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.CreateAsync(
    new CreateHookEndpointRequest
    {
        Application = "customer_8812",
        Url = "https://example.com/webhooks",
        FilterTypes = new List<string>() { "invoice.paid" },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateHookEndpointRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">GetAsync</a>(GetEndpointsRequest { ... }) -> WithRawResponseTask&lt;HookEndpoint&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.GetAsync(
    new GetEndpointsRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetEndpointsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">DeleteAsync</a>(DeleteEndpointsRequest { ... }) -> WithRawResponseTask&lt;DeletedHookEndpoint&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.DeleteAsync(
    new DeleteEndpointsRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteEndpointsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">UpdateAsync</a>(UpdateHookEndpointRequest { ... }) -> WithRawResponseTask&lt;HookEndpoint&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.UpdateAsync(
    new UpdateHookEndpointRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Enabled = false,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateHookEndpointRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">GetSecretAsync</a>(GetSecretEndpointsRequest { ... }) -> WithRawResponseTask&lt;HookEndpointSecret&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.GetSecretAsync(
    new GetSecretEndpointsRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetSecretEndpointsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">RollSecretAsync</a>(RollHookEndpointSecretRequest { ... }) -> WithRawResponseTask&lt;HookEndpointWithSecret&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.RollSecretAsync(
    new RollHookEndpointSecretRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        PreviousSecretExpiresIn = 3600,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RollHookEndpointSecretRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">RecoverAsync</a>(RecoverHookEndpointRequest { ... }) -> WithRawResponseTask&lt;HookEndpointRecovery&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.RecoverAsync(
    new RecoverHookEndpointRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Since = new DateTime(2026, 01, 15, 00, 00, 00, 000),
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RecoverHookEndpointRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">GetRecoveryAsync</a>(GetRecoveryEndpointsRequest { ... }) -> WithRawResponseTask&lt;HookEndpointRecovery&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.GetRecoveryAsync(
    new GetRecoveryEndpointsRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        RecoveryId = "hrec_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetRecoveryEndpointsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">SendTestAsync</a>(SendHookTestRequest { ... }) -> WithRawResponseTask&lt;HookMessage&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.SendTestAsync(
    new SendHookTestRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        EventType = "invoice.paid",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SendHookTestRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Endpoints.<a href="/src/Coss/Hooks/Endpoints/EndpointsClient.cs">ListDeliveriesAsync</a>(ListDeliveriesEndpointsRequest { ... }) -> WithRawResponseTask&lt;HookDeliveryList&gt;</code></summary>
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

```csharp
await client.Hooks.Endpoints.ListDeliveriesAsync(
    new ListDeliveriesEndpointsRequest
    {
        Application = "customer_8812",
        EndpointId = "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListDeliveriesEndpointsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Messages
<details><summary><code>client.Hooks.Messages.<a href="/src/Coss/Hooks/Messages/MessagesClient.cs">ListAsync</a>(ListMessagesRequest { ... }) -> WithRawResponseTask&lt;HookMessageList&gt;</code></summary>
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

```csharp
await client.Hooks.Messages.ListAsync(
    new Coss.Hooks.ListMessagesRequest { Application = "customer_8812" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListMessagesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Messages.<a href="/src/Coss/Hooks/Messages/MessagesClient.cs">SendAsync</a>(SendHookMessageRequest { ... }) -> WithRawResponseTask&lt;HookMessage&gt;</code></summary>
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

```csharp
await client.Hooks.Messages.SendAsync(
    new SendHookMessageRequest
    {
        Application = "customer_8812",
        IdempotencyKey = "invoice-1042-paid",
        EventType = "invoice.paid",
        Payload = new Dictionary<string, object?>()
        {
            { "invoice_id", "in_1042" },
            { "amount", 4200 },
            { "currency", "usd" },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SendHookMessageRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Messages.<a href="/src/Coss/Hooks/Messages/MessagesClient.cs">GetAsync</a>(GetMessagesRequest { ... }) -> WithRawResponseTask&lt;HookMessage&gt;</code></summary>
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

```csharp
await client.Hooks.Messages.GetAsync(
    new Coss.Hooks.GetMessagesRequest
    {
        Application = "customer_8812",
        MessageId = "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetMessagesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Messages.<a href="/src/Coss/Hooks/Messages/MessagesClient.cs">ListDeliveriesAsync</a>(ListDeliveriesMessagesRequest { ... }) -> WithRawResponseTask&lt;HookDeliveryList&gt;</code></summary>
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

```csharp
await client.Hooks.Messages.ListDeliveriesAsync(
    new ListDeliveriesMessagesRequest
    {
        Application = "customer_8812",
        MessageId = "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListDeliveriesMessagesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Deliveries
<details><summary><code>client.Hooks.Deliveries.<a href="/src/Coss/Hooks/Deliveries/DeliveriesClient.cs">GetAsync</a>(GetDeliveriesRequest { ... }) -> WithRawResponseTask&lt;HookDelivery&gt;</code></summary>
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

```csharp
await client.Hooks.Deliveries.GetAsync(
    new Coss.Hooks.GetDeliveriesRequest
    {
        Application = "customer_8812",
        DeliveryId = "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetDeliveriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Deliveries.<a href="/src/Coss/Hooks/Deliveries/DeliveriesClient.cs">ListAttemptsAsync</a>(ListAttemptsDeliveriesRequest { ... }) -> WithRawResponseTask&lt;HookAttemptList&gt;</code></summary>
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

```csharp
await client.Hooks.Deliveries.ListAttemptsAsync(
    new ListAttemptsDeliveriesRequest
    {
        Application = "customer_8812",
        DeliveryId = "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListAttemptsDeliveriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Hooks.Deliveries.<a href="/src/Coss/Hooks/Deliveries/DeliveriesClient.cs">RetryAsync</a>(RetryDeliveriesRequest { ... }) -> WithRawResponseTask&lt;HookDelivery&gt;</code></summary>
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

```csharp
await client.Hooks.Deliveries.RetryAsync(
    new Coss.Hooks.RetryDeliveriesRequest
    {
        Application = "customer_8812",
        DeliveryId = "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RetryDeliveriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Portal
<details><summary><code>client.Hooks.Portal.<a href="/src/Coss/Hooks/Portal/PortalClient.cs">CreateSessionAsync</a>(CreateHookPortalSessionRequest { ... }) -> WithRawResponseTask&lt;HookPortalSession&gt;</code></summary>
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

```csharp
await client.Hooks.Portal.CreateSessionAsync(
    new CreateHookPortalSessionRequest { Application = "customer_8812", ExpiresIn = 3600 }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateHookPortalSessionRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes Threads
<details><summary><code>client.Inboxes.Threads.<a href="/src/Coss/Inboxes/Threads/ThreadsClient.cs">ListAsync</a>(ListThreadsRequest { ... }) -> WithRawResponseTask&lt;InboxThreadList&gt;</code></summary>
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

```csharp
await client.Inboxes.Threads.ListAsync(
    new ListThreadsRequest { InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListThreadsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Threads.<a href="/src/Coss/Inboxes/Threads/ThreadsClient.cs">GetAsync</a>(GetThreadsRequest { ... }) -> WithRawResponseTask&lt;InboxThread&gt;</code></summary>
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

```csharp
await client.Inboxes.Threads.GetAsync(
    new GetThreadsRequest
    {
        InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
        ThreadId = "thread_01k7c8m4r0c2b8w9y3d5f6g7h8",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetThreadsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Threads.<a href="/src/Coss/Inboxes/Threads/ThreadsClient.cs">DeleteAsync</a>(DeleteThreadsRequest { ... }) -> WithRawResponseTask&lt;DeletedInboxThread&gt;</code></summary>
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

```csharp
await client.Inboxes.Threads.DeleteAsync(
    new DeleteThreadsRequest
    {
        InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
        ThreadId = "thread_01k7c8m4r0c2b8w9y3d5f6g7h8",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteThreadsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes Messages
<details><summary><code>client.Inboxes.Messages.<a href="/src/Coss/Inboxes/Messages/MessagesClient.cs">ListAsync</a>(ListMessagesRequest { ... }) -> WithRawResponseTask&lt;InboxMessageList&gt;</code></summary>
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

```csharp
await client.Inboxes.Messages.ListAsync(
    new Coss.Inboxes.ListMessagesRequest { InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListMessagesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Messages.<a href="/src/Coss/Inboxes/Messages/MessagesClient.cs">SendAsync</a>(SendInboxMessageRequest { ... }) -> WithRawResponseTask&lt;InboxMessage&gt;</code></summary>
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

```csharp
await client.Inboxes.Messages.SendAsync(
    new SendInboxMessageRequest
    {
        InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
        IdempotencyKey = "welcome-user-123",
        To = "jane@example.com",
        Subject = "Your order",
        Text = "Hi Jane, your order has shipped.",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SendInboxMessageRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Messages.<a href="/src/Coss/Inboxes/Messages/MessagesClient.cs">GetAsync</a>(GetMessagesRequest { ... }) -> WithRawResponseTask&lt;InboxMessage&gt;</code></summary>
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

```csharp
await client.Inboxes.Messages.GetAsync(
    new Coss.Inboxes.GetMessagesRequest
    {
        InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
        MessageId = "imsg_01k7c8m4s1d3c9x0z4e6g7h8j9",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetMessagesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Messages.<a href="/src/Coss/Inboxes/Messages/MessagesClient.cs">GetAttachmentAsync</a>(GetAttachmentMessagesRequest { ... }) -> WithRawResponseTask&lt;Stream&gt;</code></summary>
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

```csharp
await client.Inboxes.Messages.GetAttachmentAsync(
    new GetAttachmentMessagesRequest
    {
        InboxId = "inbox_id",
        MessageId = "message_id",
        AttachmentId = "attachment_id",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetAttachmentMessagesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Inboxes.Messages.<a href="/src/Coss/Inboxes/Messages/MessagesClient.cs">ReplyAsync</a>(ReplyInboxMessageRequest { ... }) -> WithRawResponseTask&lt;InboxMessage&gt;</code></summary>
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

```csharp
await client.Inboxes.Messages.ReplyAsync(
    new ReplyInboxMessageRequest
    {
        InboxId = "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
        MessageId = "imsg_01k7c8m4s1d3c9x0z4e6g7h8j9",
        IdempotencyKey = "welcome-user-123",
        Text = "Sorry about that, Jane! A new one is on its way.",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ReplyInboxMessageRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## LogDrains Batches
<details><summary><code>client.LogDrains.Batches.<a href="/src/Coss/LogDrains/Batches/BatchesClient.cs">ListAsync</a>(ListBatchesRequest { ... }) -> WithRawResponseTask&lt;LogDrainBatchList&gt;</code></summary>
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

```csharp
await client.LogDrains.Batches.ListAsync(
    new ListBatchesRequest { Id = "drain_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListBatchesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.LogDrains.Batches.<a href="/src/Coss/LogDrains/Batches/BatchesClient.cs">GetAsync</a>(GetBatchesRequest { ... }) -> WithRawResponseTask&lt;LogDrainBatch&gt;</code></summary>
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

```csharp
await client.LogDrains.Batches.GetAsync(
    new GetBatchesRequest
    {
        Id = "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
        BatchId = "drainbat_01k7c8n2b5d7f9h1k3m5p7r9tv",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetBatchesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Assessments
<details><summary><code>client.Risk.Assessments.<a href="/src/Coss/Risk/Assessments/AssessmentsClient.cs">ListAsync</a>(ListAssessmentsRequest { ... }) -> WithRawResponseTask&lt;RiskAssessmentList&gt;</code></summary>
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

```csharp
await client.Risk.Assessments.ListAsync(new ListAssessmentsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListAssessmentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Assessments.<a href="/src/Coss/Risk/Assessments/AssessmentsClient.cs">GetAsync</a>(GetAssessmentsRequest { ... }) -> WithRawResponseTask&lt;RiskAssessment&gt;</code></summary>
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

```csharp
await client.Risk.Assessments.GetAsync(
    new GetAssessmentsRequest { Id = "rsk_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetAssessmentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Lists
<details><summary><code>client.Risk.Lists.<a href="/src/Coss/Risk/Lists/ListsClient.cs">ListAsync</a>(ListListsRequest { ... }) -> WithRawResponseTask&lt;RiskListEntryList&gt;</code></summary>
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

```csharp
await client.Risk.Lists.ListAsync(new ListListsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListListsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Lists.<a href="/src/Coss/Risk/Lists/ListsClient.cs">AddAsync</a>(CreateRiskListEntryRequest { ... }) -> WithRawResponseTask&lt;RiskListEntry&gt;</code></summary>
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

```csharp
await client.Risk.Lists.AddAsync(
    new CreateRiskListEntryRequest
    {
        List = RiskList.Block,
        Type = RiskListEntryType.Domain,
        Value = "evil.example",
        Note = "Card testing",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateRiskListEntryRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Lists.<a href="/src/Coss/Risk/Lists/ListsClient.cs">GetAsync</a>(GetListsRequest { ... }) -> WithRawResponseTask&lt;RiskListEntry&gt;</code></summary>
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

```csharp
await client.Risk.Lists.GetAsync(new GetListsRequest { Id = "rskle_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetListsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Lists.<a href="/src/Coss/Risk/Lists/ListsClient.cs">RemoveAsync</a>(RemoveListsRequest { ... }) -> WithRawResponseTask&lt;DeletedRiskListEntry&gt;</code></summary>
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

```csharp
await client.Risk.Lists.RemoveAsync(
    new RemoveListsRequest { Id = "rskle_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveListsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Users
<details><summary><code>client.Risk.Users.<a href="/src/Coss/Risk/Users/UsersClient.cs">ForgetAsync</a>(ForgetUsersRequest { ... }) -> WithRawResponseTask&lt;ForgottenRiskUser&gt;</code></summary>
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

```csharp
await client.Risk.Users.ForgetAsync(new ForgetUsersRequest { UserId = "u_42" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ForgetUsersRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Settings
<details><summary><code>client.Risk.Settings.<a href="/src/Coss/Risk/Settings/SettingsClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;RiskSettings&gt;</code></summary>
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

```csharp
await client.Risk.Settings.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Settings.<a href="/src/Coss/Risk/Settings/SettingsClient.cs">UpdateAsync</a>(UpdateRiskSettingsRequest { ... }) -> WithRawResponseTask&lt;RiskSettings&gt;</code></summary>
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

```csharp
await client.Risk.Settings.UpdateAsync(
    new UpdateRiskSettingsRequest
    {
        BlockThreshold = 0.9,
        Captcha = new UpdateRiskSettingsRequestCaptcha
        {
            Provider = UpdateRiskSettingsRequestCaptchaProvider.Turnstile,
            Secret = "0x4AAA…",
            Required = true,
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateRiskSettingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Rules
<details><summary><code>client.Risk.Rules.<a href="/src/Coss/Risk/Rules/RulesClient.cs">ListAsync</a>() -> WithRawResponseTask&lt;RiskRuleList&gt;</code></summary>
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

```csharp
await client.Risk.Rules.ListAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Rules.<a href="/src/Coss/Risk/Rules/RulesClient.cs">CreateAsync</a>(CreateRiskRuleRequest { ... }) -> WithRawResponseTask&lt;RiskRule&gt;</code></summary>
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

```csharp
await client.Risk.Rules.CreateAsync(
    new CreateRiskRuleRequest
    {
        Name = "Disposable email from a data center",
        Events = new List<RiskEvent>() { RiskEvent.Signup },
        Conditions = new List<RiskRuleCondition>()
        {
            new RiskRuleCondition
            {
                Field = RiskRuleConditionField.EmailDisposable,
                Operator = RiskRuleConditionOperator.Is,
                Value = true,
            },
            new RiskRuleCondition
            {
                Field = RiskRuleConditionField.IpHosting,
                Operator = RiskRuleConditionOperator.Is,
                Value = true,
            },
        },
        Action = RiskDecision.Block,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateRiskRuleRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Rules.<a href="/src/Coss/Risk/Rules/RulesClient.cs">GetAsync</a>(GetRulesRequest { ... }) -> WithRawResponseTask&lt;RiskRule&gt;</code></summary>
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

```csharp
await client.Risk.Rules.GetAsync(new GetRulesRequest { Id = "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetRulesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Rules.<a href="/src/Coss/Risk/Rules/RulesClient.cs">DeleteAsync</a>(DeleteRulesRequest { ... }) -> WithRawResponseTask&lt;DeletedRiskRule&gt;</code></summary>
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

```csharp
await client.Risk.Rules.DeleteAsync(
    new DeleteRulesRequest { Id = "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteRulesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.Rules.<a href="/src/Coss/Risk/Rules/RulesClient.cs">UpdateAsync</a>(UpdateRiskRuleRequest { ... }) -> WithRawResponseTask&lt;RiskRule&gt;</code></summary>
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

```csharp
await client.Risk.Rules.UpdateAsync(
    new UpdateRiskRuleRequest { Id = "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz", Enabled = false }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateRiskRuleRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk LimitBuckets
<details><summary><code>client.Risk.LimitBuckets.<a href="/src/Coss/Risk/LimitBuckets/LimitBucketsClient.cs">ListAsync</a>() -> WithRawResponseTask&lt;RiskLimitBucketList&gt;</code></summary>
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

```csharp
await client.Risk.LimitBuckets.ListAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.LimitBuckets.<a href="/src/Coss/Risk/LimitBuckets/LimitBucketsClient.cs">CreateAsync</a>(CreateRiskLimitBucketRequest { ... }) -> WithRawResponseTask&lt;RiskLimitBucket&gt;</code></summary>
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

```csharp
await client.Risk.LimitBuckets.CreateAsync(
    new CreateRiskLimitBucketRequest
    {
        Name = "password_reset",
        Limit = 5,
        PeriodSeconds = 3600,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateRiskLimitBucketRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.LimitBuckets.<a href="/src/Coss/Risk/LimitBuckets/LimitBucketsClient.cs">GetAsync</a>(GetLimitBucketsRequest { ... }) -> WithRawResponseTask&lt;RiskLimitBucket&gt;</code></summary>
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

```csharp
await client.Risk.LimitBuckets.GetAsync(
    new GetLimitBucketsRequest { Id = "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetLimitBucketsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.LimitBuckets.<a href="/src/Coss/Risk/LimitBuckets/LimitBucketsClient.cs">DeleteAsync</a>(DeleteLimitBucketsRequest { ... }) -> WithRawResponseTask&lt;DeletedRiskLimitBucket&gt;</code></summary>
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

```csharp
await client.Risk.LimitBuckets.DeleteAsync(
    new DeleteLimitBucketsRequest { Id = "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteLimitBucketsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Risk.LimitBuckets.<a href="/src/Coss/Risk/LimitBuckets/LimitBucketsClient.cs">UpdateAsync</a>(UpdateRiskLimitBucketRequest { ... }) -> WithRawResponseTask&lt;RiskLimitBucket&gt;</code></summary>
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

```csharp
await client.Risk.LimitBuckets.UpdateAsync(
    new UpdateRiskLimitBucketRequest
    {
        Id = "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Limit = 10,
        Burst = 20,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateRiskLimitBucketRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Hosts
<details><summary><code>client.Scheduling.Hosts.<a href="/src/Coss/Scheduling/Hosts/HostsClient.cs">ListAsync</a>(ListHostsRequest { ... }) -> WithRawResponseTask&lt;SchedulingHostList&gt;</code></summary>
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

```csharp
await client.Scheduling.Hosts.ListAsync(new ListHostsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListHostsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Hosts.<a href="/src/Coss/Scheduling/Hosts/HostsClient.cs">CreateAsync</a>(CreateHostRequest { ... }) -> WithRawResponseTask&lt;SchedulingHost&gt;</code></summary>
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

```csharp
await client.Scheduling.Hosts.CreateAsync(
    new CreateHostRequest
    {
        Uid = "doctor_482",
        Name = "Dr. Ana Reyes",
        Email = "ana@example.com",
        TimeZone = "America/New_York",
        Attributes = new Dictionary<string, OneOf<string, IEnumerable<string>>>()
        {
            {
                "licensed_in",
                new List<string>() { "NY", "NJ" }
            },
        },
        Locations = new List<SchedulingHostLocation>()
        {
            new SchedulingHostLocation(
                new SchedulingHostLocation.InPerson(
                    new SchedulingHostLocationInPerson { Address = "12 Main St, New York, NY" }
                )
            ),
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateHostRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Hosts.<a href="/src/Coss/Scheduling/Hosts/HostsClient.cs">GetAsync</a>(GetHostsRequest { ... }) -> WithRawResponseTask&lt;SchedulingHost&gt;</code></summary>
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

```csharp
await client.Scheduling.Hosts.GetAsync(
    new GetHostsRequest { Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetHostsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Hosts.<a href="/src/Coss/Scheduling/Hosts/HostsClient.cs">RemoveAsync</a>(RemoveHostsRequest { ... }) -> WithRawResponseTask&lt;DeletedSchedulingHost&gt;</code></summary>
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

```csharp
await client.Scheduling.Hosts.RemoveAsync(
    new RemoveHostsRequest { Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveHostsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Hosts.<a href="/src/Coss/Scheduling/Hosts/HostsClient.cs">UpdateAsync</a>(UpdateHostRequest { ... }) -> WithRawResponseTask&lt;SchedulingHost&gt;</code></summary>
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

```csharp
await client.Scheduling.Hosts.UpdateAsync(
    new UpdateHostRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Status = UpdateHostRequestStatus.Disabled,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateHostRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Schedules
<details><summary><code>client.Scheduling.Schedules.<a href="/src/Coss/Scheduling/Schedules/SchedulesClient.cs">ListAsync</a>(ListSchedulesRequest { ... }) -> WithRawResponseTask&lt;SchedulingScheduleList&gt;</code></summary>
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

```csharp
await client.Scheduling.Schedules.ListAsync(
    new ListSchedulesRequest { Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListSchedulesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Schedules.<a href="/src/Coss/Scheduling/Schedules/SchedulesClient.cs">CreateAsync</a>(CreateSchedulesRequest { ... }) -> WithRawResponseTask&lt;SchedulingSchedule&gt;</code></summary>
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

```csharp
await client.Scheduling.Schedules.CreateAsync(
    new CreateSchedulesRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Body = new UpsertScheduleRequest
        {
            Name = "Clinic hours",
            Rules = new List<SchedulingWeeklyRule>()
            {
                new SchedulingWeeklyRule
                {
                    Days = new List<int>() { 1, 2, 3, 4, 5 },
                    Start = "09:00",
                    End = "17:00",
                },
            },
            Overrides = new List<SchedulingScheduleOverride>()
            {
                new SchedulingScheduleOverride
                {
                    Date = "2027-12-24",
                    Ranges = new List<SchedulingScheduleOverrideRangesItem>()
                    {
                        new SchedulingScheduleOverrideRangesItem { Start = "start", End = "end" },
                    },
                },
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSchedulesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Schedules.<a href="/src/Coss/Scheduling/Schedules/SchedulesClient.cs">GetAsync</a>(GetSchedulesRequest { ... }) -> WithRawResponseTask&lt;SchedulingSchedule&gt;</code></summary>
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

```csharp
await client.Scheduling.Schedules.GetAsync(
    new GetSchedulesRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        ScheduleId = "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetSchedulesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Schedules.<a href="/src/Coss/Scheduling/Schedules/SchedulesClient.cs">UpdateAsync</a>(UpdateSchedulesRequest { ... }) -> WithRawResponseTask&lt;SchedulingSchedule&gt;</code></summary>
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

```csharp
await client.Scheduling.Schedules.UpdateAsync(
    new UpdateSchedulesRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        ScheduleId = "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Body = new UpsertScheduleRequest
        {
            Name = "Clinic hours",
            Rules = new List<SchedulingWeeklyRule>()
            {
                new SchedulingWeeklyRule
                {
                    Days = new List<int>() { 1, 2, 3, 4, 5 },
                    Start = "09:00",
                    End = "17:00",
                },
            },
            Overrides = new List<SchedulingScheduleOverride>()
            {
                new SchedulingScheduleOverride
                {
                    Date = "2027-12-24",
                    Ranges = new List<SchedulingScheduleOverrideRangesItem>()
                    {
                        new SchedulingScheduleOverrideRangesItem { Start = "start", End = "end" },
                    },
                },
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateSchedulesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Schedules.<a href="/src/Coss/Scheduling/Schedules/SchedulesClient.cs">RemoveAsync</a>(RemoveSchedulesRequest { ... }) -> WithRawResponseTask&lt;DeletedSchedulingSchedule&gt;</code></summary>
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

```csharp
await client.Scheduling.Schedules.RemoveAsync(
    new RemoveSchedulesRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        ScheduleId = "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveSchedulesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling EventTypes
<details><summary><code>client.Scheduling.EventTypes.<a href="/src/Coss/Scheduling/EventTypes/EventTypesClient.cs">ListAsync</a>(ListEventTypesRequest { ... }) -> WithRawResponseTask&lt;SchedulingEventTypeList&gt;</code></summary>
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

```csharp
await client.Scheduling.EventTypes.ListAsync(new Coss.Scheduling.ListEventTypesRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListEventTypesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.EventTypes.<a href="/src/Coss/Scheduling/EventTypes/EventTypesClient.cs">CreateAsync</a>(CreateEventTypeRequest { ... }) -> WithRawResponseTask&lt;SchedulingEventType&gt;</code></summary>
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

```csharp
await client.Scheduling.EventTypes.CreateAsync(
    new CreateEventTypeRequest
    {
        Kind = CreateEventTypeRequestKind.OneOnOne,
        Title = "Initial consultation",
        DurationMinutes = 30,
        BufferAfterMinutes = 10,
        MinNoticeMinutes = 120,
        Hosts = new List<SchedulingEventTypeHostInput>()
        {
            new SchedulingEventTypeHostInput { Host = "doctor_482" },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateEventTypeRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.EventTypes.<a href="/src/Coss/Scheduling/EventTypes/EventTypesClient.cs">GetAsync</a>(GetEventTypesRequest { ... }) -> WithRawResponseTask&lt;SchedulingEventType&gt;</code></summary>
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

```csharp
await client.Scheduling.EventTypes.GetAsync(
    new Coss.Scheduling.GetEventTypesRequest { EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetEventTypesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.EventTypes.<a href="/src/Coss/Scheduling/EventTypes/EventTypesClient.cs">UpdateAsync</a>(UpdateEventTypeRequest { ... }) -> WithRawResponseTask&lt;SchedulingEventType&gt;</code></summary>
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

```csharp
await client.Scheduling.EventTypes.UpdateAsync(
    new UpdateEventTypeRequest
    {
        EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        MinNoticeMinutes = 240,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateEventTypeRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Slots
<details><summary><code>client.Scheduling.Slots.<a href="/src/Coss/Scheduling/Slots/SlotsClient.cs">ListAsync</a>(ListSlotsRequest { ... }) -> WithRawResponseTask&lt;SchedulingSlotList&gt;</code></summary>
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

```csharp
await client.Scheduling.Slots.ListAsync(
    new ListSlotsRequest
    {
        EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Start = "2027-01-04T15:00:00.000Z",
        End = "2027-01-04T15:00:00.000Z",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListSlotsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Slots.<a href="/src/Coss/Scheduling/Slots/SlotsClient.cs">ExplainAsync</a>(ExplainSlotsRequest { ... }) -> WithRawResponseTask&lt;SchedulingSlotExplanation&gt;</code></summary>
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

```csharp
await client.Scheduling.Slots.ExplainAsync(
    new ExplainSlotsRequest
    {
        EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Start = "2027-01-04T15:00:00.000Z",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ExplainSlotsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Availability
<details><summary><code>client.Scheduling.Availability.<a href="/src/Coss/Scheduling/Availability/AvailabilityClient.cs">SearchAsync</a>(AvailabilitySearchRequest { ... }) -> WithRawResponseTask&lt;SchedulingAvailabilitySearchResult&gt;</code></summary>
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

```csharp
await client.Scheduling.Availability.SearchAsync(
    new AvailabilitySearchRequest
    {
        EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Start = "2027-01-04T00:00:00.000Z",
        End = "2027-01-18T00:00:00.000Z",
        Attributes = new Dictionary<string, OneOf<string, IEnumerable<string>>>()
        {
            { "licensed_in", "CA" },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `AvailabilitySearchRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Bookings
<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">ListAsync</a>(ListBookingsRequest { ... }) -> WithRawResponseTask&lt;SchedulingBookingList&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.ListAsync(
    new ListBookingsRequest
    {
        StartAfter = "2027-01-04T15:00:00.000Z",
        StartBefore = "2027-01-04T15:00:00.000Z",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListBookingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">CreateAsync</a>(CreateBookingRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.CreateAsync(
    new CreateBookingRequest
    {
        IdempotencyKey = "welcome-user-123",
        EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Start = "2027-01-04T15:00:00.000Z",
        Attendee = new SchedulingAttendeeInput
        {
            Uid = "patient_77",
            Name = "Sam Lee",
            Email = "sam@example.com",
            TimeZone = "UTC",
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateBookingRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">GetAsync</a>(GetBookingsRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.GetAsync(
    new GetBookingsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetBookingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">RescheduleAsync</a>(RescheduleBookingRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.RescheduleAsync(
    new RescheduleBookingRequest
    {
        Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Start = "2027-01-05T15:00:00.000Z",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RescheduleBookingRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">CancelAsync</a>(CancelSchedulingBookingRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.CancelAsync(
    new CancelSchedulingBookingRequest
    {
        Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Reason = "Feeling better",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CancelSchedulingBookingRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">EventsAsync</a>(EventsBookingsRequest { ... }) -> WithRawResponseTask&lt;SchedulingBookingEventList&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.EventsAsync(
    new EventsBookingsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `EventsBookingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">ApproveAsync</a>(ApproveBookingsRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.ApproveAsync(
    new ApproveBookingsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ApproveBookingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">DeclineAsync</a>(DeclineBookingsRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.DeclineAsync(
    new DeclineBookingsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeclineBookingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">NotificationsAsync</a>(NotificationsBookingsRequest { ... }) -> WithRawResponseTask&lt;SchedulingBookingNotificationList&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.NotificationsAsync(
    new NotificationsBookingsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `NotificationsBookingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">MarkNoShowAsync</a>(MarkNoShowBookingsRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.MarkNoShowAsync(
    new MarkNoShowBookingsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `MarkNoShowBookingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Bookings.<a href="/src/Coss/Scheduling/Bookings/BookingsClient.cs">UpdateLocationAsync</a>(UpdateBookingLocationRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Bookings.UpdateLocationAsync(
    new UpdateBookingLocationRequest
    {
        Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Location = new SchedulingLocation(
            new SchedulingLocation.Link(
                new SchedulingLocationLink { Url = "https://meet.example.com/abc" }
            )
        ),
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateBookingLocationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Holds
<details><summary><code>client.Scheduling.Holds.<a href="/src/Coss/Scheduling/Holds/HoldsClient.cs">CreateAsync</a>(CreateHoldRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Holds.CreateAsync(
    new CreateHoldRequest
    {
        IdempotencyKey = "welcome-user-123",
        EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Start = "2027-01-04T15:00:00.000Z",
        Attendee = new SchedulingAttendeeInput { Uid = "patient_77", TimeZone = "UTC" },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateHoldRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Holds.<a href="/src/Coss/Scheduling/Holds/HoldsClient.cs">ConfirmAsync</a>(ConfirmHoldRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Holds.ConfirmAsync(
    new ConfirmHoldRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m", IfStillFree = true }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ConfirmHoldRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Holds.<a href="/src/Coss/Scheduling/Holds/HoldsClient.cs">ReleaseAsync</a>(ReleaseHoldsRequest { ... }) -> WithRawResponseTask&lt;SchedulingBooking&gt;</code></summary>
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

```csharp
await client.Scheduling.Holds.ReleaseAsync(
    new ReleaseHoldsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ReleaseHoldsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Series
<details><summary><code>client.Scheduling.Series.<a href="/src/Coss/Scheduling/Series/SeriesClient.cs">CreateAsync</a>(CreateSeriesBody { ... }) -> WithRawResponseTask&lt;SchedulingSeries&gt;</code></summary>
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

```csharp
await client.Scheduling.Series.CreateAsync(
    new CreateSeriesBody
    {
        IdempotencyKey = "welcome-user-123",
        Body = new CreateSeriesRequest
        {
            EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
            Start = "2027-01-04T15:00:00.000Z",
            Attendee = new SchedulingAttendeeInput
            {
                Uid = "patient_77",
                TimeZone = "America/New_York",
            },
            Recurrence = new CreateSeriesRequestRecurrence
            {
                Frequency = CreateSeriesRequestRecurrenceFrequency.Weekly,
                Interval = 1,
                Count = 12,
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSeriesBody` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Series.<a href="/src/Coss/Scheduling/Series/SeriesClient.cs">PreviewAsync</a>(CreateSeriesRequest { ... }) -> WithRawResponseTask&lt;SchedulingSeriesPreview&gt;</code></summary>
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

```csharp
await client.Scheduling.Series.PreviewAsync(
    new CreateSeriesRequest
    {
        EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Start = "2027-01-04T15:00:00.000Z",
        Attendee = new SchedulingAttendeeInput
        {
            Uid = "patient_77",
            TimeZone = "America/New_York",
        },
        Recurrence = new CreateSeriesRequestRecurrence
        {
            Frequency = CreateSeriesRequestRecurrenceFrequency.Weekly,
            Interval = 1,
            Count = 12,
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSeriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Series.<a href="/src/Coss/Scheduling/Series/SeriesClient.cs">CancelAsync</a>(CancelSeriesRequest { ... }) -> WithRawResponseTask&lt;SchedulingCancelledSeries&gt;</code></summary>
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

```csharp
await client.Scheduling.Series.CancelAsync(
    new CancelSeriesRequest { Id = "series_01kd2m9a0b1c2d3e4f5g6h7j8m", FromIndex = 4 }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CancelSeriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Attendees
<details><summary><code>client.Scheduling.Attendees.<a href="/src/Coss/Scheduling/Attendees/AttendeesClient.cs">EraseAsync</a>(EraseAttendeesRequest { ... }) -> WithRawResponseTask&lt;SchedulingAttendeeErasure&gt;</code></summary>
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

```csharp
await client.Scheduling.Attendees.EraseAsync(new EraseAttendeesRequest { Uid = "patient_77" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `EraseAttendeesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Attendees.<a href="/src/Coss/Scheduling/Attendees/AttendeesClient.cs">EraseByEmailAsync</a>(EraseSchedulingAttendeeByEmailRequest { ... }) -> WithRawResponseTask&lt;SchedulingAttendeeErasureByEmail&gt;</code></summary>
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

```csharp
await client.Scheduling.Attendees.EraseByEmailAsync(
    new EraseSchedulingAttendeeByEmailRequest { Email = "sam@example.com" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `EraseSchedulingAttendeeByEmailRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Calendars
<details><summary><code>client.Scheduling.Calendars.<a href="/src/Coss/Scheduling/Calendars/CalendarsClient.cs">AuthorizeAsync</a>(AuthorizeCalendarRequest { ... }) -> WithRawResponseTask&lt;SchedulingCalendarAuthorization&gt;</code></summary>
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

```csharp
await client.Scheduling.Calendars.AuthorizeAsync(
    new AuthorizeCalendarRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Provider = AuthorizeCalendarRequestProvider.Google,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `AuthorizeCalendarRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.<a href="/src/Coss/Scheduling/Calendars/CalendarsClient.cs">ListAsync</a>(ListCalendarsRequest { ... }) -> WithRawResponseTask&lt;SchedulingCalendarConnectionList&gt;</code></summary>
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

```csharp
await client.Scheduling.Calendars.ListAsync(
    new ListCalendarsRequest { Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListCalendarsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.<a href="/src/Coss/Scheduling/Calendars/CalendarsClient.cs">ConnectAsync</a>(ConnectCalendarsRequest { ... }) -> WithRawResponseTask&lt;SchedulingCalendarConnection&gt;</code></summary>
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

```csharp
await client.Scheduling.Calendars.ConnectAsync(
    new ConnectCalendarsRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Body = new CreateCalendarConnectionRequest(
            new CreateCalendarConnectionRequest.Caldav(
                new CreateCalendarConnectionRequestCaldav
                {
                    Url = "url",
                    Username = "username",
                    Password = "password",
                }
            )
        ),
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ConnectCalendarsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.<a href="/src/Coss/Scheduling/Calendars/CalendarsClient.cs">DisconnectAsync</a>(DisconnectCalendarsRequest { ... }) -> WithRawResponseTask&lt;DeletedSchedulingCalendarConnection&gt;</code></summary>
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

```csharp
await client.Scheduling.Calendars.DisconnectAsync(
    new DisconnectCalendarsRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Id = "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DisconnectCalendarsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.<a href="/src/Coss/Scheduling/Calendars/CalendarsClient.cs">UpdateAsync</a>(UpdateCalendarRequest { ... }) -> WithRawResponseTask&lt;SchedulingCalendarConnectionList&gt;</code></summary>
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

```csharp
await client.Scheduling.Calendars.UpdateAsync(
    new UpdateCalendarRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        CalendarId = "cal_01kd2m9a0b1c2d3e4f5g6h7j8m",
        ReadBusy = true,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateCalendarRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Calendars.<a href="/src/Coss/Scheduling/Calendars/CalendarsClient.cs">SetSimulatedBusyAsync</a>(SetSimulatedBusyRequest { ... }) -> WithRawResponseTask</code></summary>
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

```csharp
await client.Scheduling.Calendars.SetSimulatedBusyAsync(
    new SetSimulatedBusyRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Intervals = new List<SetSimulatedBusyRequestIntervalsItem>()
        {
            new SetSimulatedBusyRequestIntervalsItem
            {
                Start = "2027-01-04T15:00:00.000Z",
                End = "2027-01-04T16:00:00.000Z",
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SetSimulatedBusyRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling CalendarDelegations
<details><summary><code>client.Scheduling.CalendarDelegations.<a href="/src/Coss/Scheduling/CalendarDelegations/CalendarDelegationsClient.cs">ListAsync</a>() -> WithRawResponseTask&lt;SchedulingCalendarDelegationList&gt;</code></summary>
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

```csharp
await client.Scheduling.CalendarDelegations.ListAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.<a href="/src/Coss/Scheduling/CalendarDelegations/CalendarDelegationsClient.cs">CreateAsync</a>(CreateCalendarDelegationRequest { ... }) -> WithRawResponseTask&lt;SchedulingCalendarDelegation&gt;</code></summary>
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

```csharp
await client.Scheduling.CalendarDelegations.CreateAsync(
    new CreateCalendarDelegationRequest(
        new CreateCalendarDelegationRequest.Google(
            new CreateCalendarDelegationRequestGoogle
            {
                Domain = "domain",
                ServiceAccountKey = "service_account_key",
            }
        )
    )
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateCalendarDelegationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.<a href="/src/Coss/Scheduling/CalendarDelegations/CalendarDelegationsClient.cs">GetAsync</a>(GetCalendarDelegationsRequest { ... }) -> WithRawResponseTask&lt;SchedulingCalendarDelegation&gt;</code></summary>
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

```csharp
await client.Scheduling.CalendarDelegations.GetAsync(
    new GetCalendarDelegationsRequest { Id = "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetCalendarDelegationsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.<a href="/src/Coss/Scheduling/CalendarDelegations/CalendarDelegationsClient.cs">DeleteAsync</a>(DeleteCalendarDelegationsRequest { ... }) -> WithRawResponseTask&lt;DeletedSchedulingCalendarDelegation&gt;</code></summary>
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

```csharp
await client.Scheduling.CalendarDelegations.DeleteAsync(
    new DeleteCalendarDelegationsRequest { Id = "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `DeleteCalendarDelegationsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.<a href="/src/Coss/Scheduling/CalendarDelegations/CalendarDelegationsClient.cs">UpdateAsync</a>(UpdateCalendarDelegationRequest { ... }) -> WithRawResponseTask&lt;SchedulingCalendarDelegation&gt;</code></summary>
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

```csharp
await client.Scheduling.CalendarDelegations.UpdateAsync(
    new UpdateCalendarDelegationRequest
    {
        Id = "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
        MatchHostEmail = false,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateCalendarDelegationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.CalendarDelegations.<a href="/src/Coss/Scheduling/CalendarDelegations/CalendarDelegationsClient.cs">VerifyAsync</a>(VerifyCalendarDelegationRequest { ... }) -> WithRawResponseTask&lt;SchedulingCalendarDelegation&gt;</code></summary>
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

```csharp
await client.Scheduling.CalendarDelegations.VerifyAsync(
    new VerifyCalendarDelegationRequest
    {
        Id = "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Account = "ana@example.com",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `VerifyCalendarDelegationRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Sessions
<details><summary><code>client.Scheduling.Sessions.<a href="/src/Coss/Scheduling/Sessions/SessionsClient.cs">CreateForHostAsync</a>(CreateSchedulingHostSessionRequest { ... }) -> WithRawResponseTask&lt;SchedulingSession&gt;</code></summary>
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

```csharp
await client.Scheduling.Sessions.CreateForHostAsync(
    new CreateSchedulingHostSessionRequest
    {
        Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
        ExpiresIn = 3600,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSchedulingHostSessionRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Sessions.<a href="/src/Coss/Scheduling/Sessions/SessionsClient.cs">CreateForBookerAsync</a>(CreateSchedulingBookerSessionRequest { ... }) -> WithRawResponseTask&lt;SchedulingSession&gt;</code></summary>
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

```csharp
await client.Scheduling.Sessions.CreateForBookerAsync(
    new CreateSchedulingBookerSessionRequest
    {
        EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
        Attendee = new CreateSchedulingBookerSessionRequestAttendee
        {
            Uid = "patient_77",
            Name = "Sam Lee",
            TimeZone = "UTC",
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSchedulingBookerSessionRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Sessions.<a href="/src/Coss/Scheduling/Sessions/SessionsClient.cs">CreateForBookingAsync</a>(CreateForBookingSessionsRequest { ... }) -> WithRawResponseTask&lt;SchedulingSession&gt;</code></summary>
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

```csharp
await client.Scheduling.Sessions.CreateForBookingAsync(
    new CreateForBookingSessionsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateForBookingSessionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Settings
<details><summary><code>client.Scheduling.Settings.<a href="/src/Coss/Scheduling/Settings/SettingsClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;SchedulingSettings&gt;</code></summary>
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

```csharp
await client.Scheduling.Settings.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Scheduling.Settings.<a href="/src/Coss/Scheduling/Settings/SettingsClient.cs">UpdateAsync</a>(UpdateSchedulingSettingsRequest { ... }) -> WithRawResponseTask&lt;SchedulingSettings&gt;</code></summary>
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

```csharp
await client.Scheduling.Settings.UpdateAsync(
    new UpdateSchedulingSettingsRequest { BrandName = "Acme Health" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateSchedulingSettingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Documents
<details><summary><code>client.Sign.Documents.<a href="/src/Coss/Sign/Documents/DocumentsClient.cs">ListAsync</a>(ListDocumentsRequest { ... }) -> WithRawResponseTask&lt;SignDocumentList&gt;</code></summary>
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

```csharp
await client.Sign.Documents.ListAsync(new ListDocumentsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListDocumentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Documents.<a href="/src/Coss/Sign/Documents/DocumentsClient.cs">UploadAsync</a>(UploadSignDocumentRequest { ... }) -> WithRawResponseTask&lt;SignDocument&gt;</code></summary>
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

```csharp
await client.Sign.Documents.UploadAsync(
    new UploadSignDocumentRequest
    {
        Filename = "agreement.pdf",
        Content =
            "JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNCAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTEKL0Jhc2VGb250IC9IZWx2ZXRpY2EKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA8PAovSGVsdmV0aWNhLTcwOTg0ODA3ODkgMyAwIFIKPj4KL1hPYmplY3QgPDwKPj4KL0V4dEdTdGF0ZSA8PAo+Pgo+PgovTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdCi9Bbm5vdHMgWyBdCi9Db250ZW50cyBbIDUgMCBSIF0KPj4KZW5kb2JqCgo1IDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9MZW5ndGggMTIwCj4+CnN0cmVhbQp4nG2KMQrCQBBF+znF1II4O7s7fxckYEjEwkaYC4hEiWgREc9vtLCSV/3330Stk/CHx4VWu+H2Gp7j6biE1JKKoFQOyn4mTex7Ct80MJQhwn6ndY5WDdZbQEKGWo4bFbQzf56fm3fexoAOXcN+JV9Q73SgN3RWIBIKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE2IDAwMDAwIG4gCjAwMDAwMDAwNzYgMDAwMDAgbiAKMDAwMDAwMDEyNiAwMDAwMCBuIAowMDAwMDAwMjI0IDAwMDAwIG4gCjAwMDAwMDA0MTkgMDAwMDAgbiAKCnRyYWlsZXIKPDwKL1NpemUgNgovUm9vdCAyIDAgUgo+PgoKc3RhcnR4cmVmCjYxMgolJUVPRg==",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UploadSignDocumentRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Documents.<a href="/src/Coss/Sign/Documents/DocumentsClient.cs">GetAsync</a>(GetDocumentsRequest { ... }) -> WithRawResponseTask&lt;SignDocument&gt;</code></summary>
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

```csharp
await client.Sign.Documents.GetAsync(
    new GetDocumentsRequest { Id = "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetDocumentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Documents.<a href="/src/Coss/Sign/Documents/DocumentsClient.cs">RemoveAsync</a>(RemoveDocumentsRequest { ... }) -> WithRawResponseTask&lt;DeletedSignDocument&gt;</code></summary>
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

```csharp
await client.Sign.Documents.RemoveAsync(
    new RemoveDocumentsRequest { Id = "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveDocumentsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Requests
<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">ListAsync</a>(ListRequestsRequest { ... }) -> WithRawResponseTask&lt;SignRequestList&gt;</code></summary>
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

```csharp
await client.Sign.Requests.ListAsync(new ListRequestsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListRequestsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">CreateAsync</a>(CreateSignRequestRequest { ... }) -> WithRawResponseTask&lt;SignRequest&gt;</code></summary>
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

```csharp
await client.Sign.Requests.CreateAsync(
    new CreateSignRequestRequest
    {
        IdempotencyKey = "welcome-user-123",
        Title = "Services agreement",
        Documents = new List<
            OneOf<
                CreateSignRequestRequestDocumentsItemDocumentId,
                CreateSignRequestRequestDocumentsItemContent
            >
        >()
        {
            new CreateSignRequestRequestDocumentsItemDocumentId
            {
                DocumentId = "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz",
            },
        },
        Signers = new List<CreateSignRequestRequestSignersItem>()
        {
            new CreateSignRequestRequestSignersItem
            {
                Name = "Ada Lovelace",
                Email = "ada@example.com",
                Fields = new List<OneOf<SignFieldInputDocument, SignFieldInputAnchor>>()
                {
                    new SignFieldInputAnchor
                    {
                        Type = SignFieldInputAnchorType.Signature,
                        Anchor = "{{signature:signer_1}}",
                    },
                    new SignFieldInputDocument
                    {
                        Type = SignFieldInputDocumentType.DateSigned,
                        Page = 2,
                        X = 320,
                        Y = 640,
                        Width = 120,
                        Height = 18,
                    },
                },
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSignRequestRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">GetAsync</a>(GetRequestsRequest { ... }) -> WithRawResponseTask&lt;SignRequest&gt;</code></summary>
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

```csharp
await client.Sign.Requests.GetAsync(
    new GetRequestsRequest { Id = "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetRequestsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">RemoveAsync</a>(RemoveRequestsRequest { ... }) -> WithRawResponseTask&lt;DeletedSignRequest&gt;</code></summary>
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

```csharp
await client.Sign.Requests.RemoveAsync(
    new RemoveRequestsRequest { Id = "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveRequestsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">SendAsync</a>(SendRequestsRequest { ... }) -> WithRawResponseTask&lt;SignRequest&gt;</code></summary>
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

```csharp
await client.Sign.Requests.SendAsync(
    new SendRequestsRequest { Id = "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SendRequestsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">CancelAsync</a>(CancelRequestsRequest { ... }) -> WithRawResponseTask&lt;SignRequest&gt;</code></summary>
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

```csharp
await client.Sign.Requests.CancelAsync(
    new CancelRequestsRequest { Id = "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CancelRequestsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">AuditTrailAsync</a>(AuditTrailRequestsRequest { ... }) -> WithRawResponseTask&lt;SignEventList&gt;</code></summary>
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

```csharp
await client.Sign.Requests.AuditTrailAsync(
    new AuditTrailRequestsRequest { Id = "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `AuditTrailRequestsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">RemindAsync</a>(RemindRequestsRequest { ... }) -> WithRawResponseTask&lt;SignRequest&gt;</code></summary>
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

```csharp
await client.Sign.Requests.RemindAsync(
    new RemindRequestsRequest { Id = "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemindRequestsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Requests.<a href="/src/Coss/Sign/Requests/RequestsClient.cs">SignedDocumentAsync</a>(SignedDocumentRequestsRequest { ... }) -> WithRawResponseTask&lt;Stream&gt;</code></summary>
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

```csharp
await client.Sign.Requests.SignedDocumentAsync(new SignedDocumentRequestsRequest { Id = "id" });
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `SignedDocumentRequestsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Sessions
<details><summary><code>client.Sign.Sessions.<a href="/src/Coss/Sign/Sessions/SessionsClient.cs">CreateAsync</a>(CreateSignSessionRequest { ... }) -> WithRawResponseTask&lt;SignSession&gt;</code></summary>
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

```csharp
await client.Sign.Sessions.CreateAsync(
    new CreateSignSessionRequest
    {
        Id = "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
        SignerId = "ssgn_01k7c8m4q2f3e9v6t5r1n0p8yz",
        ExpiresIn = 3600,
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSignSessionRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Settings
<details><summary><code>client.Sign.Settings.<a href="/src/Coss/Sign/Settings/SettingsClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;SignSettings&gt;</code></summary>
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

```csharp
await client.Sign.Settings.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Settings.<a href="/src/Coss/Sign/Settings/SettingsClient.cs">UpdateAsync</a>(UpdateSignSettingsRequest { ... }) -> WithRawResponseTask&lt;SignSettings&gt;</code></summary>
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

```csharp
await client.Sign.Settings.UpdateAsync(
    new UpdateSignSettingsRequest
    {
        AllowedOrigins = new List<string>() { "https://app.example.com" },
        DisplayName = "Acme",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateSignSettingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Templates
<details><summary><code>client.Sign.Templates.<a href="/src/Coss/Sign/Templates/TemplatesClient.cs">ListAsync</a>(ListTemplatesRequest { ... }) -> WithRawResponseTask&lt;SignTemplateList&gt;</code></summary>
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

```csharp
await client.Sign.Templates.ListAsync(new Coss.Sign.ListTemplatesRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListTemplatesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.<a href="/src/Coss/Sign/Templates/TemplatesClient.cs">CreateAsync</a>(CreateSignTemplateRequest { ... }) -> WithRawResponseTask&lt;SignTemplate&gt;</code></summary>
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

```csharp
await client.Sign.Templates.CreateAsync(
    new CreateSignTemplateRequest
    {
        Name = "Mutual NDA",
        Documents = new List<
            OneOf<
                CreateSignTemplateRequestDocumentsItemDocumentId,
                CreateSignTemplateRequestDocumentsItemContent
            >
        >()
        {
            new CreateSignTemplateRequestDocumentsItemDocumentId
            {
                DocumentId = "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz",
            },
        },
        Roles = new List<CreateSignTemplateRequestRolesItem>()
        {
            new CreateSignTemplateRequestRolesItem { Key = "client", Name = "Client" },
            new CreateSignTemplateRequestRolesItem { Key = "company", Name = "Company" },
        },
        Fields = new List<
            OneOf<
                CreateSignTemplateRequestFieldsItemDocument,
                CreateSignTemplateRequestFieldsItemAnchor
            >
        >()
        {
            new CreateSignTemplateRequestFieldsItemAnchor
            {
                Type = CreateSignTemplateRequestFieldsItemAnchorType.Signature,
                Anchor = "{{signature:client}}",
                Role = "client",
            },
            new CreateSignTemplateRequestFieldsItemDocument
            {
                Type = CreateSignTemplateRequestFieldsItemDocumentType.Text,
                Page = 1,
                X = 72,
                Y = 140,
                Width = 200,
                Height = 18,
                Role = "client",
                MergeKey = "client_company",
            },
            new CreateSignTemplateRequestFieldsItemAnchor
            {
                Type = CreateSignTemplateRequestFieldsItemAnchorType.Signature,
                Anchor = "{{signature:company}}",
                Role = "company",
            },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSignTemplateRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.<a href="/src/Coss/Sign/Templates/TemplatesClient.cs">GetAsync</a>(GetTemplatesRequest { ... }) -> WithRawResponseTask&lt;SignTemplate&gt;</code></summary>
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

```csharp
await client.Sign.Templates.GetAsync(
    new Coss.Sign.GetTemplatesRequest { Id = "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetTemplatesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.<a href="/src/Coss/Sign/Templates/TemplatesClient.cs">RemoveAsync</a>(RemoveTemplatesRequest { ... }) -> WithRawResponseTask&lt;DeletedSignTemplate&gt;</code></summary>
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

```csharp
await client.Sign.Templates.RemoveAsync(
    new RemoveTemplatesRequest { Id = "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveTemplatesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.<a href="/src/Coss/Sign/Templates/TemplatesClient.cs">UpdateAsync</a>(UpdateSignTemplateRequest { ... }) -> WithRawResponseTask&lt;SignTemplate&gt;</code></summary>
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

```csharp
await client.Sign.Templates.UpdateAsync(
    new UpdateSignTemplateRequest
    {
        Id = "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
        Name = "Mutual NDA (2026)",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateSignTemplateRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.<a href="/src/Coss/Sign/Templates/TemplatesClient.cs">CreateRequestAsync</a>(CreateSignRequestFromTemplateRequest { ... }) -> WithRawResponseTask&lt;SignRequest&gt;</code></summary>
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

```csharp
await client.Sign.Templates.CreateRequestAsync(
    new CreateSignRequestFromTemplateRequest
    {
        Id = "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
        IdempotencyKey = "welcome-user-123",
        Signers = new List<CreateSignRequestFromTemplateRequestSignersItem>()
        {
            new CreateSignRequestFromTemplateRequestSignersItem
            {
                Role = "client",
                Name = "Ada Lovelace",
                Email = "ada@example.com",
            },
            new CreateSignRequestFromTemplateRequestSignersItem
            {
                Role = "company",
                Name = "Grace Hopper",
                Email = "grace@acme.com",
                Delivery = CreateSignRequestFromTemplateRequestSignersItemDelivery.Embedded,
            },
        },
        MergeFields = new Dictionary<string, string>()
        {
            { "client_company", "Analytical Engines Ltd" },
        },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSignRequestFromTemplateRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sign.Templates.<a href="/src/Coss/Sign/Templates/TemplatesClient.cs">CreateBuilderSessionAsync</a>(CreateSignBuilderSessionRequest { ... }) -> WithRawResponseTask&lt;SignBuilderSession&gt;</code></summary>
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

```csharp
await client.Sign.Templates.CreateBuilderSessionAsync(
    new CreateSignBuilderSessionRequest { Id = "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz", ExpiresIn = 3600 }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSignBuilderSessionRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Suppressions
<details><summary><code>client.Sms.Suppressions.<a href="/src/Coss/Sms/Suppressions/SuppressionsClient.cs">ListAsync</a>(ListSuppressionsRequest { ... }) -> WithRawResponseTask&lt;SmsSuppressionList&gt;</code></summary>
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

```csharp
await client.Sms.Suppressions.ListAsync(new Coss.Sms_.ListSuppressionsRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Suppressions.<a href="/src/Coss/Sms/Suppressions/SuppressionsClient.cs">AddAsync</a>(CreateSmsSuppressionRequest { ... }) -> WithRawResponseTask&lt;SmsSuppression&gt;</code></summary>
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

```csharp
await client.Sms.Suppressions.AddAsync(
    new CreateSmsSuppressionRequest { PhoneNumber = "+14155550199" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CreateSmsSuppressionRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Suppressions.<a href="/src/Coss/Sms/Suppressions/SuppressionsClient.cs">CheckAsync</a>(CheckSuppressionsRequest { ... }) -> WithRawResponseTask&lt;SmsSuppressionCheck&gt;</code></summary>
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

```csharp
await client.Sms.Suppressions.CheckAsync(
    new Coss.Sms_.CheckSuppressionsRequest { PhoneNumber = "phone_number" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `CheckSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Suppressions.<a href="/src/Coss/Sms/Suppressions/SuppressionsClient.cs">GetAsync</a>(GetSuppressionsRequest { ... }) -> WithRawResponseTask&lt;SmsSuppression&gt;</code></summary>
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

```csharp
await client.Sms.Suppressions.GetAsync(
    new Coss.Sms_.GetSuppressionsRequest { Id = "smssup_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Suppressions.<a href="/src/Coss/Sms/Suppressions/SuppressionsClient.cs">RemoveAsync</a>(RemoveSuppressionsRequest { ... }) -> WithRawResponseTask&lt;DeletedSmsSuppression&gt;</code></summary>
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

```csharp
await client.Sms.Suppressions.RemoveAsync(
    new Coss.Sms_.RemoveSuppressionsRequest { Id = "smssup_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RemoveSuppressionsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Received
<details><summary><code>client.Sms.Received.<a href="/src/Coss/Sms/Received/ReceivedClient.cs">ListAsync</a>(ListReceivedRequest { ... }) -> WithRawResponseTask&lt;ReceivedSmsList&gt;</code></summary>
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

```csharp
await client.Sms.Received.ListAsync(new Coss.Sms_.ListReceivedRequest());
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListReceivedRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Sms.Received.<a href="/src/Coss/Sms/Received/ReceivedClient.cs">GetAsync</a>(GetReceivedRequest { ... }) -> WithRawResponseTask&lt;ReceivedSms&gt;</code></summary>
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

```csharp
await client.Sms.Received.GetAsync(
    new Coss.Sms_.GetReceivedRequest { Id = "smsin_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetReceivedRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Numbers
<details><summary><code>client.Sms.Numbers.<a href="/src/Coss/Sms/Numbers/NumbersClient.cs">ListAsync</a>() -> WithRawResponseTask&lt;SmsNumberList&gt;</code></summary>
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

```csharp
await client.Sms.Numbers.ListAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Verify Settings
<details><summary><code>client.Verify.Settings.<a href="/src/Coss/Verify/Settings/SettingsClient.cs">GetAsync</a>() -> WithRawResponseTask&lt;VerifySettings&gt;</code></summary>
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

```csharp
await client.Verify.Settings.GetAsync();
```
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.Verify.Settings.<a href="/src/Coss/Verify/Settings/SettingsClient.cs">UpdateAsync</a>(UpdateVerifySettingsRequest { ... }) -> WithRawResponseTask&lt;VerifySettings&gt;</code></summary>
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

```csharp
await client.Verify.Settings.UpdateAsync(
    new UpdateVerifySettingsRequest
    {
        SmsFrom = "+14155550100",
        AllowedCountries = new List<string>() { "CA", "GB", "US" },
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `UpdateVerifySettingsRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookEndpoints Deliveries
<details><summary><code>client.WebhookEndpoints.Deliveries.<a href="/src/Coss/WebhookEndpoints/Deliveries/DeliveriesClient.cs">ListAsync</a>(ListDeliveriesRequest { ... }) -> WithRawResponseTask&lt;WebhookDeliveryList&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.Deliveries.ListAsync(
    new ListDeliveriesRequest { Id = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz" }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `ListDeliveriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Deliveries.<a href="/src/Coss/WebhookEndpoints/Deliveries/DeliveriesClient.cs">GetAsync</a>(GetDeliveriesRequest { ... }) -> WithRawResponseTask&lt;WebhookDelivery&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.Deliveries.GetAsync(
    new Coss.WebhookEndpoints.GetDeliveriesRequest
    {
        Id = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        DeliveryId = "whdel_01k7c8n2b5d7f9h1k3m5p7r9tv",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `GetDeliveriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.WebhookEndpoints.Deliveries.<a href="/src/Coss/WebhookEndpoints/Deliveries/DeliveriesClient.cs">RetryAsync</a>(RetryDeliveriesRequest { ... }) -> WithRawResponseTask&lt;WebhookDelivery&gt;</code></summary>
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

```csharp
await client.WebhookEndpoints.Deliveries.RetryAsync(
    new Coss.WebhookEndpoints.RetryDeliveriesRequest
    {
        Id = "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
        DeliveryId = "whdel_01k7c8n2b5d7f9h1k3m5p7r9tv",
    }
);
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `RetryDeliveriesRequest` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

