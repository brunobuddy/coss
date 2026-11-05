# Reference
## Environment
<details><summary><code>client.environment.<a href="/lib/Coss/environment/client.rb">get</a>() -> Coss::Types::Environment</code></summary>
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

```ruby
client.environment.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Environment::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## APIKey
<details><summary><code>client.api_key.<a href="/lib/Coss/api_key/client.rb">revoke</a>() -> Coss::Types::DeletedAPIKey</code></summary>
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

```ruby
client.api_key.revoke
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::APIKey::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email
<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">list</a>() -> Coss::Types::EmailSummaryList</code></summary>
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

```ruby
client.email.list(to: "user@example.com")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**to:** `String` — Only emails with this recipient (in `to`, `cc` or `bcc`; the bare address, any case).
    
</dd>
</dl>

<dl>
<dd>

**recipient_status:** `String` — Only emails with a recipient in one of these statuses, comma-separated: `bounced,complained`. With `to`, that recipient's status.
    
</dd>
</dl>

<dl>
<dd>

**status:** `String` — Only emails in these statuses, comma-separated: `failed`.
    
</dd>
</dl>

<dl>
<dd>

**q:** `String` — Free text, matched against the subject and the `to` addresses.
    
</dd>
</dl>

<dl>
<dd>

**category:** `String` — Only emails of this category.
    
</dd>
</dl>

<dl>
<dd>

**batch_id:** `String` — Only the emails of this batch.
    
</dd>
</dl>

<dl>
<dd>

**subaccount:** `String` — Only the emails sent for this sub-account (its id or your uid).
    
</dd>
</dl>

<dl>
<dd>

**created_after:** `String` — Only emails created at or after this time.
    
</dd>
</dl>

<dl>
<dd>

**created_before:** `String` — Only emails created before this time.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last email of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">send_</a>(request) -> Coss::Types::Email</code></summary>
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

```ruby
client.email.send_(
  idempotency_key: "welcome-user-123",
  from: "Acme <onboarding@acme.com>",
  to: "user@example.com",
  subject: "Welcome to Acme",
  html: "<p>Thanks for signing up!</p>",
  tags: [{
    name: "template",
    value: "welcome"
  }],
  category: "onboarding"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original email (with its current status) instead of sending again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**request:** `Coss::Types::SendEmailRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">send_batch</a>(request) -> Coss::Types::EmailBatch</code></summary>
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

```ruby
client.email.send_batch(
  idempotency_key: "welcome-user-123",
  emails: [{
    from: "Acme <notifications@acme.com>",
    to: "ada@example.com",
    subject: "Your weekly summary",
    html: "<p>Hi Ada, here is your week.</p>",
    category: "digest"
  }, {
    from: "Acme <notifications@acme.com>",
    to: "grace@example.com",
    subject: "Your weekly summary",
    html: "<p>Hi Grace, here is your week.</p>",
    category: "digest"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original email (with its current status) instead of sending again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**emails:** `Internal::Types::Array[Coss::Types::SendEmailRequest]` — Up to 100 emails, each accepted by `POST /v1/emails`. The batch is accepted or rejected as a whole.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">get_batch</a>(id:) -> Coss::Types::EmailBatch</code></summary>
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

```ruby
client.email.get_batch(id: "batch_01k8d0n6x5f3w2e1r9t7y4u6i8")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The batch's id (`batch_id` of its emails).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">get</a>(id:) -> Coss::Types::Email</code></summary>
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

```ruby
client.email.get(id: "email_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The email's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">cancel</a>(id:) -> Coss::Types::Email</code></summary>
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

```ruby
client.email.cancel(id: "email_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The email's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">reschedule</a>(id:, request) -> Coss::Types::Email</code></summary>
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

```ruby
client.email.reschedule(
  id: "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
  scheduled_at: "2026-10-12T09:00:00Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The email's id.
    
</dd>
</dl>

<dl>
<dd>

**scheduled_at:** `String` — The new time to send the email at (ISO 8601 with an offset, at most 30 days ahead). A time that is not in the future sends it right away.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">list_events</a>(id:) -> Coss::Types::EmailEventList</code></summary>
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

```ruby
client.email.list_events(id: "email_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The email's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.<a href="/lib/Coss/email/client.rb">list_links</a>(id:) -> Coss::Types::EmailLinkList</code></summary>
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

```ruby
client.email.list_links(id: "email_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The email's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains
<details><summary><code>client.domains.<a href="/lib/Coss/domains/client.rb">list</a>() -> Coss::Types::DomainList</code></summary>
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

```ruby
client.domains.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — Only this sub-account's domains (its id or your uid).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.domains.<a href="/lib/Coss/domains/client.rb">create</a>(request) -> Coss::Types::Domain</code></summary>
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

```ruby
client.domains.create(name: "acme.com")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — The domain to send from, without a scheme or path. Subdomains are allowed; internationalized domains must be punycode-encoded.
    
</dd>
</dl>

<dl>
<dd>

**subaccount:** `String` — Add it for one of your live sub-accounts (its id or your uid): only that sub-account sends from it, through its own reputation.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.domains.<a href="/lib/Coss/domains/client.rb">get</a>(id:) -> Coss::Types::Domain</code></summary>
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

```ruby
client.domains.get(id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.domains.<a href="/lib/Coss/domains/client.rb">delete</a>(id:) -> Coss::Types::DeletedDomain</code></summary>
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

```ruby
client.domains.delete(id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.domains.<a href="/lib/Coss/domains/client.rb">update</a>(id:, request) -> Coss::Types::Domain</code></summary>
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

```ruby
client.domains.update(
  id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
  shared_with_subaccounts: true
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**shared_with_subaccounts:** `Internal::Types::Boolean` — Let your sub-accounts send from this domain of yours (through your organization's reputation).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.domains.<a href="/lib/Coss/domains/client.rb">verify</a>(id:) -> Coss::Types::Domain</code></summary>
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

```ruby
client.domains.verify(id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Webhook endpoints
<details><summary><code>client.webhook_endpoints.<a href="/lib/Coss/webhook_endpoints/client.rb">list</a>() -> Coss::Types::WebhookEndpointList</code></summary>
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

```ruby
client.webhook_endpoints.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_endpoints.<a href="/lib/Coss/webhook_endpoints/client.rb">create</a>(request) -> Coss::Types::WebhookEndpointWithSecret</code></summary>
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

```ruby
client.webhook_endpoints.create(
  url: "https://example.com/webhooks/coss",
  description: "Production receiver",
  event_types: %w[email.sent email.delivered]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**url:** `String` — An `https://` URL coss.com posts events to.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — A note for your own reference. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**event_types:** `Internal::Types::Array[Coss::WebhookEndpoints::Types::CreateWebhookEndpointRequestEventTypesItem]` — Event types delivered to this endpoint. An empty array means every event type, including ones added later. Defaults to every event type.
    
</dd>
</dl>

<dl>
<dd>

**api_version:** `Coss::WebhookEndpoints::Types::CreateWebhookEndpointRequestAPIVersion` — The API version (`Coss-Version`) events are rendered in for this endpoint. Each event carries it as `api_version`. Defaults to the version of the request that creates the endpoint.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_endpoints.<a href="/lib/Coss/webhook_endpoints/client.rb">get</a>(id:) -> Coss::Types::WebhookEndpoint</code></summary>
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

```ruby
client.webhook_endpoints.get(id: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_endpoints.<a href="/lib/Coss/webhook_endpoints/client.rb">delete</a>(id:) -> Coss::Types::DeletedWebhookEndpoint</code></summary>
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

```ruby
client.webhook_endpoints.delete(id: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_endpoints.<a href="/lib/Coss/webhook_endpoints/client.rb">update</a>(id:, request) -> Coss::Types::WebhookEndpoint</code></summary>
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

```ruby
client.webhook_endpoints.update(
  id: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  enabled: false
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**url:** `String` — An `https://` URL coss.com posts events to.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — A note for your own reference. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**event_types:** `Internal::Types::Array[Coss::WebhookEndpoints::Types::UpdateWebhookEndpointRequestEventTypesItem]` — Event types delivered to this endpoint. An empty array means every event type, including ones added later.
    
</dd>
</dl>

<dl>
<dd>

**api_version:** `Coss::WebhookEndpoints::Types::UpdateWebhookEndpointRequestAPIVersion` — The API version (`Coss-Version`) events are rendered in for this endpoint. Each event carries it as `api_version`.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `Internal::Types::Boolean` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_endpoints.<a href="/lib/Coss/webhook_endpoints/client.rb">roll_secret</a>(id:, request) -> Coss::Types::WebhookEndpointWithSecret</code></summary>
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

```ruby
client.webhook_endpoints.roll_secret(
  id: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  previous_secret_expires_in: 3600
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**previous_secret_expires_in:** `Integer` — Seconds the current secret keeps signing deliveries next to the new one, so receivers can switch without rejecting anything. Default 86400 (a day), at most 604800 (a week). `0` stops it immediately, e.g. after a leak.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_endpoints.<a href="/lib/Coss/webhook_endpoints/client.rb">recover</a>(id:, request) -> Coss::Types::WebhookEndpointRecovery</code></summary>
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

```ruby
client.webhook_endpoints.recover(
  id: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  since: "2026-01-15T09:00:00Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**since:** `String` — Requeue the endpoint's deliveries that failed and were created at or after this time (ISO 8601). Deliveries are kept for 30 days.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookListeners
<details><summary><code>client.webhook_listeners.<a href="/lib/Coss/webhook_listeners/client.rb">create</a>(request) -> Coss::Types::WebhookListener</code></summary>
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

```ruby
client.webhook_listeners.create(
  event_types: %w[email.sent email.delivered],
  description: "localhost:3000/webhooks"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event_types:** `Internal::Types::Array[Coss::WebhookListeners::Types::CreateWebhookListenerRequestEventTypesItem]` — Event types to receive. Defaults to every event type.
    
</dd>
</dl>

<dl>
<dd>

**api_version:** `Coss::WebhookListeners::Types::CreateWebhookListenerRequestAPIVersion` — The API version events are rendered in. Defaults to the version of the request that creates the listener.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Where the events go, for your own reference (shown in the log).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookListeners::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_listeners.<a href="/lib/Coss/webhook_listeners/client.rb">poll</a>(id:, request) -> Coss::Types::WebhookListenerPoll</code></summary>
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

```ruby
client.webhook_listeners.poll(
  id: "whlis_01k7c8m4q2f3e9v6t5r1n0p8yz",
  acks: [{
    delivery_id: "whlisdel_01k7c8n2b5d7f9h1k3m5p7r9tv",
    ack_token: "mfz3k2a8",
    status_code: 200,
    duration_ms: 12,
    error: nil
  }],
  wait_ms: 20000
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook listener's id.
    
</dd>
</dl>

<dl>
<dd>

**acks:** `Internal::Types::Array[Coss::Types::WebhookListenerAck]` — What happened to deliveries handed out earlier. A delivery is finished once acknowledged: a 2xx status (or none, with no error) succeeds; anything else fails. Neither is retried.
    
</dd>
</dl>

<dl>
<dd>

**wait_ms:** `Integer` — How long to wait for deliveries when none is pending, in milliseconds. Default 20000, at most 25000.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — The most deliveries to hand out. Default 10, at most 50.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookListeners::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_listeners.<a href="/lib/Coss/webhook_listeners/client.rb">delete</a>(id:) -> Coss::Types::DeletedWebhookListener</code></summary>
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

```ruby
client.webhook_listeners.delete(id: "whlis_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook listener's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookListeners::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookEvents
<details><summary><code>client.webhook_events.<a href="/lib/Coss/webhook_events/client.rb">test</a>(request) -> Coss::Types::WebhookTestEvent</code></summary>
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

```ruby
client.webhook_events.test(
  type: "email.bounced",
  data: {
    recipient: "ada@example.com"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**type:** `Coss::WebhookEvents::Types::CreateTestWebhookEventRequestType` — The event type. `domain.*`, `account.*`, `subaccount.*` and `billing.*` events only reach live environments, so they can't be tested in a sandbox one.
    
</dd>
</dl>

<dl>
<dd>

**data:** `Internal::Types::Hash[String, Object]` — Fields merged over the sample's `data` (objects field by field, anything else replaced), in the latest API version's shape: e.g. a real `email_id`, or the `recipient` your handler looks for. Unknown fields are refused.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEvents::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## SMS
<details><summary><code>client.sms.<a href="/lib/Coss/sms/client.rb">list</a>() -> Coss::Types::SmsList</code></summary>
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

```ruby
client.sms.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**to:** `String` — Only messages to this number.
    
</dd>
</dl>

<dl>
<dd>

**status:** `String` — Only messages in these statuses, comma-separated: `failed`.
    
</dd>
</dl>

<dl>
<dd>

**created_after:** `String` — Only messages created at or after this time.
    
</dd>
</dl>

<dl>
<dd>

**created_before:** `String` — Only messages created before this time.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.<a href="/lib/Coss/sms/client.rb">send_</a>(request) -> Coss::Types::Sms</code></summary>
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

```ruby
client.sms.send_(
  idempotency_key: "welcome-user-123",
  from: "+14155550123",
  to: "+14155550199",
  body: "Your Acme code is 482913",
  tags: [{
    name: "flow",
    value: "sign_in"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original message (with its current status) instead of sending again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**from:** `String` — One of your organization's phone numbers, in E.164 form. Sandbox environments accept any number.
    
</dd>
</dl>

<dl>
<dd>

**to:** `String` — The recipient's mobile number, in E.164 form.
    
</dd>
</dl>

<dl>
<dd>

**body:** `String` — The text. Messages are split into segments of 153 GSM-7 or 67 Unicode characters (152 or 66 from a toll-free number; 160 or 70 for a single one), each billed; at most 10 (1,520 GSM-7 or 660 Unicode characters).
    
</dd>
</dl>

<dl>
<dd>

**tags:** `Internal::Types::Array[Coss::Sms::Types::SendSmsRequestTagsItem]` — Up to 10 tags.
    
</dd>
</dl>

<dl>
<dd>

**scheduled_at:** `String` — Send at this time instead of now (ISO 8601 with an offset, at most 30 days ahead). A time that is not in the future sends immediately.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.<a href="/lib/Coss/sms/client.rb">get</a>(id:) -> Coss::Types::Sms</code></summary>
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

```ruby
client.sms.get(id: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The message's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.<a href="/lib/Coss/sms/client.rb">list_events</a>(id:) -> Coss::Types::SmsEventList</code></summary>
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

```ruby
client.sms.list_events(id: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The message's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.<a href="/lib/Coss/sms/client.rb">cancel</a>(id:) -> Coss::Types::Sms</code></summary>
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

```ruby
client.sms.cancel(id: "sms_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The message's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Verify
<details><summary><code>client.verify.<a href="/lib/Coss/verify/client.rb">list</a>() -> Coss::Types::VerificationList</code></summary>
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

```ruby
client.verify.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**to:** `String` — Only verifications to this destination.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Verify::Types::ListVerifyRequestStatus` — Only verifications in this status.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Verify::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.verify.<a href="/lib/Coss/verify/client.rb">start</a>(request) -> Coss::Types::Verification</code></summary>
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

```ruby
client.verify.start(
  idempotency_key: "welcome-user-123",
  to: "+14155550199",
  ip: "203.0.113.7",
  user_id: "user_42"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original verification instead of sending another code, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**to:** `String` — Where the code goes: a mobile number in E.164 form, or an email address. A pending verification to the same destination and channel is reused: its code is sent again.
    
</dd>
</dl>

<dl>
<dd>

**channel:** `Coss::Verify::Types::StartVerificationRequestChannel` — `sms` or `email`. Default: `sms` for a phone number, `email` for an address.
    
</dd>
</dl>

<dl>
<dd>

**ip:** `String` — The end user's IP address. The fraud guard uses it (velocity, Tor); recommended.
    
</dd>
</dl>

<dl>
<dd>

**user_id:** `String` — Your id for the end user, for the fraud guard's velocity and your Risk lists.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `Internal::Types::Array[Coss::Verify::Types::StartVerificationRequestTagsItem]` — Up to 10 tags.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Verify::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.verify.<a href="/lib/Coss/verify/client.rb">check</a>(request) -> Coss::Types::VerificationCheck</code></summary>
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

```ruby
client.verify.check(
  idempotency_key: "welcome-user-123",
  to: "+14155550199",
  code: "482913"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated check with the same key returns the same answer without spending another attempt. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**verification_id:** `String` — The verification to check. Give this or `to`.
    
</dd>
</dl>

<dl>
<dd>

**to:** `String` — The destination the code was sent to: checks its most recent verification. Give this or `verification_id`.
    
</dd>
</dl>

<dl>
<dd>

**code:** `String` — The code the end user entered.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Verify::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.verify.<a href="/lib/Coss/verify/client.rb">get</a>(id:) -> Coss::Types::Verification</code></summary>
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

```ruby
client.verify.get(id: "vrf_01k8e2m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The verification's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Verify::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.verify.<a href="/lib/Coss/verify/client.rb">cancel</a>(id:) -> Coss::Types::Verification</code></summary>
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

```ruby
client.verify.cancel(id: "vrf_01k8e2m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The verification's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Verify::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Forms
<details><summary><code>client.forms.<a href="/lib/Coss/forms/client.rb">list</a>() -> Coss::Types::FormList</code></summary>
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

```ruby
client.forms.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.forms.<a href="/lib/Coss/forms/client.rb">create</a>(request) -> Coss::Types::Form</code></summary>
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

```ruby
client.forms.create(
  name: "Contact us",
  allowed_origins: ["https://www.example.com"],
  notifications: {
    recipients: ["support@example.com"]
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — Your name for the form, shown in the dashboard and in notifications.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `Internal::Types::Boolean` — `false`: submissions are refused.
    
</dd>
</dl>

<dl>
<dd>

**fields:** `Internal::Types::Array[Coss::Types::FormFieldInput]` — The form's fields. `null` (default): any field is accepted. With fields, submissions are validated against them.
    
</dd>
</dl>

<dl>
<dd>

**strict_fields:** `Internal::Types::Boolean` — With `fields`: refuse fields the form doesn't define. Default false.
    
</dd>
</dl>

<dl>
<dd>

**allowed_origins:** `Internal::Types::Array[String]` — Sites that may post to the form, like `https://www.example.com` (sandbox environments also `http://localhost:<port>`). Empty (default): any.
    
</dd>
</dl>

<dl>
<dd>

**redirect_url:** `String` — Where browsers go after an HTML post. `null`: coss.com's thank-you page. A post's `_next` field overrides it when its origin is allowed.
    
</dd>
</dl>

<dl>
<dd>

**spam:** `Coss::Forms::Types::CreateFormRequestSpam` — How submissions are screened. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**submitter:** `Coss::Forms::Types::CreateFormRequestSubmitter` — Who the submitter is, and whether they must confirm by email. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `Coss::Forms::Types::CreateFormRequestNotifications` — Emails about accepted submissions. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**contacts:** `Coss::Forms::Types::CreateFormRequestContacts` — Turning submissions into contacts. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**files:** `Coss::Forms::Types::CreateFormRequestFiles` — File uploads. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**hosted:** `Coss::Forms::Types::CreateFormRequestHosted` — The page coss.com can serve for this form. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.forms.<a href="/lib/Coss/forms/client.rb">get</a>(id:) -> Coss::Types::Form</code></summary>
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

```ruby
client.forms.get(id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.forms.<a href="/lib/Coss/forms/client.rb">remove</a>(id:) -> Coss::Types::DeletedForm</code></summary>
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

```ruby
client.forms.remove(id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.forms.<a href="/lib/Coss/forms/client.rb">update</a>(id:, request) -> Coss::Types::Form</code></summary>
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

```ruby
client.forms.update(
  id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
  spam: {
    captcha: "required"
  },
  contacts: {
    enabled: true
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Your name for the form, shown in the dashboard and in notifications.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `Internal::Types::Boolean` — `false`: submissions are refused.
    
</dd>
</dl>

<dl>
<dd>

**fields:** `Internal::Types::Array[Coss::Types::FormFieldInput]` — The form's fields. `null` (default): any field is accepted. With fields, submissions are validated against them.
    
</dd>
</dl>

<dl>
<dd>

**strict_fields:** `Internal::Types::Boolean` — With `fields`: refuse fields the form doesn't define. Default false.
    
</dd>
</dl>

<dl>
<dd>

**allowed_origins:** `Internal::Types::Array[String]` — Sites that may post to the form, like `https://www.example.com` (sandbox environments also `http://localhost:<port>`). Empty (default): any.
    
</dd>
</dl>

<dl>
<dd>

**redirect_url:** `String` — Where browsers go after an HTML post. `null`: coss.com's thank-you page. A post's `_next` field overrides it when its origin is allowed.
    
</dd>
</dl>

<dl>
<dd>

**spam:** `Coss::Forms::Types::UpdateFormRequestSpam` — How submissions are screened. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**submitter:** `Coss::Forms::Types::UpdateFormRequestSubmitter` — Who the submitter is, and whether they must confirm by email. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `Coss::Forms::Types::UpdateFormRequestNotifications` — Emails about accepted submissions. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**contacts:** `Coss::Forms::Types::UpdateFormRequestContacts` — Turning submissions into contacts. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**files:** `Coss::Forms::Types::UpdateFormRequestFiles` — File uploads. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**hosted:** `Coss::Forms::Types::UpdateFormRequestHosted` — The page coss.com can serve for this form. Only the fields given change.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Reputation
<details><summary><code>client.reputation.<a href="/lib/Coss/reputation/client.rb">get</a>() -> Coss::Types::Reputation</code></summary>
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

```ruby
client.reputation.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Reputation::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Logs
<details><summary><code>client.logs.<a href="/lib/Coss/logs/client.rb">list</a>() -> Coss::Types::LogList</code></summary>
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

```ruby
client.logs.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**from:** `String` — Start of the range (inclusive). Defaults to an hour before `to`.
    
</dd>
</dl>

<dl>
<dd>

**to:** `String` — End of the range (exclusive). Defaults to now. At most 31 days.
    
</dd>
</dl>

<dl>
<dd>

**source:** `String` — Only these sources, comma-separated: `api,email,webhook`.
    
</dd>
</dl>

<dl>
<dd>

**level:** `String` — Only these levels, comma-separated: `warning,error`.
    
</dd>
</dl>

<dl>
<dd>

**type:** `String` — Only these types, e.g. `email.bounced,email.complained`.
    
</dd>
</dl>

<dl>
<dd>

**status:** `String` — Only these status codes or classes, e.g. `4xx,503`.
    
</dd>
</dl>

<dl>
<dd>

**method_:** `String` — Only these HTTP methods, e.g. `POST`.
    
</dd>
</dl>

<dl>
<dd>

**route:** `String` — Only these routes, e.g. `/v1/emails/:id`.
    
</dd>
</dl>

<dl>
<dd>

**api_key_id:** `String` — Only requests made with these API keys.
    
</dd>
</dl>

<dl>
<dd>

**request_id:** `String` — Only this request's lines.
    
</dd>
</dl>

<dl>
<dd>

**resource_id:** `String` — Only lines about this resource, e.g. an `email_…` id.
    
</dd>
</dl>

<dl>
<dd>

**q:** `String` — Free text, matched against the message, path, ids and recipient.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last line of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Logs::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.logs.<a href="/lib/Coss/logs/client.rb">get</a>(id:) -> Coss::Types::Log</code></summary>
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

```ruby
client.logs.get(id: "log_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The log line's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Logs::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## AuditEvents
<details><summary><code>client.audit_events.<a href="/lib/Coss/audit_events/client.rb">list</a>() -> Coss::Types::AuditEventList</code></summary>
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

```ruby
client.audit_events.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**action:** `String` — Only these actions, comma-separated. An entry ending in `.` matches every action of that resource: `domain.,api_key.created`.
    
</dd>
</dl>

<dl>
<dd>

**actor_type:** `String` — Only these actor types, e.g. `user,api_key`.
    
</dd>
</dl>

<dl>
<dd>

**actor_id:** `String` — Only changes made by this user or API key.
    
</dd>
</dl>

<dl>
<dd>

**target_id:** `String` — Only changes to this resource, e.g. a `dom_…` id.
    
</dd>
</dl>

<dl>
<dd>

**environment_id:** `String` — Only changes in this environment.
    
</dd>
</dl>

<dl>
<dd>

**from:** `String` — Only events at or after this time.
    
</dd>
</dl>

<dl>
<dd>

**to:** `String` — Only events before this time.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last event of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::AuditEvents::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.audit_events.<a href="/lib/Coss/audit_events/client.rb">get</a>(id:) -> Coss::Types::AuditEvent</code></summary>
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

```ruby
client.audit_events.get(id: "oaudit_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The audit event's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::AuditEvents::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing
<details><summary><code>client.billing.<a href="/lib/Coss/billing/client.rb">get</a>() -> Coss::Types::Billing</code></summary>
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

```ruby
client.billing.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Billing::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.billing.<a href="/lib/Coss/billing/client.rb">usage</a>() -> Coss::Types::UsageList</code></summary>
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

```ruby
client.billing.usage
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**from:** `String` — Start (inclusive). Defaults to the start of the current billing month.
    
</dd>
</dl>

<dl>
<dd>

**to:** `String` — End (exclusive). Defaults to now. At most 400 days after `from` (7 by hour).
    
</dd>
</dl>

<dl>
<dd>

**granularity:** `Coss::Billing::Types::UsageBillingRequestGranularity` — Bucket size (UTC). Defaults to `day`.
    
</dd>
</dl>

<dl>
<dd>

**group_by:** `Coss::Billing::Types::UsageBillingRequestGroupBy` — Split each bucket per environment, project, API key or user (the member whose personal key it was).
    
</dd>
</dl>

<dl>
<dd>

**meter:** `Coss::Billing::Types::UsageBillingRequestMeter` — Only this meter.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Billing::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Log drains
<details><summary><code>client.log_drains.<a href="/lib/Coss/log_drains/client.rb">list</a>() -> Coss::Types::LogDrainList</code></summary>
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

```ruby
client.log_drains.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::LogDrains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.log_drains.<a href="/lib/Coss/log_drains/client.rb">create</a>(request) -> Coss::Types::LogDrainWithSecret</code></summary>
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

```ruby
client.log_drains.create(
  url: "https://logs.example.com/coss",
  description: "Production logs",
  sources: %w[api email]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**url:** `String` — An `https://` URL coss.com posts batches of log lines to.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — A note for your own reference. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**sources:** `Internal::Types::Array[Coss::Types::LogDrainSource]` — What the drain forwards: `api` (requests made with the environment's API keys), `email` (email events), `webhook` (webhook delivery attempts) and `audit` (changes to the environment, from the organization's audit log). An empty array means every source, including ones added later. Defaults to every source.
    
</dd>
</dl>

<dl>
<dd>

**format:** `Coss::LogDrains::Types::CreateLogDrainRequestFormat` — How batches are encoded. `ndjson`: one JSON object per line (`application/x-ndjson`), for your own endpoint. `loki`: Loki's push API (`/loki/api/v1/push`, Grafana Cloud Logs). `datadog`: Datadog's log intake (`/api/v2/logs`). `otlp`: OTLP/HTTP logs in JSON (`/v1/logs`, Grafana Cloud, Honeycomb, an OpenTelemetry Collector…). Defaults to `ndjson`.
    
</dd>
</dl>

<dl>
<dd>

**auth_header:** `Coss::Types::LogDrainAuthHeader` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::LogDrains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.log_drains.<a href="/lib/Coss/log_drains/client.rb">get</a>(id:) -> Coss::Types::LogDrain</code></summary>
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

```ruby
client.log_drains.get(id: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The log drain's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::LogDrains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.log_drains.<a href="/lib/Coss/log_drains/client.rb">delete</a>(id:) -> Coss::Types::DeletedLogDrain</code></summary>
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

```ruby
client.log_drains.delete(id: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The log drain's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::LogDrains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.log_drains.<a href="/lib/Coss/log_drains/client.rb">update</a>(id:, request) -> Coss::Types::LogDrain</code></summary>
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

```ruby
client.log_drains.update(
  id: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
  enabled: false
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The log drain's id.
    
</dd>
</dl>

<dl>
<dd>

**url:** `String` — An `https://` URL coss.com posts batches of log lines to.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — A note for your own reference. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**sources:** `Internal::Types::Array[Coss::Types::LogDrainSource]` — What the drain forwards: `api` (requests made with the environment's API keys), `email` (email events), `webhook` (webhook delivery attempts) and `audit` (changes to the environment, from the organization's audit log). An empty array means every source, including ones added later.
    
</dd>
</dl>

<dl>
<dd>

**format:** `Coss::Types::LogDrainFormat` 
    
</dd>
</dl>

<dl>
<dd>

**auth_header:** `Coss::Types::LogDrainAuthHeader` 
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `Internal::Types::Boolean` — `false` disables it, and `true` enables it again.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::LogDrains::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes
<details><summary><code>client.inboxes.<a href="/lib/Coss/inboxes/client.rb">list</a>() -> Coss::Types::InboxList</code></summary>
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

```ruby
client.inboxes.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.<a href="/lib/Coss/inboxes/client.rb">create</a>(request) -> Coss::Types::Inbox</code></summary>
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

```ruby
client.inboxes.create(
  username: "support-agent",
  display_name: "Acme Support",
  client_id: "agent-42"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**username:** `String` — The part before the @. Omit it for a random one. Mail to `username+anything@domain` reaches the inbox too.
    
</dd>
</dl>

<dl>
<dd>

**domain:** `String` — One of the environment's receiving domains (its hostname). Omit it for the environment's own domain under coss.com's inbound domain, which needs no DNS setup.
    
</dd>
</dl>

<dl>
<dd>

**display_name:** `String` — The name messages from the inbox are sent with.
    
</dd>
</dl>

<dl>
<dd>

**client_id:** `String` — Your own id for the inbox (unique per environment). Creating an inbox with a `client_id` that already has one returns that inbox instead (200), so retries and "one inbox per user" need no bookkeeping.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.<a href="/lib/Coss/inboxes/client.rb">get</a>(inbox_id:) -> Coss::Types::Inbox</code></summary>
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

```ruby
client.inboxes.get(inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.<a href="/lib/Coss/inboxes/client.rb">delete</a>(inbox_id:) -> Coss::Types::DeletedInbox</code></summary>
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

```ruby
client.inboxes.delete(inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.<a href="/lib/Coss/inboxes/client.rb">update</a>(inbox_id:, request) -> Coss::Types::Inbox</code></summary>
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

```ruby
client.inboxes.update(
  inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
  display_name: "Acme Help"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**display_name:** `String` — The name messages are sent with; `null` sends with the bare address.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk
<details><summary><code>client.risk.<a href="/lib/Coss/risk/client.rb">assess</a>(request) -> Coss::Types::RiskAssessment</code></summary>
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

```ruby
client.risk.assess(
  idempotency_key: "welcome-user-123",
  event: "signup",
  user: {
    email: "ada@gmail.con"
  },
  ip: "203.0.113.7",
  user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original assessment instead of assessing (and counting) the event again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**event:** `Coss::Types::RiskEvent` 
    
</dd>
</dl>

<dl>
<dd>

**event_name:** `String` — Required for `custom` events (e.g. `invite_sent`), not allowed otherwise.
    
</dd>
</dl>

<dl>
<dd>

**user:** `Coss::Risk::Types::CreateRiskAssessmentRequestUser` 
    
</dd>
</dl>

<dl>
<dd>

**ip:** `String` — The client's IP address (not your server's or proxy's).
    
</dd>
</dl>

<dl>
<dd>

**user_agent:** `String` — The client's user agent.
    
</dd>
</dl>

<dl>
<dd>

**captcha:** `Coss::Risk::Types::CreateRiskAssessmentRequestCaptcha` 
    
</dd>
</dl>

<dl>
<dd>

**checkout:** `Coss::Types::RiskCheckoutRequest` 
    
</dd>
</dl>

<dl>
<dd>

**device:** `Coss::Risk::Types::CreateRiskAssessmentRequestDevice` — The browser the event came from: recognizes it across accounts (`duplicate.device`, device velocity, fraud memory) and spots automation.
    
</dd>
</dl>

<dl>
<dd>

**content:** `Coss::Risk::Types::CreateRiskAssessmentRequestContent` — Content to classify with the event. Its scores go in `signals.content` and rules can test them; `content.*` reasons fire only at thresholds you set.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.<a href="/lib/Coss/risk/client.rb">feedback</a>(id:, request) -> Coss::Types::RiskAssessment</code></summary>
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

```ruby
client.risk.feedback(
  id: "rsk_01k7c8m4q2f3e9v6t5r1n0p8yz",
  outcome: "fraud"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The assessment's id.
    
</dd>
</dl>

<dl>
<dd>

**outcome:** `Coss::Types::RiskOutcome` 
    
</dd>
</dl>

<dl>
<dd>

**note:** `String` — For your team; never shared.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.<a href="/lib/Coss/risk/client.rb">calibration</a>() -> Coss::Types::RiskCalibration</code></summary>
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

```ruby
client.risk.calibration
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Risk::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.<a href="/lib/Coss/risk/client.rb">check_email</a>(request) -> Coss::Types::RiskEmailCheck</code></summary>
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

```ruby
client.risk.check_email(email: "ada@gnail.com")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `String` — The address to check, as given.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.<a href="/lib/Coss/risk/client.rb">check_ip</a>(request) -> Coss::Types::RiskIPCheck</code></summary>
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

```ruby
client.risk.check_ip(ip: "185.220.101.1")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**ip:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.<a href="/lib/Coss/risk/client.rb">check_phone</a>(request) -> Coss::Types::RiskPhoneCheck</code></summary>
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

```ruby
client.risk.check_phone(phone: "+14155550123")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**phone:** `String` — The number in E.164 (`+14155550123`); spaces, dashes, dots and brackets are ignored. Anything else is `valid: false`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.<a href="/lib/Coss/risk/client.rb">classify</a>(request) -> Coss::Types::RiskContentClassification</code></summary>
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

```ruby
client.risk.classify(text: "Earn $5,000 a week from home! DM me on Telegram: t.me/fast-cash")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**text:** `String` — The text to classify (a profile bio, a comment, a listing). The model reads the first 8,000 characters.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.<a href="/lib/Coss/risk/client.rb">limit</a>(request) -> Coss::Types::RiskLimit</code></summary>
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

```ruby
client.risk.limit(
  idempotency_key: "welcome-user-123",
  bucket: "password_reset",
  key: "ada@example.com"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated allowed check with the same key is answered again without taking more tokens, for an hour. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**bucket:** `String` — The bucket's name.
    
</dd>
</dl>

<dl>
<dd>

**key:** `String` — Who or what is limited: a user id, an email address, an IP address… coss.com keeps only a keyed hash of it.
    
</dd>
</dl>

<dl>
<dd>

**cost:** `Integer` — Tokens this request takes. Default 1.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing Invoices
<details><summary><code>client.billing.invoices.<a href="/lib/Coss/billing/invoices/client.rb">list</a>() -> Coss::Types::InvoiceList</code></summary>
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

```ruby
client.billing.invoices.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `Coss::Billing::Invoices::Types::ListInvoicesRequestStatus` — Only invoices in this status.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Continue after this id (the last of the previous page).
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — At most this many (default 20).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Billing::Invoices::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.billing.invoices.<a href="/lib/Coss/billing/invoices/client.rb">get</a>(id:) -> Coss::Types::Invoice</code></summary>
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

```ruby
client.billing.invoices.get(id: "inv_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The invoice's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Billing::Invoices::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Billing Credits
<details><summary><code>client.billing.credits.<a href="/lib/Coss/billing/credits/client.rb">list</a>() -> Coss::Types::CreditList</code></summary>
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

```ruby
client.billing.credits.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `Coss::Billing::Credits::Types::ListCreditsRequestStatus` — `active` (default): usable now or later, with something left; `all`: every credit, newest first.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Continue after this id (the last of the previous page).
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — At most this many (default 20).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Billing::Credits::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Tracking
<details><summary><code>client.domains.tracking.<a href="/lib/Coss/domains/tracking/client.rb">create</a>(id:, request) -> Coss::Types::Domain</code></summary>
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

```ruby
client.domains.tracking.create(
  id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
  hostname: "links.acme.com"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**hostname:** `String` — A subdomain of the domain to serve tracking links from, without a scheme or path. Point it at coss.com with the CNAME record the response lists.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::Tracking::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.domains.tracking.<a href="/lib/Coss/domains/tracking/client.rb">delete</a>(id:) -> Coss::Types::Domain</code></summary>
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

```ruby
client.domains.tracking.delete(id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::Tracking::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Receiving
<details><summary><code>client.domains.receiving.<a href="/lib/Coss/domains/receiving/client.rb">create</a>(id:, request) -> Coss::Types::Domain</code></summary>
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

```ruby
client.domains.receiving.create(
  id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
  hostname: "inbound.acme.com"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**hostname:** `String` — The domain itself or a subdomain of it, without a scheme or path. Point its MX at coss.com with the record the response lists. Using the domain itself moves all of its mail to coss.com, so a subdomain is usually the better choice.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::Receiving::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.domains.receiving.<a href="/lib/Coss/domains/receiving/client.rb">delete</a>(id:) -> Coss::Types::Domain</code></summary>
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

```ruby
client.domains.receiving.delete(id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::Receiving::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Dmarc
<details><summary><code>client.domains.dmarc.<a href="/lib/Coss/domains/dmarc/client.rb">get</a>(id:) -> Coss::Types::DomainDmarc</code></summary>
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

```ruby
client.domains.dmarc.get(id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::Dmarc::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Domains Dmarc Reports
<details><summary><code>client.domains.dmarc.reports.<a href="/lib/Coss/domains/dmarc/reports/client.rb">list</a>(id:) -> Coss::Types::DmarcReportList</code></summary>
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

```ruby
client.domains.dmarc.reports.list(id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last report of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::Dmarc::Reports::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.domains.dmarc.reports.<a href="/lib/Coss/domains/dmarc/reports/client.rb">get</a>(id:, report_id:) -> Coss::Types::DmarcReport</code></summary>
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

```ruby
client.domains.dmarc.reports.get(
  id: "dom_01k7c8m4q2f3e9v6t5r1n0p8yz",
  report_id: "dmarcrep_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The domain's id.
    
</dd>
</dl>

<dl>
<dd>

**report_id:** `String` — The report's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Domains::Dmarc::Reports::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Templates
<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">list</a>() -> Coss::Types::EmailTemplateList</code></summary>
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

```ruby
client.email.templates.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last template of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">create</a>(request) -> Coss::Types::EmailTemplate</code></summary>
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

```ruby
client.email.templates.create(
  name: "Welcome",
  alias_: "welcome",
  default_locale: "en",
  variables: [{
    name: "first_name",
    type: "string",
    required: true
  }],
  sample_variables: {
    first_name: "Ada"
  },
  contents: [{
    locale: "en",
    subject: "Welcome, {{first_name}}",
    html: "<p>Hi {{first_name}}, thanks for signing up!</p>"
  }, {
    locale: "de",
    subject: "Willkommen, {{first_name}}",
    html: "<p>Hallo {{first_name}}, danke für deine Anmeldung!</p>"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — Shown in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**alias_:** `String` — A name to send the template by instead of its id, e.g. `welcome`: the same alias can be used in every environment.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Your note about it, shown in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**default_locale:** `String` — The locale sends fall back to when they ask for none, or for one without content. Defaults to the first entry of `contents` (or "en").
    
</dd>
</dl>

<dl>
<dd>

**variables:** `Internal::Types::Array[Coss::Types::TemplateVariableInput]` — The variables the template uses, with their types.
    
</dd>
</dl>

<dl>
<dd>

**sample_variables:** `Internal::Types::Hash[String, Object]` — Example values for previews and test sends in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**contents:** `Internal::Types::Array[Coss::Types::TemplateContentInput]` — The subject, HTML and text per locale.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">get</a>(id:) -> Coss::Types::EmailTemplate</code></summary>
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

```ruby
client.email.templates.get(id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">delete</a>(id:) -> Coss::Types::DeletedEmailTemplate</code></summary>
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

```ruby
client.email.templates.delete(id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">update</a>(id:, request) -> Coss::Types::EmailTemplate</code></summary>
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

```ruby
client.email.templates.update(
  id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  name: "Welcome (new users)"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Shown in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**alias_:** `String` — `null` removes the alias.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Your note about it. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">get_draft</a>(id:) -> Coss::Types::EmailTemplateVersion</code></summary>
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

```ruby
client.email.templates.get_draft(id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">update_draft</a>(id:, request) -> Coss::Types::EmailTemplateVersion</code></summary>
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

```ruby
client.email.templates.update_draft(
  id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  revision: 3,
  default_locale: "en",
  variables: [{
    name: "first_name",
    type: "string",
    required: true
  }],
  sample_variables: {
    first_name: "Ada"
  },
  contents: [{
    locale: "en",
    subject: "Welcome, {{first_name}}",
    html: "<p>Hi {{first_name}}, thanks for signing up!</p>"
  }, {
    locale: "de",
    subject: "Willkommen, {{first_name}}",
    html: "<p>Hallo {{first_name}}, danke für deine Anmeldung!</p>"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**revision:** `Integer` — The draft `revision` you read. When given, the request is refused (`template_revision_mismatch`) if the draft changed since.
    
</dd>
</dl>

<dl>
<dd>

**default_locale:** `String` — The locale sends fall back to when they ask for none, or for one without content. Defaults to the first entry of `contents` (or "en").
    
</dd>
</dl>

<dl>
<dd>

**variables:** `Internal::Types::Array[Coss::Types::TemplateVariableInput]` — The variables the template uses, with their types.
    
</dd>
</dl>

<dl>
<dd>

**sample_variables:** `Internal::Types::Hash[String, Object]` — Example values for previews and test sends in the dashboard.
    
</dd>
</dl>

<dl>
<dd>

**contents:** `Internal::Types::Array[Coss::Types::TemplateContentInput]` — The subject, HTML and text per locale.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">publish</a>(id:, request) -> Coss::Types::EmailTemplateVersion</code></summary>
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

```ruby
client.email.templates.publish(
  id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  revision: 3
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**revision:** `Integer` — The draft `revision` you read. When given, the request is refused (`template_revision_mismatch`) if the draft changed since.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.<a href="/lib/Coss/email/templates/client.rb">render</a>(id:, request) -> Coss::Types::RenderedEmailTemplate</code></summary>
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

```ruby
client.email.templates.render(
  id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  locale: "en",
  variables: {
    first_name: "Ada"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**version:** `Integer` — A published version to render. Default: the draft.
    
</dd>
</dl>

<dl>
<dd>

**locale:** `String` — The locale to render, e.g. "pt-BR". Falls back to the language ("pt"), then to the default locale, as sends do.
    
</dd>
</dl>

<dl>
<dd>

**variables:** `Internal::Types::Hash[String, Object]` — Values by variable name, checked as a send checks them. Default: `sample_variables`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email DedicatedIps
<details><summary><code>client.email.dedicated_ips.<a href="/lib/Coss/email/dedicated_ips/client.rb">get</a>() -> Coss::Types::DedicatedIPPool</code></summary>
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

```ruby
client.email.dedicated_ips.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Email::DedicatedIps::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Suppressions
<details><summary><code>client.email.suppressions.<a href="/lib/Coss/email/suppressions/client.rb">list</a>() -> Coss::Types::SuppressionList</code></summary>
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

```ruby
client.email.suppressions.list(subaccount: "user_8812")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — List a sub-account's own list (its id or your uid) instead of the environment's.
    
</dd>
</dl>

<dl>
<dd>

**address:** `String` — Only entries for this address.
    
</dd>
</dl>

<dl>
<dd>

**scope:** `Coss::Types::ListSuppressionsRequestScope` — Only entries with this scope.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last entry of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.suppressions.<a href="/lib/Coss/email/suppressions/client.rb">add</a>(request) -> Coss::Types::Suppression</code></summary>
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

```ruby
client.email.suppressions.add(
  address: "user@example.com",
  scope: "marketing"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**address:** `String` — The address to suppress. Display names are ignored; matching is case-insensitive.
    
</dd>
</dl>

<dl>
<dd>

**scope:** `Coss::Email::Suppressions::Types::CreateSuppressionRequestScope` — Defaults to `*` (every email). Pass a category, e.g. "marketing", to only skip those.
    
</dd>
</dl>

<dl>
<dd>

**subaccount:** `String` — Add it to a sub-account's own list (its id or your uid) instead of the environment's.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.suppressions.<a href="/lib/Coss/email/suppressions/client.rb">check</a>() -> Coss::Types::SuppressionCheck</code></summary>
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

```ruby
client.email.suppressions.check(address: "user@example.com")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**address:** `String` — The address to check.
    
</dd>
</dl>

<dl>
<dd>

**category:** `String` — The category of the email you plan to send. Without it, only `*` entries count.
    
</dd>
</dl>

<dl>
<dd>

**stream:** `Coss::Email::Suppressions::Types::CheckSuppressionsRequestStream` — The stream of the email you plan to send (default `transactional`). `marketing` also counts `stream:marketing` entries.
    
</dd>
</dl>

<dl>
<dd>

**subaccount:** `String` — The sub-account you plan to send for (its id or your uid): its own entries count too.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.suppressions.<a href="/lib/Coss/email/suppressions/client.rb">import</a>(request) -> Coss::Types::SuppressionImport</code></summary>
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

```ruby
client.email.suppressions.import(suppressions: [{
  address: "user@example.com"
}, {
  address: "other@example.com",
  scope: "marketing"
}])
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — Import into a sub-account's own list (its id or your uid) instead of the environment's.
    
</dd>
</dl>

<dl>
<dd>

**suppressions:** `Internal::Types::Array[Coss::Email::Suppressions::Types::ImportSuppressionsRequestSuppressionsItem]` — 1-1000 entries. Each one is validated on its own: invalid entries are skipped and reported in `invalid`, the rest are imported.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.suppressions.<a href="/lib/Coss/email/suppressions/client.rb">export</a>() -> String</code></summary>
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

```ruby
client.email.suppressions.export
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — Export a sub-account's own list (its id or your uid) instead of the environment's.
    
</dd>
</dl>

<dl>
<dd>

**scope:** `Coss::Types::ExportSuppressionsRequestScope` — Only entries with this scope.
    
</dd>
</dl>

<dl>
<dd>

**reason:** `Coss::Email::Suppressions::Types::ExportSuppressionsRequestReason` — Only entries with this reason.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.suppressions.<a href="/lib/Coss/email/suppressions/client.rb">get</a>(id:) -> Coss::Types::Suppression</code></summary>
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

```ruby
client.email.suppressions.get(id: "sup_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The suppression's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.suppressions.<a href="/lib/Coss/email/suppressions/client.rb">remove</a>(id:) -> Coss::Types::DeletedSuppression</code></summary>
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

```ruby
client.email.suppressions.remove(id: "sup_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The suppression's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Subaccounts
<details><summary><code>client.email.subaccounts.<a href="/lib/Coss/email/subaccounts/client.rb">list</a>() -> Coss::Types::SubaccountList</code></summary>
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

```ruby
client.email.subaccounts.list(after: "sub_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — The last `id` of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Subaccounts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.subaccounts.<a href="/lib/Coss/email/subaccounts/client.rb">create</a>(request) -> Coss::Types::Subaccount</code></summary>
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

```ruby
client.email.subaccounts.create(
  name: "Acme Bakery",
  uid: "user_8812",
  quotas: {
    recipients_per_day: 5000
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — A name for your own reference.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `String` — Your own id for it, to address it by instead of its `id`.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    
</dd>
</dl>

<dl>
<dd>

**quotas:** `Coss::Email::Subaccounts::Types::CreateSubaccountRequestQuotas` — Fields left out keep their value; `null` removes a quota.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Subaccounts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.subaccounts.<a href="/lib/Coss/email/subaccounts/client.rb">get</a>(subaccount:) -> Coss::Types::Subaccount</code></summary>
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

```ruby
client.email.subaccounts.get(subaccount: "user_8812")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Subaccounts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.subaccounts.<a href="/lib/Coss/email/subaccounts/client.rb">delete</a>(subaccount:) -> Coss::Types::Subaccount</code></summary>
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

```ruby
client.email.subaccounts.delete(subaccount: "user_8812")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Subaccounts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.subaccounts.<a href="/lib/Coss/email/subaccounts/client.rb">update</a>(subaccount:, request) -> Coss::Types::Subaccount</code></summary>
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

```ruby
client.email.subaccounts.update(
  subaccount: "user_8812",
  status: "disabled"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Your name for it.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `String` — `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Replaces the metadata.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Email::Subaccounts::Types::UpdateSubaccountRequestStatus` — `disabled` refuses its sends until it is `active` again.
    
</dd>
</dl>

<dl>
<dd>

**quotas:** `Coss::Email::Subaccounts::Types::UpdateSubaccountRequestQuotas` — Fields left out keep their value; `null` removes a quota.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Subaccounts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.subaccounts.<a href="/lib/Coss/email/subaccounts/client.rb">reinstate</a>(subaccount:) -> Coss::Types::Subaccount</code></summary>
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

```ruby
client.email.subaccounts.reinstate(subaccount: "user_8812")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Subaccounts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.subaccounts.<a href="/lib/Coss/email/subaccounts/client.rb">stats</a>(subaccount:) -> Coss::Types::SubaccountStats</code></summary>
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

```ruby
client.email.subaccounts.stats(
  subaccount: "user_8812",
  from: "2026-10-01",
  to: "2026-10-15"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**subaccount:** `String` — The sub-account's `id` (`sub_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**from:** `String` — First day (UTC, `YYYY-MM-DD`); default 30 days before `to`.
    
</dd>
</dl>

<dl>
<dd>

**to:** `String` — Last day (UTC, `YYYY-MM-DD`), included; default today.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Subaccounts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Tracking
<details><summary><code>client.email.tracking.<a href="/lib/Coss/email/tracking/client.rb">get</a>() -> Coss::Types::TrackingSettings</code></summary>
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

```ruby
client.email.tracking.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Email::Tracking::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.tracking.<a href="/lib/Coss/email/tracking/client.rb">remove_default</a>() -> Coss::Types::DeletedTrackingRule</code></summary>
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

```ruby
client.email.tracking.remove_default
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Email::Tracking::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.tracking.<a href="/lib/Coss/email/tracking/client.rb">update_default</a>(request) -> Coss::Types::TrackingRule</code></summary>
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

```ruby
client.email.tracking.update_default(
  opens: false,
  clicks: false
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Coss::Types::UpdateTrackingRuleRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Tracking::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.tracking.<a href="/lib/Coss/email/tracking/client.rb">remove_category</a>(category:) -> Coss::Types::DeletedTrackingRule</code></summary>
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

```ruby
client.email.tracking.remove_category(category: "password-reset")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**category:** `String` — The category, as sent in `category`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Tracking::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.tracking.<a href="/lib/Coss/email/tracking/client.rb">update_category</a>(category:, request) -> Coss::Types::TrackingRule</code></summary>
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

```ruby
client.email.tracking.update_category(
  category: "password-reset",
  opens: false,
  clicks: false
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**category:** `String` — The category, as sent in `category`.
    
</dd>
</dl>

<dl>
<dd>

**request:** `Coss::Types::UpdateTrackingRuleRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Tracking::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Storage
<details><summary><code>client.email.storage.<a href="/lib/Coss/email/storage/client.rb">get</a>() -> Coss::Types::StorageSettings</code></summary>
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

```ruby
client.email.storage.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Email::Storage::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.storage.<a href="/lib/Coss/email/storage/client.rb">update</a>(request) -> Coss::Types::StorageSettings</code></summary>
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

```ruby
client.email.storage.update(content_storage: "discard")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**content_storage:** `Coss::Email::Storage::Types::UpdateStorageSettingsRequestContentStorage` — `store` keeps emails' content; `discard` clears it once they are sent.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Storage::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Contacts
<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">list</a>() -> Coss::Types::ContactList</code></summary>
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

```ruby
client.email.contacts.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `String` — Only the contact with this address.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Email::Contacts::Types::ListContactsRequestStatus` 
    
</dd>
</dl>

<dl>
<dd>

**audience_id:** `String` — Only members of this audience.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last contact of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">upsert</a>(request) -> Coss::Types::Contact</code></summary>
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

```ruby
client.email.contacts.upsert(
  email: "ada@example.com",
  first_name: "Ada",
  properties: {
    plan: "pro"
  },
  topics: [{
    topic: "newsletter",
    status: "opted_in"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `String` — The contact's address. Display names are ignored; matching is case-insensitive.
    
</dd>
</dl>

<dl>
<dd>

**first_name:** `String` — Their first name. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**last_name:** `String` — Their last name. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**properties:** `Internal::Types::Hash[String, Coss::Email::Contacts::Types::UpsertContactRequestPropertiesValue]` — Custom properties by key (define them first, see contact properties). Merged into the contact's existing properties; `null` removes one.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Email::Contacts::Types::UpsertContactRequestStatus` — Sets the contact's consent. Omitted, a new contact is `subscribed` and an existing one keeps its status.
    
</dd>
</dl>

<dl>
<dd>

**audience_ids:** `Internal::Types::Array[String]` — Audiences to add the contact to (it stays in the others).
    
</dd>
</dl>

<dl>
<dd>

**topics:** `Internal::Types::Array[Coss::Email::Contacts::Types::UpsertContactRequestTopicsItem]` — Choices per topic; topics left out keep the contact's choice.
    
</dd>
</dl>

<dl>
<dd>

**double_opt_in:** `Internal::Types::Boolean` — Ask the contact to confirm first (default: the marketing settings' `double_opt_in_default`): a new or unsubscribed contact becomes `pending` and gets a confirmation email; it is `subscribed` once they click its link. Can't be combined with `status: "subscribed"`, nor can the default (pass `false` to subscribe directly).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">resend_confirmation</a>(id:) -> Coss::Types::ContactConfirmation</code></summary>
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

```ruby
client.email.contacts.resend_confirmation(id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">create_preference_links</a>(id:, request) -> Coss::Types::PreferenceLinks</code></summary>
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

```ruby
client.email.contacts.create_preference_links(
  id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
  topic: "newsletter"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**topic:** `String` — The topic your email is about: its unsubscribe link leaves just that topic.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">import</a>(request) -> Coss::Types::ContactImport</code></summary>
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

```ruby
client.email.contacts.import(contacts: [{
  email: "ada@example.com",
  first_name: "Ada",
  properties: {
    plan: "pro"
  }
}, {
  email: "grace@example.com",
  status: "unsubscribed"
}])
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**contacts:** `Internal::Types::Array[Coss::Email::Contacts::Types::ImportContactsRequestContactsItem]` — The contacts to create or update, at most 1,000.
    
</dd>
</dl>

<dl>
<dd>

**audience_id:** `String` — Adds every imported contact to this audience.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">export</a>() -> String</code></summary>
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

```ruby
client.email.contacts.export
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `Coss::Email::Contacts::Types::ExportContactsRequestStatus` 
    
</dd>
</dl>

<dl>
<dd>

**audience_id:** `String` — Only members of this audience.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">get</a>(id:) -> Coss::Types::Contact</code></summary>
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

```ruby
client.email.contacts.get(id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">remove</a>(id:) -> Coss::Types::DeletedContact</code></summary>
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

```ruby
client.email.contacts.remove(id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">update</a>(id:, request) -> Coss::Types::Contact</code></summary>
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

```ruby
client.email.contacts.update(
  id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
  last_name: "Byron",
  properties: {
    seats: nil
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**first_name:** `String` — Their first name. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**last_name:** `String` — Their last name. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**properties:** `Internal::Types::Hash[String, Coss::Email::Contacts::Types::UpdateContactRequestPropertiesValue]` — Custom properties by key (define them first, see contact properties). Merged into the contact's existing properties; `null` removes one.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Email::Contacts::Types::UpdateContactRequestStatus` — Sets the contact's consent. Omitted, a new contact is `subscribed` and an existing one keeps its status.
    
</dd>
</dl>

<dl>
<dd>

**topics:** `Internal::Types::Array[Coss::Email::Contacts::Types::UpdateContactRequestTopicsItem]` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">get_topics</a>(id:) -> Coss::Types::ContactTopics</code></summary>
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

```ruby
client.email.contacts.get_topics(id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.<a href="/lib/Coss/email/contacts/client.rb">update_topics</a>(id:, request) -> Coss::Types::ContactTopics</code></summary>
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

```ruby
client.email.contacts.update_topics(
  id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz",
  topics: [{
    topic: "product",
    status: "opted_out"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**topics:** `Internal::Types::Array[Coss::Email::Contacts::Types::UpdateContactTopicsRequestTopicsItem]` — The contact's choices per topic. Topics not listed keep theirs.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Broadcasts
<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">list</a>() -> Coss::Types::BroadcastList</code></summary>
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

```ruby
client.email.broadcasts.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `Coss::Email::Broadcasts::Types::ListBroadcastsRequestStatus` 
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last broadcast of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">create</a>(request) -> Coss::Types::Broadcast</code></summary>
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

```ruby
client.email.broadcasts.create(
  idempotency_key: "welcome-user-123",
  name: "October newsletter",
  segment_id: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
  topic: "newsletter",
  from: "Acme <news@acme.com>",
  subject: "What's new, {{{contact.first_name|there}}}",
  html: "<p>Hi {{{contact.first_name|there}}},</p><p>…</p><p><a href=\"{{{unsubscribe_url}}}\">Unsubscribe</a></p>",
  scheduled_at: "2026-10-20T09:00:00Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the broadcast created first instead of creating another, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Shown only to you.
    
</dd>
</dl>

<dl>
<dd>

**audience_id:** `String` — Send to this audience…
    
</dd>
</dl>

<dl>
<dd>

**segment_id:** `String` — …or to this segment (one of the two).
    
</dd>
</dl>

<dl>
<dd>

**topic:** `String` — The topic the broadcast is about (its key): only contacts it reaches get it, and its unsubscribe link leaves just that topic. It is the emails' `category`.
    
</dd>
</dl>

<dl>
<dd>

**from:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**reply_to:** `Internal::Types::Array[String]` — Addresses replies go to.
    
</dd>
</dl>

<dl>
<dd>

**subject:** `String` — May use `{{{contact.<key>|fallback}}}` (e.g. `{{{contact.first_name|there}}}`).
    
</dd>
</dl>

<dl>
<dd>

**preview_text:** `String` — The inbox preview line (a hidden preheader at the start of the HTML).
    
</dd>
</dl>

<dl>
<dd>

**html:** `String` — `{{{contact.<key>|fallback}}}` for contact fields and properties (escaped), and `{{{unsubscribe_url}}}`, `{{{preferences_url}}}`, `{{{mailing_address}}}`; a footer with the postal address and an unsubscribe link is added unless they are there.
    
</dd>
</dl>

<dl>
<dd>

**text:** `String` — The plain text part. Takes the same placeholders as `html`.
    
</dd>
</dl>

<dl>
<dd>

**tracking:** `Coss::Email::Broadcasts::Types::CreateBroadcastRequestTracking` — Which opens and clicks are tracked.
    
</dd>
</dl>

<dl>
<dd>

**rate_per_second:** `Integer` — Recipients per second, at most the plan's marketing rate (the default).
    
</dd>
</dl>

<dl>
<dd>

**send_:** `Internal::Types::Boolean` — Start sending right away.
    
</dd>
</dl>

<dl>
<dd>

**scheduled_at:** `String` — Start sending at this time (ISO 8601 with an offset, at most 30 days ahead).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">get</a>(id:) -> Coss::Types::Broadcast</code></summary>
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

```ruby
client.email.broadcasts.get(id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">remove</a>(id:) -> Coss::Types::DeletedBroadcast</code></summary>
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

```ruby
client.email.broadcasts.remove(id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">update</a>(id:, request) -> Coss::Types::Broadcast</code></summary>
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

```ruby
client.email.broadcasts.update(
  id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
  subject: "Our October news"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Shown only to you.
    
</dd>
</dl>

<dl>
<dd>

**audience_id:** `String` — Send to this audience. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**segment_id:** `String` — Send to this segment. `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**topic:** `String` — The topic it's about (its key). `null` clears it.
    
</dd>
</dl>

<dl>
<dd>

**from:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**reply_to:** `Internal::Types::Array[String]` — Addresses replies go to.
    
</dd>
</dl>

<dl>
<dd>

**subject:** `String` — May use `{{{contact.<key>|fallback}}}` (e.g. `{{{contact.first_name|there}}}`).
    
</dd>
</dl>

<dl>
<dd>

**preview_text:** `String` — The inbox preview line. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**html:** `String` — The HTML part. `null` removes it, if `text` remains.
    
</dd>
</dl>

<dl>
<dd>

**text:** `String` — The plain text part. `null` removes it, if `html` remains.
    
</dd>
</dl>

<dl>
<dd>

**tracking:** `Coss::Email::Broadcasts::Types::UpdateBroadcastRequestTracking` — Which opens and clicks are tracked.
    
</dd>
</dl>

<dl>
<dd>

**rate_per_second:** `Integer` — Recipients per second. `null`: the plan's marketing rate.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">send_</a>(id:, request) -> Coss::Types::Broadcast</code></summary>
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

```ruby
client.email.broadcasts.send_(
  id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
  scheduled_at: "2026-10-20T09:00:00Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**scheduled_at:** `String` — Omit to start right away.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">cancel</a>(id:) -> Coss::Types::Broadcast</code></summary>
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

```ruby
client.email.broadcasts.cancel(id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">pause</a>(id:) -> Coss::Types::Broadcast</code></summary>
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

```ruby
client.email.broadcasts.pause(id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">resume</a>(id:) -> Coss::Types::Broadcast</code></summary>
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

```ruby
client.email.broadcasts.resume(id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">test</a>(id:, request) -> Coss::Types::BroadcastTest</code></summary>
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

```ruby
client.email.broadcasts.test(
  id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz",
  to: ["me@acme.com"]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**to:** `Internal::Types::Array[String]` — Who gets the test, at most 5 addresses.
    
</dd>
</dl>

<dl>
<dd>

**contact:** `String` — A contact (id or address) whose values fill the template; default: fallbacks.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.broadcasts.<a href="/lib/Coss/email/broadcasts/client.rb">list_emails</a>(id:) -> Coss::Types::BroadcastEmailList</code></summary>
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

```ruby
client.email.broadcasts.list_emails(id: "bcast_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The broadcast's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last email of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Broadcasts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Audiences
<details><summary><code>client.email.audiences.<a href="/lib/Coss/email/audiences/client.rb">list</a>() -> Coss::Types::AudienceList</code></summary>
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

```ruby
client.email.audiences.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Audiences::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.audiences.<a href="/lib/Coss/email/audiences/client.rb">create</a>(request) -> Coss::Types::Audience</code></summary>
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

```ruby
client.email.audiences.create(name: "Beta testers")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — Your name for the list, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Audiences::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.audiences.<a href="/lib/Coss/email/audiences/client.rb">get</a>(id:) -> Coss::Types::Audience</code></summary>
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

```ruby
client.email.audiences.get(id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Audiences::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.audiences.<a href="/lib/Coss/email/audiences/client.rb">remove</a>(id:) -> Coss::Types::DeletedAudience</code></summary>
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

```ruby
client.email.audiences.remove(id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Audiences::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.audiences.<a href="/lib/Coss/email/audiences/client.rb">update</a>(id:, request) -> Coss::Types::Audience</code></summary>
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

```ruby
client.email.audiences.update(
  id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
  name: "Early access"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Your name for the list, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Audiences::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.audiences.<a href="/lib/Coss/email/audiences/client.rb">list_contacts</a>(id:) -> Coss::Types::ContactList</code></summary>
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

```ruby
client.email.audiences.list_contacts(id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Audiences::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.audiences.<a href="/lib/Coss/email/audiences/client.rb">add_contacts</a>(id:, request) -> Coss::Types::AudienceContactsAdded</code></summary>
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

```ruby
client.email.audiences.add_contacts(
  id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
  contacts: %w[contact_01k7c8m4q2f3e9v6t5r1n0p8yz grace@example.com]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**contacts:** `Internal::Types::Array[String]` — Contact ids or addresses of existing contacts.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Audiences::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.audiences.<a href="/lib/Coss/email/audiences/client.rb">remove_contact</a>(id:, contact_id:) -> Coss::Email::Audiences::Types::RemoveContactAudiencesResponse</code></summary>
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

```ruby
client.email.audiences.remove_contact(
  id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz",
  contact_id: "contact_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The audience's id.
    
</dd>
</dl>

<dl>
<dd>

**contact_id:** `String` — The contact's id, or its address (URL-encoded).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Audiences::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Segments
<details><summary><code>client.email.segments.<a href="/lib/Coss/email/segments/client.rb">list</a>() -> Coss::Types::SegmentList</code></summary>
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

```ruby
client.email.segments.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Segments::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.segments.<a href="/lib/Coss/email/segments/client.rb">create</a>(request) -> Coss::Types::Segment</code></summary>
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

```ruby
client.email.segments.create(
  name: "Pro customers",
  filter: {
    version: 1,
    match: "all",
    conditions: [{
      field: "property",
      key: "plan",
      op: "eq",
      value: "pro"
    }, {
      match: "any",
      conditions: [{
        field: "email",
        op: "ends_with",
        value: "@acme.com"
      }, {
        field: "audience",
        op: "in",
        audience_id: "aud_01k7c8m4q2f3e9v6t5r1n0p8yz"
      }],
      field: "property",
      key: "string",
      op: "eq"
    }]
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — Your name for the segment, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**filter:** `Coss::Types::SegmentFilter` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Segments::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.segments.<a href="/lib/Coss/email/segments/client.rb">get</a>(id:) -> Coss::Types::Segment</code></summary>
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

```ruby
client.email.segments.get(id: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The segment's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Segments::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.segments.<a href="/lib/Coss/email/segments/client.rb">remove</a>(id:) -> Coss::Types::DeletedSegment</code></summary>
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

```ruby
client.email.segments.remove(id: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The segment's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Segments::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.segments.<a href="/lib/Coss/email/segments/client.rb">update</a>(id:, request) -> Coss::Types::Segment</code></summary>
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

```ruby
client.email.segments.update(
  id: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz",
  name: "Pro and Scale customers"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The segment's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Your name for the segment, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**filter:** `Coss::Types::SegmentFilter` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Segments::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.segments.<a href="/lib/Coss/email/segments/client.rb">list_contacts</a>(id:) -> Coss::Types::ContactList</code></summary>
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

```ruby
client.email.segments.list_contacts(id: "seg_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The segment's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Segments::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Topics
<details><summary><code>client.email.topics.<a href="/lib/Coss/email/topics/client.rb">list</a>() -> Coss::Types::TopicList</code></summary>
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

```ruby
client.email.topics.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Topics::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.topics.<a href="/lib/Coss/email/topics/client.rb">create</a>(request) -> Coss::Types::Topic</code></summary>
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

```ruby
client.email.topics.create(
  key: "newsletter",
  name: "Newsletter",
  default_subscription: "opt_in"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**key:** `String` — The `category` of the emails about this topic. Can't change.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Shown in the preference center.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Shown in the preference center under its name. `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**default_subscription:** `Coss::Email::Topics::Types::CreateTopicRequestDefaultSubscription` — `opt_in`: every subscribed contact gets the topic's emails unless they opt out. `opt_out`: only contacts who opted in do.
    
</dd>
</dl>

<dl>
<dd>

**visibility:** `Coss::Email::Topics::Types::CreateTopicRequestVisibility` — `private` topics never show in the preference center (default `public`).
    
</dd>
</dl>

<dl>
<dd>

**position:** `Integer` — Order in the preference center (ascending).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Topics::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.topics.<a href="/lib/Coss/email/topics/client.rb">get</a>(id:) -> Coss::Types::Topic</code></summary>
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

```ruby
client.email.topics.get(id: "topic_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The topic's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Topics::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.topics.<a href="/lib/Coss/email/topics/client.rb">remove</a>(id:) -> Coss::Types::DeletedTopic</code></summary>
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

```ruby
client.email.topics.remove(id: "topic_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The topic's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Topics::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.topics.<a href="/lib/Coss/email/topics/client.rb">update</a>(id:, request) -> Coss::Types::Topic</code></summary>
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

```ruby
client.email.topics.update(
  id: "topic_01k7c8m4q2f3e9v6t5r1n0p8yz",
  visibility: "private"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The topic's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Shown in the preference center.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Shown in the preference center under its name. `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**default_subscription:** `Coss::Email::Topics::Types::UpdateTopicRequestDefaultSubscription` — `opt_in`: every subscribed contact gets the topic's emails unless they opt out. `opt_out`: only contacts who opted in do.
    
</dd>
</dl>

<dl>
<dd>

**visibility:** `Coss::Email::Topics::Types::UpdateTopicRequestVisibility` — `private` topics never show in the preference center (default `public`).
    
</dd>
</dl>

<dl>
<dd>

**position:** `Integer` — Order in the preference center (ascending).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Topics::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email MarketingSettings
<details><summary><code>client.email.marketing_settings.<a href="/lib/Coss/email/marketing_settings/client.rb">get</a>() -> Coss::Types::MarketingSettings</code></summary>
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

```ruby
client.email.marketing_settings.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Email::MarketingSettings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.marketing_settings.<a href="/lib/Coss/email/marketing_settings/client.rb">update</a>(request) -> Coss::Types::MarketingSettings</code></summary>
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

```ruby
client.email.marketing_settings.update(mailing_address: "Acme Inc., 548 Market St, San Francisco, CA 94104, USA")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**display_name:** `String` — The sender's name in the preference center. `null`: the organization's.
    
</dd>
</dl>

<dl>
<dd>

**mailing_address:** `String` — The postal address every marketing email carries (CAN-SPAM). Marketing emails can't be sent without one.
    
</dd>
</dl>

<dl>
<dd>

**double_opt_in_default:** `Internal::Types::Boolean` — Whether contacts upserted without `double_opt_in` must confirm first.
    
</dd>
</dl>

<dl>
<dd>

**confirmation_from:** `String` — The sender of confirmation emails (a verified domain's address for live keys).
    
</dd>
</dl>

<dl>
<dd>

**confirmation_subject:** `String` — `null`: coss.com's default.
    
</dd>
</dl>

<dl>
<dd>

**confirmation_html:** `String` — `null`: coss.com's default. Must contain `{{{confirmation_url}}}`.
    
</dd>
</dl>

<dl>
<dd>

**confirmation_text:** `String` — `null`: coss.com's default. Must contain `{{{confirmation_url}}}`.
    
</dd>
</dl>

<dl>
<dd>

**confirmed_redirect_url:** `String` — Where a confirmed contact is sent, an https URL. `null`: coss.com's own page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::MarketingSettings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Received
<details><summary><code>client.email.received.<a href="/lib/Coss/email/received/client.rb">list</a>() -> Coss::Types::ReceivedEmailList</code></summary>
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

```ruby
client.email.received.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last email of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Received::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.received.<a href="/lib/Coss/email/received/client.rb">address</a>() -> Coss::Types::InboundAddress</code></summary>
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

```ruby
client.email.received.address
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Email::Received::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.received.<a href="/lib/Coss/email/received/client.rb">get</a>(id:) -> Coss::Types::ReceivedEmail</code></summary>
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

```ruby
client.email.received.get(id: "rcvd_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The received email's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Received::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.received.<a href="/lib/Coss/email/received/client.rb">delete</a>(id:) -> Coss::Types::DeletedReceivedEmail</code></summary>
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

```ruby
client.email.received.delete(id: "rcvd_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The received email's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Received::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.received.<a href="/lib/Coss/email/received/client.rb">get_raw</a>(id:) -> String</code></summary>
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

```ruby
client.email.received.get_raw(id: "id")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The received email's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Received::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.received.<a href="/lib/Coss/email/received/client.rb">get_attachment</a>(id:, attachment_id:) -> String</code></summary>
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

```ruby
client.email.received.get_attachment(
  id: "id",
  attachment_id: "attachment_id"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The received email's id.
    
</dd>
</dl>

<dl>
<dd>

**attachment_id:** `String` — The attachment's id (from the received email's `attachments`).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Received::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Contacts Properties
<details><summary><code>client.email.contacts.properties.<a href="/lib/Coss/email/contacts/properties/client.rb">list</a>() -> Coss::Types::ContactPropertyList</code></summary>
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

```ruby
client.email.contacts.properties.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::Properties::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.properties.<a href="/lib/Coss/email/contacts/properties/client.rb">create</a>(request) -> Coss::Types::ContactProperty</code></summary>
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

```ruby
client.email.contacts.properties.create(
  key: "plan",
  type: "string",
  fallback: "free"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**key:** `String` — How contacts and templates name it. Lower-case letters, digits and `_`, starting with a letter. Can't change.
    
</dd>
</dl>

<dl>
<dd>

**type:** `Coss::Email::Contacts::Properties::Types::CreateContactPropertyRequestType` — What values it takes. `date` values are ISO 8601 strings. Can't change.
    
</dd>
</dl>

<dl>
<dd>

**fallback:** `Coss::Email::Contacts::Properties::Types::CreateContactPropertyRequestFallback` — Used in templates for contacts without a value.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::Properties::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.properties.<a href="/lib/Coss/email/contacts/properties/client.rb">get</a>(id:) -> Coss::Types::ContactProperty</code></summary>
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

```ruby
client.email.contacts.properties.get(id: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The property's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::Properties::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.properties.<a href="/lib/Coss/email/contacts/properties/client.rb">remove</a>(id:) -> Coss::Types::DeletedContactProperty</code></summary>
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

```ruby
client.email.contacts.properties.remove(id: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The property's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::Properties::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.contacts.properties.<a href="/lib/Coss/email/contacts/properties/client.rb">update</a>(id:, request) -> Coss::Types::ContactProperty</code></summary>
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

```ruby
client.email.contacts.properties.update(
  id: "cprop_01k7c8m4q2f3e9v6t5r1n0p8yz",
  fallback: "starter"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The property's id.
    
</dd>
</dl>

<dl>
<dd>

**fallback:** `Coss::Email::Contacts::Properties::Types::UpdateContactPropertyRequestFallback` — Used in templates for contacts without a value. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Contacts::Properties::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Email Templates Versions
<details><summary><code>client.email.templates.versions.<a href="/lib/Coss/email/templates/versions/client.rb">list</a>(id:) -> Coss::Types::EmailTemplateVersionList</code></summary>
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

```ruby
client.email.templates.versions.list(id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-20, default 10.
    
</dd>
</dl>

<dl>
<dd>

**after:** `Integer` — Cursor: the `version` of the last version of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::Versions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.versions.<a href="/lib/Coss/email/templates/versions/client.rb">get</a>(id:, version:) -> Coss::Types::EmailTemplateVersion</code></summary>
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

```ruby
client.email.templates.versions.get(
  id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  version: 1
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**version:** `Integer` — A published version number.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::Versions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.email.templates.versions.<a href="/lib/Coss/email/templates/versions/client.rb">restore</a>(id:, version:) -> Coss::Types::EmailTemplateVersion</code></summary>
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

```ruby
client.email.templates.versions.restore(
  id: "etpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  version: 1
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id or alias.
    
</dd>
</dl>

<dl>
<dd>

**version:** `Integer` — A published version number.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Email::Templates::Versions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Forms Submissions
<details><summary><code>client.forms.submissions.<a href="/lib/Coss/forms/submissions/client.rb">list</a>(id:) -> Coss::Types::FormSubmissionList</code></summary>
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

```ruby
client.forms.submissions.list(id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**status:** `String` — Only submissions in these statuses, comma-separated: `held,spam`.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::Submissions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.forms.submissions.<a href="/lib/Coss/forms/submissions/client.rb">get</a>(id:, submission_id:) -> Coss::Types::FormSubmission</code></summary>
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

```ruby
client.forms.submissions.get(
  id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
  submission_id: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**submission_id:** `String` — The submission's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::Submissions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.forms.submissions.<a href="/lib/Coss/forms/submissions/client.rb">remove</a>(id:, submission_id:) -> Coss::Types::DeletedFormSubmission</code></summary>
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

```ruby
client.forms.submissions.remove(
  id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
  submission_id: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**submission_id:** `String` — The submission's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::Submissions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.forms.submissions.<a href="/lib/Coss/forms/submissions/client.rb">release</a>(id:, submission_id:) -> Coss::Types::FormSubmission</code></summary>
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

```ruby
client.forms.submissions.release(
  id: "form_01kd2m8n3p4q5r6s7t8v9w0x1y",
  submission_id: "fsub_01kd2m9a0b1c2d3e4f5g6h7j8k"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**submission_id:** `String` — The submission's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::Submissions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.forms.submissions.<a href="/lib/Coss/forms/submissions/client.rb">file</a>(id:, submission_id:, file_id:) -> String</code></summary>
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

```ruby
client.forms.submissions.file(
  id: "id",
  submission_id: "submission_id",
  file_id: "file_id"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The form's id.
    
</dd>
</dl>

<dl>
<dd>

**submission_id:** `String` — The submission's id.
    
</dd>
</dl>

<dl>
<dd>

**file_id:** `String` — The file's id (`files[].id` of the submission).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Forms::Submissions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks EventTypes
<details><summary><code>client.hooks.event_types.<a href="/lib/Coss/hooks/event_types/client.rb">list</a>() -> Coss::Types::HookEventTypeList</code></summary>
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

```ruby
client.hooks.event_types.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**include_archived:** `Coss::Hooks::EventTypes::Types::ListEventTypesRequestIncludeArchived` — Also list archived types (default `false`).
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `name` of the last type of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.event_types.<a href="/lib/Coss/hooks/event_types/client.rb">create</a>(request) -> Coss::Types::HookEventType</code></summary>
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

```ruby
client.hooks.event_types.create(
  name: "invoice.paid",
  description: "An invoice was paid in full.",
  examples: [{
    invoice_id: "in_1042",
    amount: 4200,
    currency: "usd"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — The type's name, which messages send as `event_type`. Letters, digits and `. _ -`.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — What this event means, shown to your users.
    
</dd>
</dl>

<dl>
<dd>

**schema:** `Internal::Types::Hash[String, Object]` — A JSON Schema of the payload, shown to your users (not enforced).
    
</dd>
</dl>

<dl>
<dd>

**examples:** `Internal::Types::Array[Internal::Types::Hash[String, Object]]` — Up to 5 example payloads; the first is what a test send delivers.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.event_types.<a href="/lib/Coss/hooks/event_types/client.rb">get</a>(name:) -> Coss::Types::HookEventType</code></summary>
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

```ruby
client.hooks.event_types.get(name: "invoice.paid")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — The event type's name.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.event_types.<a href="/lib/Coss/hooks/event_types/client.rb">archive</a>(name:) -> Coss::Types::HookEventType</code></summary>
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

```ruby
client.hooks.event_types.archive(name: "invoice.paid")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — The event type's name.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.event_types.<a href="/lib/Coss/hooks/event_types/client.rb">update</a>(name:, request) -> Coss::Types::HookEventType</code></summary>
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

```ruby
client.hooks.event_types.update(
  name: "invoice.paid",
  archived: false
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — The event type's name.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — What this event means, shown to your users. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**schema:** `Internal::Types::Hash[String, Object]` — A JSON Schema of the payload, shown to your users (not enforced).
    
</dd>
</dl>

<dl>
<dd>

**examples:** `Internal::Types::Array[Internal::Types::Hash[String, Object]]` — Up to 5 example payloads; the first is what a test send delivers.
    
</dd>
</dl>

<dl>
<dd>

**archived:** `Internal::Types::Boolean` — `false` restores an archived type.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Applications
<details><summary><code>client.hooks.applications.<a href="/lib/Coss/hooks/applications/client.rb">list</a>() -> Coss::Types::HookApplicationList</code></summary>
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

```ruby
client.hooks.applications.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last application of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Applications::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.applications.<a href="/lib/Coss/hooks/applications/client.rb">create</a>(request) -> Coss::Types::HookApplication</code></summary>
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

```ruby
client.hooks.applications.create(
  name: "Acme Corp",
  uid: "customer_8812",
  metadata: {
    plan: "pro"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — Shown to the application's users in the portal.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `String` — Your own id for it, to address it by in every path instead of its `id`.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Applications::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.applications.<a href="/lib/Coss/hooks/applications/client.rb">get</a>(application:) -> Coss::Types::HookApplication</code></summary>
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

```ruby
client.hooks.applications.get(application: "customer_8812")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Applications::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.applications.<a href="/lib/Coss/hooks/applications/client.rb">delete</a>(application:) -> Coss::Types::DeletedHookApplication</code></summary>
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

```ruby
client.hooks.applications.delete(application: "customer_8812")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Applications::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.applications.<a href="/lib/Coss/hooks/applications/client.rb">update</a>(application:, request) -> Coss::Types::HookApplication</code></summary>
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

```ruby
client.hooks.applications.update(
  application: "customer_8812",
  name: "Acme Corporation"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Shown to the application's users in the portal.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `String` — `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Replaces the metadata.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Applications::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Endpoints
<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">list</a>(application:) -> Coss::Types::HookEndpointList</code></summary>
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

```ruby
client.hooks.endpoints.list(application: "customer_8812")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">create</a>(application:, request) -> Coss::Types::HookEndpointWithSecret</code></summary>
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

```ruby
client.hooks.endpoints.create(
  application: "customer_8812",
  url: "https://example.com/webhooks",
  filter_types: ["invoice.paid"]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**url:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Your note about it.
    
</dd>
</dl>

<dl>
<dd>

**filter_types:** `Internal::Types::Array[String]` — Event types delivered to this endpoint (existing, unarchived ones). An empty array means every type, including ones added later.
    
</dd>
</dl>

<dl>
<dd>

**secret:** `String` — A `whsec_` + base64 secret of 24-64 bytes to sign with, e.g. when migrating from another provider. Generated when omitted.
    
</dd>
</dl>

<dl>
<dd>

**rate_limit_per_second:** `Integer` — At most this many requests per second to this endpoint.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `Internal::Types::Boolean` — Default `true`. `false` creates it disabled, with `disabled_reason: manual`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">get</a>(application:, endpoint_id:) -> Coss::Types::HookEndpoint</code></summary>
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

```ruby
client.hooks.endpoints.get(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">delete</a>(application:, endpoint_id:) -> Coss::Types::DeletedHookEndpoint</code></summary>
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

```ruby
client.hooks.endpoints.delete(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">update</a>(application:, endpoint_id:, request) -> Coss::Types::HookEndpoint</code></summary>
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

```ruby
client.hooks.endpoints.update(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  enabled: false
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**url:** `String` — Where deliveries are sent.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Your note about it. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**filter_types:** `Internal::Types::Array[String]` — Event types delivered to this endpoint (existing, unarchived ones). An empty array means every type, including ones added later.
    
</dd>
</dl>

<dl>
<dd>

**rate_limit_per_second:** `Integer` — At most this many requests per second to this endpoint.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs (at most 16; keys up to 40 characters, values up to 500).
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `Internal::Types::Boolean` — `false` disables it with `disabled_reason: manual`; `true` enables it again and clears the reason.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">get_secret</a>(application:, endpoint_id:) -> Coss::Types::HookEndpointSecret</code></summary>
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

```ruby
client.hooks.endpoints.get_secret(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">roll_secret</a>(application:, endpoint_id:, request) -> Coss::Types::HookEndpointWithSecret</code></summary>
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

```ruby
client.hooks.endpoints.roll_secret(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  previous_secret_expires_in: 3600
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**previous_secret_expires_in:** `Integer` — Seconds the current secret keeps signing next to the new one. Default 86400 (a day), at most 604800 (a week); `0` stops it immediately.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">recover</a>(application:, endpoint_id:, request) -> Coss::Types::HookEndpointRecovery</code></summary>
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

```ruby
client.hooks.endpoints.recover(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  since: "2026-01-15T00:00:00Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**since:** `String` — Requeue deliveries that failed, of messages sent from this time until now.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">get_recovery</a>(application:, endpoint_id:, recovery_id:) -> Coss::Types::HookEndpointRecovery</code></summary>
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

```ruby
client.hooks.endpoints.get_recovery(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  recovery_id: "hrec_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**recovery_id:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">send_test</a>(application:, endpoint_id:, request) -> Coss::Types::HookMessage</code></summary>
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

```ruby
client.hooks.endpoints.send_test(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  event_type: "invoice.paid"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**event_type:** `String` — The event type to send as.
    
</dd>
</dl>

<dl>
<dd>

**payload:** `Internal::Types::Hash[String, Object]` — Defaults to the event type's first example.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.endpoints.<a href="/lib/Coss/hooks/endpoints/client.rb">list_deliveries</a>(application:, endpoint_id:) -> Coss::Types::HookDeliveryList</code></summary>
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

```ruby
client.hooks.endpoints.list_deliveries(
  application: "customer_8812",
  endpoint_id: "hep_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**endpoint_id:** `String` — The endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Hooks::Endpoints::Types::ListDeliveriesEndpointsRequestStatus` — Only deliveries with this status.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last delivery of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Endpoints::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Messages
<details><summary><code>client.hooks.messages.<a href="/lib/Coss/hooks/messages/client.rb">list</a>(application:) -> Coss::Types::HookMessageList</code></summary>
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

```ruby
client.hooks.messages.list(application: "customer_8812")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**event_type:** `String` — Only messages of this type.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last message of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.messages.<a href="/lib/Coss/hooks/messages/client.rb">send_</a>(application:, request) -> Coss::Types::HookMessage</code></summary>
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

```ruby
client.hooks.messages.send_(
  application: "customer_8812",
  idempotency_key: "invoice-1042-paid",
  event_type: "invoice.paid",
  payload: {
    invoice_id: "in_1042",
    amount: 4200,
    currency: "usd"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original message instead of sending again, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**event_type:** `String` — What happened, e.g. `invoice.paid`. Endpoints that filter by type only get the types they chose. The type doesn't have to be registered.
    
</dd>
</dl>

<dl>
<dd>

**payload:** `Internal::Types::Hash[String, Object]` — The JSON object delivered as the request body (at most 256 KB serialized). It is parsed and serialized again: send integers beyond 2^53 as strings.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.messages.<a href="/lib/Coss/hooks/messages/client.rb">get</a>(application:, message_id:) -> Coss::Types::HookMessage</code></summary>
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

```ruby
client.hooks.messages.get(
  application: "customer_8812",
  message_id: "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**message_id:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.messages.<a href="/lib/Coss/hooks/messages/client.rb">list_deliveries</a>(application:, message_id:) -> Coss::Types::HookDeliveryList</code></summary>
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

```ruby
client.hooks.messages.list_deliveries(
  application: "customer_8812",
  message_id: "hmsg_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**message_id:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Deliveries
<details><summary><code>client.hooks.deliveries.<a href="/lib/Coss/hooks/deliveries/client.rb">get</a>(application:, delivery_id:) -> Coss::Types::HookDelivery</code></summary>
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

```ruby
client.hooks.deliveries.get(
  application: "customer_8812",
  delivery_id: "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**delivery_id:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Deliveries::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.deliveries.<a href="/lib/Coss/hooks/deliveries/client.rb">list_attempts</a>(application:, delivery_id:) -> Coss::Types::HookAttemptList</code></summary>
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

```ruby
client.hooks.deliveries.list_attempts(
  application: "customer_8812",
  delivery_id: "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**delivery_id:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Deliveries::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.hooks.deliveries.<a href="/lib/Coss/hooks/deliveries/client.rb">retry_</a>(application:, delivery_id:) -> Coss::Types::HookDelivery</code></summary>
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

```ruby
client.hooks.deliveries.retry_(
  application: "customer_8812",
  delivery_id: "hdel_01k7c8m4q2f3e9v6t5r1n0p8yz"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**delivery_id:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Deliveries::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Hooks Portal
<details><summary><code>client.hooks.portal.<a href="/lib/Coss/hooks/portal/client.rb">create_session</a>(application:, request) -> Coss::Types::HookPortalSession</code></summary>
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

```ruby
client.hooks.portal.create_session(
  application: "customer_8812",
  expires_in: 3600
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**application:** `String` — The application's `id` (`happ_…`) or your `uid` for it.
    
</dd>
</dl>

<dl>
<dd>

**expires_in:** `Integer` — Seconds until it expires: default 3600, at most 86400.
    
</dd>
</dl>

<dl>
<dd>

**read_only:** `Internal::Types::Boolean` — The user can look but not change anything.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Hooks::Portal::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes Threads
<details><summary><code>client.inboxes.threads.<a href="/lib/Coss/inboxes/threads/client.rb">list</a>(inbox_id:) -> Coss::Types::InboxThreadList</code></summary>
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

```ruby
client.inboxes.threads.list(inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::Threads::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.threads.<a href="/lib/Coss/inboxes/threads/client.rb">get</a>(inbox_id:, thread_id:) -> Coss::Types::InboxThread</code></summary>
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

```ruby
client.inboxes.threads.get(
  inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
  thread_id: "thread_01k7c8m4r0c2b8w9y3d5f6g7h8"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**thread_id:** `String` — The thread's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::Threads::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.threads.<a href="/lib/Coss/inboxes/threads/client.rb">delete</a>(inbox_id:, thread_id:) -> Coss::Types::DeletedInboxThread</code></summary>
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

```ruby
client.inboxes.threads.delete(
  inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
  thread_id: "thread_01k7c8m4r0c2b8w9y3d5f6g7h8"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**thread_id:** `String` — The thread's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::Threads::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Inboxes Messages
<details><summary><code>client.inboxes.messages.<a href="/lib/Coss/inboxes/messages/client.rb">list</a>(inbox_id:) -> Coss::Types::InboxMessageList</code></summary>
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

```ruby
client.inboxes.messages.list(inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**direction:** `Coss::Inboxes::Messages::Types::ListMessagesRequestDirection` — Only inbound (received) or outbound (sent) messages.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.messages.<a href="/lib/Coss/inboxes/messages/client.rb">send_</a>(inbox_id:, request) -> Coss::Types::InboxMessage</code></summary>
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

```ruby
client.inboxes.messages.send_(
  inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
  idempotency_key: "welcome-user-123",
  to: "jane@example.com",
  subject: "Your order",
  text: "Hi Jane, your order has shipped."
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**idempotency_key:** `String` — Makes the send safe to retry: a repeat with the same key and body returns the first message instead of sending again (keys are per inbox). 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**to:** `Coss::Inboxes::Messages::Types::SendInboxMessageRequestTo` — Who it goes to.
    
</dd>
</dl>

<dl>
<dd>

**cc:** `Coss::Inboxes::Messages::Types::SendInboxMessageRequestCc` — Who it's copied to.
    
</dd>
</dl>

<dl>
<dd>

**bcc:** `Coss::Inboxes::Messages::Types::SendInboxMessageRequestBcc` — Who it's blind copied to.
    
</dd>
</dl>

<dl>
<dd>

**subject:** `String` — The new thread's subject.
    
</dd>
</dl>

<dl>
<dd>

**text:** `String` — Plain-text body. Without it, an `html` email goes out with a text part generated from the HTML.
    
</dd>
</dl>

<dl>
<dd>

**html:** `String` — HTML body. Provide `html`, `text`, or both.
    
</dd>
</dl>

<dl>
<dd>

**attachments:** `Internal::Types::Array[Coss::Types::SendEmailAttachment]` — Up to 20 files, at most 25 MB combined.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `Internal::Types::Array[Coss::Inboxes::Messages::Types::SendInboxMessageRequestTagsItem]` — Your tags on the email.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.messages.<a href="/lib/Coss/inboxes/messages/client.rb">get</a>(inbox_id:, message_id:) -> Coss::Types::InboxMessage</code></summary>
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

```ruby
client.inboxes.messages.get(
  inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
  message_id: "imsg_01k7c8m4s1d3c9x0z4e6g7h8j9"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**message_id:** `String` — The message's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.messages.<a href="/lib/Coss/inboxes/messages/client.rb">get_attachment</a>(inbox_id:, message_id:, attachment_id:) -> String</code></summary>
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

```ruby
client.inboxes.messages.get_attachment(
  inbox_id: "inbox_id",
  message_id: "message_id",
  attachment_id: "attachment_id"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**message_id:** `String` — The message's id.
    
</dd>
</dl>

<dl>
<dd>

**attachment_id:** `String` — The attachment's id (from the message's `attachments`).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.inboxes.messages.<a href="/lib/Coss/inboxes/messages/client.rb">reply</a>(inbox_id:, message_id:, request) -> Coss::Types::InboxMessage</code></summary>
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

```ruby
client.inboxes.messages.reply(
  inbox_id: "inbox_01k7c8m4q2f3e9v6t5r1n0p8yz",
  message_id: "imsg_01k7c8m4s1d3c9x0z4e6g7h8j9",
  idempotency_key: "welcome-user-123",
  text: "Sorry about that, Jane! A new one is on its way."
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**inbox_id:** `String` — The inbox's id.
    
</dd>
</dl>

<dl>
<dd>

**message_id:** `String` — The message's id.
    
</dd>
</dl>

<dl>
<dd>

**idempotency_key:** `String` — Makes the send safe to retry: a repeat with the same key and body returns the first message instead of sending again (keys are per inbox). 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**reply_all:** `Internal::Types::Boolean` — Also reply to everyone else on the message (its `to` and `cc`, but the inbox). Default `false`: only the sender (its `Reply-To`, when it has one).
    
</dd>
</dl>

<dl>
<dd>

**cc:** `Coss::Inboxes::Messages::Types::ReplyInboxMessageRequestCc` — Who it's copied to.
    
</dd>
</dl>

<dl>
<dd>

**bcc:** `Coss::Inboxes::Messages::Types::ReplyInboxMessageRequestBcc` — Who it's blind copied to.
    
</dd>
</dl>

<dl>
<dd>

**text:** `String` — Plain-text body. Without it, an `html` email goes out with a text part generated from the HTML.
    
</dd>
</dl>

<dl>
<dd>

**html:** `String` — HTML body. Provide `html`, `text`, or both.
    
</dd>
</dl>

<dl>
<dd>

**attachments:** `Internal::Types::Array[Coss::Types::SendEmailAttachment]` — Up to 20 files, at most 25 MB combined.
    
</dd>
</dl>

<dl>
<dd>

**tags:** `Internal::Types::Array[Coss::Inboxes::Messages::Types::ReplyInboxMessageRequestTagsItem]` — Your tags on the email.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Inboxes::Messages::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## LogDrains Batches
<details><summary><code>client.log_drains.batches.<a href="/lib/Coss/log_drains/batches/client.rb">list</a>(id:) -> Coss::Types::LogDrainBatchList</code></summary>
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

```ruby
client.log_drains.batches.list(id: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The log drain's id.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::LogDrains::Batches::Types::ListBatchesRequestStatus` — Only batches with this status.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last batch of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::LogDrains::Batches::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.log_drains.batches.<a href="/lib/Coss/log_drains/batches/client.rb">get</a>(id:, batch_id:) -> Coss::Types::LogDrainBatch</code></summary>
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

```ruby
client.log_drains.batches.get(
  id: "drain_01k7c8m4q2f3e9v6t5r1n0p8yz",
  batch_id: "drainbat_01k7c8n2b5d7f9h1k3m5p7r9tv"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The log drain's id.
    
</dd>
</dl>

<dl>
<dd>

**batch_id:** `String` — The batch's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::LogDrains::Batches::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Assessments
<details><summary><code>client.risk.assessments.<a href="/lib/Coss/risk/assessments/client.rb">list</a>() -> Coss::Types::RiskAssessmentList</code></summary>
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

```ruby
client.risk.assessments.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event:** `Coss::Types::RiskEvent` — What is being assessed. `custom` events are named by `event_name`; velocity is counted per event.
    
</dd>
</dl>

<dl>
<dd>

**decision:** `Coss::Types::RiskDecision` — `allow`: go ahead. `review`: suspicious; let it through with limits, or hold it for a person. `block`: refuse it.
    
</dd>
</dl>

<dl>
<dd>

**user_id:** `String` — Only assessments of this user.
    
</dd>
</dl>

<dl>
<dd>

**review_status:** `Coss::Risk::Assessments::Types::ListAssessmentsRequestReviewStatus` — `open`: the review queue.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last entry of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Assessments::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.assessments.<a href="/lib/Coss/risk/assessments/client.rb">get</a>(id:) -> Coss::Types::RiskAssessment</code></summary>
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

```ruby
client.risk.assessments.get(id: "rsk_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The assessment's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Assessments::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Lists
<details><summary><code>client.risk.lists.<a href="/lib/Coss/risk/lists/client.rb">list</a>() -> Coss::Types::RiskListEntryList</code></summary>
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

```ruby
client.risk.lists.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**list:** `Coss::Types::RiskList` — Which list: `allow` or `block`.
    
</dd>
</dl>

<dl>
<dd>

**type:** `Coss::Types::RiskListEntryType` — `email` (matched by mailbox, dots and `+tags` folded), `domain` (subdomains included), `ip` (an address or CIDR range), `asn`, `country` (ISO 3166-1 alpha-2), `user` (your user id).
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last entry of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Lists::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.lists.<a href="/lib/Coss/risk/lists/client.rb">add</a>(request) -> Coss::Types::RiskListEntry</code></summary>
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

```ruby
client.risk.lists.add(
  list: "block",
  type: "domain",
  value: "evil.example",
  note: "Card testing"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**list:** `Coss::Types::RiskList` 
    
</dd>
</dl>

<dl>
<dd>

**type:** `Coss::Types::RiskListEntryType` 
    
</dd>
</dl>

<dl>
<dd>

**value:** `String` — What to match: the address, domain, IP, CIDR range, ASN or other value of its `type`.
    
</dd>
</dl>

<dl>
<dd>

**note:** `String` — Your note about it.
    
</dd>
</dl>

<dl>
<dd>

**expires_at:** `String` — The entry stops matching at this time (it is kept until deleted).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Lists::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.lists.<a href="/lib/Coss/risk/lists/client.rb">get</a>(id:) -> Coss::Types::RiskListEntry</code></summary>
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

```ruby
client.risk.lists.get(id: "rskle_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The list entry's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Lists::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.lists.<a href="/lib/Coss/risk/lists/client.rb">remove</a>(id:) -> Coss::Types::DeletedRiskListEntry</code></summary>
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

```ruby
client.risk.lists.remove(id: "rskle_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The list entry's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Lists::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Users
<details><summary><code>client.risk.users.<a href="/lib/Coss/risk/users/client.rb">forget</a>(user_id:) -> Coss::Types::ForgottenRiskUser</code></summary>
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

```ruby
client.risk.users.forget(user_id: "u_42")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**user_id:** `String` — Your id for the user.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Users::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Settings
<details><summary><code>client.risk.settings.<a href="/lib/Coss/risk/settings/client.rb">get</a>() -> Coss::Types::RiskSettings</code></summary>
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

```ruby
client.risk.settings.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Risk::Settings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.settings.<a href="/lib/Coss/risk/settings/client.rb">update</a>(request) -> Coss::Types::RiskSettings</code></summary>
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

```ruby
client.risk.settings.update(
  block_threshold: 0.9,
  captcha: {
    provider: "turnstile",
    secret: "0x4AAA…",
    required: true
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**review_threshold:** `Integer` — Scores at or above it are `review`.
    
</dd>
</dl>

<dl>
<dd>

**block_threshold:** `Integer` — Scores at or above it are `block`.
    
</dd>
</dl>

<dl>
<dd>

**disabled_reasons:** `Internal::Types::Array[Coss::Risk::Settings::Types::UpdateRiskSettingsRequestDisabledReasonsItem]` — Reasons that never fire in this environment. Replaces the list.
    
</dd>
</dl>

<dl>
<dd>

**captcha:** `Coss::Risk::Settings::Types::UpdateRiskSettingsRequestCaptcha` — `null` turns captcha verification off and deletes the secret.
    
</dd>
</dl>

<dl>
<dd>

**content_thresholds:** `Coss::Risk::Settings::Types::UpdateRiskSettingsRequestContentThresholds` — Changes the categories given: a score in (0, 1] sets the threshold, `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**reason_weights:** `Coss::Risk::Settings::Types::UpdateRiskSettingsRequestReasonWeights` — Changes the reasons given: a weight in [0, 0.99] replaces the default, `null` goes back to it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Settings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk Rules
<details><summary><code>client.risk.rules.<a href="/lib/Coss/risk/rules/client.rb">list</a>() -> Coss::Types::RiskRuleList</code></summary>
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

```ruby
client.risk.rules.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Risk::Rules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.rules.<a href="/lib/Coss/risk/rules/client.rb">create</a>(request) -> Coss::Types::RiskRule</code></summary>
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

```ruby
client.risk.rules.create(
  name: "Disposable email from a data center",
  events: ["signup"],
  conditions: [{
    field: "email.disposable",
    operator: "is",
    value: true
  }, {
    field: "ip.hosting",
    operator: "is",
    value: true
  }],
  action: "block"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — Your name for the rule, returned with reasons when it decides.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `Internal::Types::Boolean` — Default `true`.
    
</dd>
</dl>

<dl>
<dd>

**position:** `Integer` — Default 0.
    
</dd>
</dl>

<dl>
<dd>

**events:** `Internal::Types::Array[Coss::Types::RiskEvent]` — Events it applies to. Default: every event.
    
</dd>
</dl>

<dl>
<dd>

**match:** `Coss::Risk::Rules::Types::CreateRiskRuleRequestMatch` — Default `all`.
    
</dd>
</dl>

<dl>
<dd>

**conditions:** `Internal::Types::Array[Coss::Types::RiskRuleCondition]` — What must hold, by `match`.
    
</dd>
</dl>

<dl>
<dd>

**action:** `Coss::Types::RiskDecision` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Rules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.rules.<a href="/lib/Coss/risk/rules/client.rb">get</a>(id:) -> Coss::Types::RiskRule</code></summary>
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

```ruby
client.risk.rules.get(id: "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The rule's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Rules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.rules.<a href="/lib/Coss/risk/rules/client.rb">delete</a>(id:) -> Coss::Types::DeletedRiskRule</code></summary>
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

```ruby
client.risk.rules.delete(id: "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The rule's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Rules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.rules.<a href="/lib/Coss/risk/rules/client.rb">update</a>(id:, request) -> Coss::Types::RiskRule</code></summary>
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

```ruby
client.risk.rules.update(
  id: "rskrule_01k7c8m4q2f3e9v6t5r1n0p8yz",
  enabled: false
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The rule's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Your name for the rule.
    
</dd>
</dl>

<dl>
<dd>

**enabled:** `Internal::Types::Boolean` — `false` keeps it, and stops applying it.
    
</dd>
</dl>

<dl>
<dd>

**position:** `Integer` — Rules are tried in ascending order.
    
</dd>
</dl>

<dl>
<dd>

**events:** `Internal::Types::Array[Coss::Types::RiskEvent]` — Events it applies to. Empty: every event.
    
</dd>
</dl>

<dl>
<dd>

**match:** `Coss::Risk::Rules::Types::UpdateRiskRuleRequestMatch` — `all`: every condition must hold. `any`: one is enough.
    
</dd>
</dl>

<dl>
<dd>

**conditions:** `Internal::Types::Array[Coss::Types::RiskRuleCondition]` — What must hold, by `match`.
    
</dd>
</dl>

<dl>
<dd>

**action:** `Coss::Types::RiskDecision` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::Rules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Risk LimitBuckets
<details><summary><code>client.risk.limit_buckets.<a href="/lib/Coss/risk/limit_buckets/client.rb">list</a>() -> Coss::Types::RiskLimitBucketList</code></summary>
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

```ruby
client.risk.limit_buckets.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Risk::LimitBuckets::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.limit_buckets.<a href="/lib/Coss/risk/limit_buckets/client.rb">create</a>(request) -> Coss::Types::RiskLimitBucket</code></summary>
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

```ruby
client.risk.limit_buckets.create(
  name: "password_reset",
  limit: 5,
  period_seconds: 3600
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — Unique in the environment; can't be changed.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — Tokens added per `period_seconds`.
    
</dd>
</dl>

<dl>
<dd>

**period_seconds:** `Integer` — 1 second to 1 day.
    
</dd>
</dl>

<dl>
<dd>

**burst:** `Integer` — How many requests a key can make at once. Defaults to `limit`.
    
</dd>
</dl>

<dl>
<dd>

**on_failure:** `Coss::Risk::LimitBuckets::Types::CreateRiskLimitBucketRequestOnFailure` — The answer while coss.com can't count. Defaults to `allow`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::LimitBuckets::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.limit_buckets.<a href="/lib/Coss/risk/limit_buckets/client.rb">get</a>(id:) -> Coss::Types::RiskLimitBucket</code></summary>
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

```ruby
client.risk.limit_buckets.get(id: "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The bucket's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::LimitBuckets::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.limit_buckets.<a href="/lib/Coss/risk/limit_buckets/client.rb">delete</a>(id:) -> Coss::Types::DeletedRiskLimitBucket</code></summary>
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

```ruby
client.risk.limit_buckets.delete(id: "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The bucket's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::LimitBuckets::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.risk.limit_buckets.<a href="/lib/Coss/risk/limit_buckets/client.rb">update</a>(id:, request) -> Coss::Types::RiskLimitBucket</code></summary>
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

```ruby
client.risk.limit_buckets.update(
  id: "rsklb_01k7c8m4q2f3e9v6t5r1n0p8yz",
  limit: 10,
  burst: 20
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The bucket's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — Tokens added per `period_seconds`.
    
</dd>
</dl>

<dl>
<dd>

**period_seconds:** `Integer` — How many seconds `limit` tokens take to be added.
    
</dd>
</dl>

<dl>
<dd>

**burst:** `Integer` — The bucket's size: how many requests a key can make at once.
    
</dd>
</dl>

<dl>
<dd>

**on_failure:** `Coss::Risk::LimitBuckets::Types::UpdateRiskLimitBucketRequestOnFailure` — The answer while coss.com can't count: `allow` or `deny`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Risk::LimitBuckets::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Hosts
<details><summary><code>client.scheduling.hosts.<a href="/lib/Coss/scheduling/hosts/client.rb">list</a>() -> Coss::Types::SchedulingHostList</code></summary>
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

```ruby
client.scheduling.hosts.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — The last id of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Hosts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.hosts.<a href="/lib/Coss/scheduling/hosts/client.rb">create</a>(request) -> Coss::Types::SchedulingHost</code></summary>
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

```ruby
client.scheduling.hosts.create(
  uid: "doctor_482",
  name: "Dr. Ana Reyes",
  email: "ana@example.com",
  time_zone: "America/New_York",
  attributes: {
    licensed_in: %w[NY NJ]
  },
  locations: []
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**uid:** `String` — Your own id for this host, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — The host's name.
    
</dd>
</dl>

<dl>
<dd>

**email:** `String` — Where this host's notifications go. Not an identity, and need not be unique.
    
</dd>
</dl>

<dl>
<dd>

**phone:** `String` — Where this host's SMS reminders go, in E.164.
    
</dd>
</dl>

<dl>
<dd>

**calendar_account:** `String` — The mailbox a calendar delegation connects for this host, when it isn't `email` or the delegation doesn't match on email. In Microsoft 365, their user principal name.
    
</dd>
</dl>

<dl>
<dd>

**time_zone:** `String` — An IANA time zone name.
    
</dd>
</dl>

<dl>
<dd>

**locale:** `String` — What this host's notifications are written in, such as `de`. Default: English. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `Internal::Types::Hash[String, Coss::Scheduling::Hosts::Types::CreateHostRequestAttributesValue]` — What pools filter hosts by, such as `{ "licensed_in": ["CA", "NY"], "language": "es" }`.
    
</dd>
</dl>

<dl>
<dd>

**locations:** `Internal::Types::Array[Coss::Types::SchedulingHostLocation]` — This host's own office, meeting link and phone number. An event type's location that leaves its value blank uses them.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs. Don't put sensitive data here.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Hosts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.hosts.<a href="/lib/Coss/scheduling/hosts/client.rb">get</a>(host:) -> Coss::Types::SchedulingHost</code></summary>
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

```ruby
client.scheduling.hosts.get(host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Hosts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.hosts.<a href="/lib/Coss/scheduling/hosts/client.rb">remove</a>(host:) -> Coss::Types::DeletedSchedulingHost</code></summary>
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

```ruby
client.scheduling.hosts.remove(host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Hosts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.hosts.<a href="/lib/Coss/scheduling/hosts/client.rb">update</a>(host:, request) -> Coss::Types::SchedulingHost</code></summary>
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

```ruby
client.scheduling.hosts.update(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  status: "disabled"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `String` — Your own id for this host, unique in the environment.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — The host's name.
    
</dd>
</dl>

<dl>
<dd>

**email:** `String` — Where this host's notifications go. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**phone:** `String` — Where this host's SMS reminders go, in E.164. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**calendar_account:** `String` — Moves the host's delegated calendar to this mailbox. Refused while they have upcoming bookings or holds.
    
</dd>
</dl>

<dl>
<dd>

**time_zone:** `String` — An IANA time zone name.
    
</dd>
</dl>

<dl>
<dd>

**locale:** `String` — What this host's notifications are written in, such as `de`. Default: English. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `Internal::Types::Hash[String, Coss::Scheduling::Hosts::Types::UpdateHostRequestAttributesValue]` — What pools filter hosts by, such as `{ "licensed_in": ["CA", "NY"], "language": "es" }`.
    
</dd>
</dl>

<dl>
<dd>

**locations:** `Internal::Types::Array[Coss::Types::SchedulingHostLocation]` — Replaces this host's own locations. Existing bookings keep the location they have.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs. Don't put sensitive data here.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Scheduling::Hosts::Types::UpdateHostRequestStatus` — A `disabled` host isn't offered. Its existing bookings stay.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Hosts::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Schedules
<details><summary><code>client.scheduling.schedules.<a href="/lib/Coss/scheduling/schedules/client.rb">list</a>(host:) -> Coss::Types::SchedulingScheduleList</code></summary>
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

```ruby
client.scheduling.schedules.list(host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Schedules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.schedules.<a href="/lib/Coss/scheduling/schedules/client.rb">create</a>(host:, request) -> Coss::Types::SchedulingSchedule</code></summary>
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

```ruby
client.scheduling.schedules.create(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  name: "Clinic hours",
  rules: [{
    days: [1, 2, 3, 4, 5],
    start: "09:00",
    end_: "17:00"
  }],
  overrides: [{
    date: "2027-12-24",
    ranges: [{
      start: "start",
      end_: "end"
    }]
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request:** `Coss::Types::UpsertScheduleRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Schedules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.schedules.<a href="/lib/Coss/scheduling/schedules/client.rb">get</a>(host:, schedule_id:) -> Coss::Types::SchedulingSchedule</code></summary>
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

```ruby
client.scheduling.schedules.get(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  schedule_id: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**schedule_id:** `String` — The schedule's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Schedules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.schedules.<a href="/lib/Coss/scheduling/schedules/client.rb">update</a>(host:, schedule_id:, request) -> Coss::Types::SchedulingSchedule</code></summary>
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

```ruby
client.scheduling.schedules.update(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  schedule_id: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
  name: "Clinic hours",
  rules: [{
    days: [1, 2, 3, 4, 5],
    start: "09:00",
    end_: "17:00"
  }],
  overrides: [{
    date: "2027-12-24",
    ranges: [{
      start: "start",
      end_: "end"
    }]
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**schedule_id:** `String` — The schedule's id.
    
</dd>
</dl>

<dl>
<dd>

**request:** `Coss::Types::UpsertScheduleRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Schedules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.schedules.<a href="/lib/Coss/scheduling/schedules/client.rb">remove</a>(host:, schedule_id:) -> Coss::Types::DeletedSchedulingSchedule</code></summary>
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

```ruby
client.scheduling.schedules.remove(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  schedule_id: "sched_01kd2m9a0b1c2d3e4f5g6h7j8m"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**schedule_id:** `String` — The schedule's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Schedules::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling EventTypes
<details><summary><code>client.scheduling.event_types.<a href="/lib/Coss/scheduling/event_types/client.rb">list</a>() -> Coss::Types::SchedulingEventTypeList</code></summary>
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

```ruby
client.scheduling.event_types.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — The last id of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.event_types.<a href="/lib/Coss/scheduling/event_types/client.rb">create</a>(request) -> Coss::Types::SchedulingEventType</code></summary>
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

```ruby
client.scheduling.event_types.create(
  kind: "one_on_one",
  title: "Initial consultation",
  duration_minutes: 30,
  buffer_after_minutes: 10,
  min_notice_minutes: 120,
  hosts: [{
    host: "doctor_482"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**uid:** `String` — Your own id for this event type, unique in the environment, accepted wherever its id is.
    
</dd>
</dl>

<dl>
<dd>

**kind:** `Coss::Scheduling::EventTypes::Types::CreateEventTypeRequestKind` — Who a booking needs. `one_on_one`: one host. `pool`: any one of its hosts. `collective`: every `required` host, plus at most one `member`. `group`: one host, with attendees taking seats up to `capacity`. Fixed once created.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Plain text about the event type, shown on hosted booking pages and never in emails. Links, and anything shaped like a domain, must be on your organization's verified domains or their subdomains, and use `https`. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**title:** `String` — Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.
    
</dd>
</dl>

<dl>
<dd>

**duration_minutes:** `Integer` — How long a booking lasts by default, in minutes.
    
</dd>
</dl>

<dl>
<dd>

**duration_options:** `Internal::Types::Array[Integer]` — Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.
    
</dd>
</dl>

<dl>
<dd>

**step_minutes:** `Integer` — How far apart slots start. Default: the duration.
    
</dd>
</dl>

<dl>
<dd>

**grid_time_zone:** `String` — The zone slots align in. Default: each host's own.
    
</dd>
</dl>

<dl>
<dd>

**buffer_before_minutes:** `Integer` — Minutes kept free before each booking. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**buffer_after_minutes:** `Integer` — Minutes kept free after each booking. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**min_notice_minutes:** `Integer` — Slots starting sooner than this many minutes from now aren't offered. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**booking_window:** `Coss::Types::SchedulingBookingWindow` 
    
</dd>
</dl>

<dl>
<dd>

**limits:** `Internal::Types::Array[Coss::Types::SchedulingLimit]` — Caps on bookings per day or week. Default: none.
    
</dd>
</dl>

<dl>
<dd>

**capacity:** `Integer` — Attendees per session. Required for, and only allowed on, `group`.
    
</dd>
</dl>

<dl>
<dd>

**requires_approval:** `Internal::Types::Boolean` — Bookings start as `pending_approval`, holding the time until approved or declined. Default: `false`.
    
</dd>
</dl>

<dl>
<dd>

**approval_ttl_minutes:** `Integer` — How long a booking can wait for approval before it's declined, in minutes. Default: 1440.
    
</dd>
</dl>

<dl>
<dd>

**hold_ttl_seconds:** `Integer` — How long a hold keeps its slot, in seconds. Default: 600.
    
</dd>
</dl>

<dl>
<dd>

**cancel_notice_minutes:** `Integer` — Attendees can't cancel closer to the start than this. API keys can.
    
</dd>
</dl>

<dl>
<dd>

**reschedule_notice_minutes:** `Integer` — Attendees can't reschedule closer to the start than this. API keys can. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**max_guests:** `Integer` — How many people an attendee can add to a booking. Default: 0. Guests are emailed about it. Not on `group`.
    
</dd>
</dl>

<dl>
<dd>

**max_active_bookings_per_attendee:** `Integer` — How many upcoming bookings of this event type one person can have at a time, known by `uid` or email. Default: `null`, no limit. Past this, booking answers `attendee_limit_reached`. Guests don't count, and each occurrence of a series does.
    
</dd>
</dl>

<dl>
<dd>

**host_calendar_details:** `Coss::Scheduling::EventTypes::Types::CreateEventTypeRequestHostCalendarDetails` — What hosts' calendars say about a booking. `neutral` (the default): a private event titled "Appointment". `full`: a private event with this title and the attendee's name, plus names, emails and phone numbers in its description, which go to the host's calendar provider. Never answers. Refused in HIPAA mode.
    
</dd>
</dl>

<dl>
<dd>

**questions:** `Internal::Types::Array[Coss::Types::SchedulingQuestion]` — What attendees are asked when booking. Keys must be unique.
    
</dd>
</dl>

<dl>
<dd>

**locations:** `Internal::Types::Array[Coss::Types::SchedulingLocation]` — Where bookings can meet. A browser only chooses among these. A `group` event type can't use `zoom`.
    
</dd>
</dl>

<dl>
<dd>

**host_filter:** `Internal::Types::Hash[String, Coss::Scheduling::EventTypes::Types::CreateEventTypeRequestHostFilterValue]` — Pool members also include active hosts matching all of these attributes.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `Internal::Types::Hash[String, Coss::Scheduling::EventTypes::Types::CreateEventTypeRequestNotificationsValue]` — Per event, overriding your settings for this event type.
    
</dd>
</dl>

<dl>
<dd>

**reminders:** `Internal::Types::Array[Coss::Types::SchedulingReminderInput]` — Replaces your settings' `reminders` for this event type. `null` inherits them; an empty list means none.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs.
    
</dd>
</dl>

<dl>
<dd>

**hosts:** `Internal::Types::Array[Coss::Types::SchedulingEventTypeHostInput]` — Who can be booked. `one_on_one` and `group` take one; `collective` needs at least one `required` host.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.event_types.<a href="/lib/Coss/scheduling/event_types/client.rb">get</a>(event_type:) -> Coss::Types::SchedulingEventType</code></summary>
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

```ruby
client.scheduling.event_types.get(event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event_type:** `String` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.event_types.<a href="/lib/Coss/scheduling/event_types/client.rb">update</a>(event_type:, request) -> Coss::Types::SchedulingEventType</code></summary>
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

```ruby
client.scheduling.event_types.update(
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  min_notice_minutes: 240
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event_type:** `String` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**uid:** `String` — Your own id for this event type. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**description:** `String` — Plain text about the event type, shown on hosted booking pages and never in emails. Links, and anything shaped like a domain, must be on your organization's verified domains or their subdomains, and use `https`. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**title:** `String` — Shown to attendees and in emails. Host calendars show it only with `host_calendar_details: full`.
    
</dd>
</dl>

<dl>
<dd>

**duration_minutes:** `Integer` — How long a booking lasts by default, in minutes.
    
</dd>
</dl>

<dl>
<dd>

**duration_options:** `Internal::Types::Array[Integer]` — Other lengths an attendee may choose, in minutes. Empty: only `duration_minutes`.
    
</dd>
</dl>

<dl>
<dd>

**step_minutes:** `Integer` — How far apart slots start. Default: the duration.
    
</dd>
</dl>

<dl>
<dd>

**grid_time_zone:** `String` — The zone slots align in. Default: each host's own.
    
</dd>
</dl>

<dl>
<dd>

**buffer_before_minutes:** `Integer` — Minutes kept free before each booking. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**buffer_after_minutes:** `Integer` — Minutes kept free after each booking. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**min_notice_minutes:** `Integer` — Slots starting sooner than this many minutes from now aren't offered. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**booking_window:** `Coss::Types::SchedulingBookingWindow` 
    
</dd>
</dl>

<dl>
<dd>

**limits:** `Internal::Types::Array[Coss::Types::SchedulingLimit]` — Caps on bookings per day or week. Default: none.
    
</dd>
</dl>

<dl>
<dd>

**capacity:** `Integer` — Attendees per session. Required for, and only allowed on, `group`.
    
</dd>
</dl>

<dl>
<dd>

**requires_approval:** `Internal::Types::Boolean` — Bookings start as `pending_approval`, holding the time until approved or declined. Default: `false`.
    
</dd>
</dl>

<dl>
<dd>

**approval_ttl_minutes:** `Integer` — How long a booking can wait for approval before it's declined, in minutes. Default: 1440.
    
</dd>
</dl>

<dl>
<dd>

**hold_ttl_seconds:** `Integer` — How long a hold keeps its slot, in seconds. Default: 600.
    
</dd>
</dl>

<dl>
<dd>

**cancel_notice_minutes:** `Integer` — Attendees can't cancel closer to the start than this. API keys can.
    
</dd>
</dl>

<dl>
<dd>

**reschedule_notice_minutes:** `Integer` — Attendees can't reschedule closer to the start than this. API keys can. Default: 0.
    
</dd>
</dl>

<dl>
<dd>

**max_guests:** `Integer` — How many people an attendee can add to a booking. Default: 0. Guests are emailed about it. Not on `group`.
    
</dd>
</dl>

<dl>
<dd>

**max_active_bookings_per_attendee:** `Integer` — How many upcoming bookings of this event type one person can have at a time, known by `uid` or email. Default: `null`, no limit. Past this, booking answers `attendee_limit_reached`. Guests don't count, and each occurrence of a series does.
    
</dd>
</dl>

<dl>
<dd>

**host_calendar_details:** `Coss::Scheduling::EventTypes::Types::UpdateEventTypeRequestHostCalendarDetails` — What hosts' calendars say about a booking. `neutral` (the default): a private event titled "Appointment". `full`: a private event with this title and the attendee's name, plus names, emails and phone numbers in its description, which go to the host's calendar provider. Never answers. Refused in HIPAA mode.
    
</dd>
</dl>

<dl>
<dd>

**questions:** `Internal::Types::Array[Coss::Types::SchedulingQuestion]` — What attendees are asked when booking. Keys must be unique.
    
</dd>
</dl>

<dl>
<dd>

**locations:** `Internal::Types::Array[Coss::Types::SchedulingLocation]` — Where bookings can meet. A browser only chooses among these. A `group` event type can't use `zoom`.
    
</dd>
</dl>

<dl>
<dd>

**host_filter:** `Internal::Types::Hash[String, Coss::Scheduling::EventTypes::Types::UpdateEventTypeRequestHostFilterValue]` — Pool members also include active hosts matching all of these attributes.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `Internal::Types::Hash[String, Coss::Scheduling::EventTypes::Types::UpdateEventTypeRequestNotificationsValue]` — Per event, overriding your settings for this event type.
    
</dd>
</dl>

<dl>
<dd>

**reminders:** `Internal::Types::Array[Coss::Types::SchedulingReminderInput]` — Replaces your settings' `reminders` for this event type. `null` inherits them; an empty list means none.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Scheduling::EventTypes::Types::UpdateEventTypeRequestStatus` — `archived` stops new bookings, and keeps existing ones.
    
</dd>
</dl>

<dl>
<dd>

**hosts:** `Internal::Types::Array[Coss::Types::SchedulingEventTypeHostInput]` — Replaces the assigned hosts. Removed hosts keep their existing bookings.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::EventTypes::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Slots
<details><summary><code>client.scheduling.slots.<a href="/lib/Coss/scheduling/slots/client.rb">list</a>(event_type:) -> Coss::Types::SchedulingSlotList</code></summary>
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

```ruby
client.scheduling.slots.list(
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-01-04T15:00:00.000Z",
  end_: "2027-01-04T15:00:00.000Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event_type:** `String` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**end_:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**host:** `String` — Only this host's slots (id or uid).
    
</dd>
</dl>

<dl>
<dd>

**duration_minutes:** `Integer` 
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `String` — A JSON object narrowing a pool, such as `{"licensed_in":"CA"}`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Slots::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.slots.<a href="/lib/Coss/scheduling/slots/client.rb">explain</a>(event_type:) -> Coss::Types::SchedulingSlotExplanation</code></summary>
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

```ruby
client.scheduling.slots.explain(
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-01-04T15:00:00.000Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event_type:** `String` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**host:** `String` — Only this host (id or uid).
    
</dd>
</dl>

<dl>
<dd>

**duration_minutes:** `Integer` 
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `String` — A JSON object narrowing a pool, such as `{"licensed_in":"CA"}`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Slots::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Availability
<details><summary><code>client.scheduling.availability.<a href="/lib/Coss/scheduling/availability/client.rb">search</a>(request) -> Coss::Types::SchedulingAvailabilitySearchResult</code></summary>
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

```ruby
client.scheduling.availability.search(
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-01-04T00:00:00.000Z",
  end_: "2027-01-18T00:00:00.000Z",
  attributes: {
    licensed_in: "CA"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event_type:** `String` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**end_:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `Internal::Types::Hash[String, Coss::Scheduling::Availability::Types::AvailabilitySearchRequestAttributesValue]` — Only hosts matching all of these.
    
</dd>
</dl>

<dl>
<dd>

**hosts:** `Internal::Types::Array[String]` — Only these hosts (ids or uids). Default: everyone the event type could offer.
    
</dd>
</dl>

<dl>
<dd>

**slots_per_host:** `Integer` — How many of each host's soonest slots to return.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — Hosts to return, soonest availability first.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Availability::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Bookings
<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">list</a>() -> Coss::Types::SchedulingBookingList</code></summary>
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

```ruby
client.scheduling.bookings.list(
  start_after: "2027-01-04T15:00:00.000Z",
  start_before: "2027-01-04T15:00:00.000Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — The last id of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**host:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**event_type:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::Scheduling::Bookings::Types::ListBookingsRequestStatus` 
    
</dd>
</dl>

<dl>
<dd>

**attendee_uid:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**start_after:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**start_before:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">create</a>(request) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.bookings.create(
  idempotency_key: "welcome-user-123",
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-01-04T15:00:00.000Z",
  attendee: {
    uid: "patient_77",
    name: "Sam Lee",
    email: "sam@example.com",
    time_zone: "UTC"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**event_type:** `String` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**host:** `String` — A specific host (id or uid). Default: chosen fairly from those free.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `Internal::Types::Hash[String, Coss::Scheduling::Bookings::Types::CreateBookingRequestAttributesValue]` — Only choose among pool hosts matching all of these.
    
</dd>
</dl>

<dl>
<dd>

**duration_minutes:** `Integer` — One of the event type's `duration_options`.
    
</dd>
</dl>

<dl>
<dd>

**attendee:** `Coss::Types::SchedulingAttendeeInput` 
    
</dd>
</dl>

<dl>
<dd>

**guests:** `Internal::Types::Array[Coss::Types::SchedulingGuestInput]` — Up to the event type's `max_guests`.
    
</dd>
</dl>

<dl>
<dd>

**answers:** `Internal::Types::Hash[String, Coss::Scheduling::Bookings::Types::CreateBookingRequestAnswersValue]` — Answers to the event type's questions. Stored encrypted, and returned only by retrieving the booking.
    
</dd>
</dl>

<dl>
<dd>

**location:** `Coss::Scheduling::Bookings::Types::CreateBookingRequestLocation` — One of the event type's `locations`, with your link filled in if it has none.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs. Don't put sensitive data here.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">get</a>(id:) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.bookings.get(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">reschedule</a>(id:, request) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.bookings.reschedule(
  id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-01-05T15:00:00.000Z"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**start:** `String` — The new start. The old time stays booked unless this one's free.
    
</dd>
</dl>

<dl>
<dd>

**host:** `String` — Move a pool booking to this host. Default: its current hosts.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">cancel</a>(id:, request) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.bookings.cancel(
  id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
  reason: "Feeling better"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**reason:** `String` — Why it's being cancelled. Only retrieving this booking returns it: it's never in webhooks, logs or emails.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">events</a>(id:) -> Coss::Types::SchedulingBookingEventList</code></summary>
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

```ruby
client.scheduling.bookings.events(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — The last id of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">approve</a>(id:) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.bookings.approve(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">decline</a>(id:) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.bookings.decline(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">notifications</a>(id:) -> Coss::Types::SchedulingBookingNotificationList</code></summary>
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

```ruby
client.scheduling.bookings.notifications(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` 
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — The last id of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">mark_no_show</a>(id:) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.bookings.mark_no_show(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.bookings.<a href="/lib/Coss/scheduling/bookings/client.rb">update_location</a>(id:, request) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.bookings.update_location(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**location:** `Coss::Types::SchedulingLocation` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Bookings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Holds
<details><summary><code>client.scheduling.holds.<a href="/lib/Coss/scheduling/holds/client.rb">create</a>(request) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.holds.create(
  idempotency_key: "welcome-user-123",
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-01-04T15:00:00.000Z",
  attendee: {
    uid: "patient_77",
    time_zone: "UTC"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**event_type:** `String` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**start:** `String` — An ISO 8601 instant with an offset.
    
</dd>
</dl>

<dl>
<dd>

**host:** `String` — A specific host (id or uid). Default: chosen fairly from those free.
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `Internal::Types::Hash[String, Coss::Scheduling::Holds::Types::CreateHoldRequestAttributesValue]` — Only choose among pool hosts matching all of these.
    
</dd>
</dl>

<dl>
<dd>

**duration_minutes:** `Integer` — One of the event type's `duration_options`.
    
</dd>
</dl>

<dl>
<dd>

**attendee:** `Coss::Types::SchedulingAttendeeInput` 
    
</dd>
</dl>

<dl>
<dd>

**guests:** `Internal::Types::Array[Coss::Types::SchedulingGuestInput]` — Up to the event type's `max_guests`.
    
</dd>
</dl>

<dl>
<dd>

**answers:** `Internal::Types::Hash[String, Coss::Scheduling::Holds::Types::CreateHoldRequestAnswersValue]` — Answers to the event type's questions. Stored encrypted, and returned only by retrieving the booking.
    
</dd>
</dl>

<dl>
<dd>

**location:** `Coss::Scheduling::Holds::Types::CreateHoldRequestLocation` — One of the event type's `locations`, with your link filled in if it has none.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs. Don't put sensitive data here.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Holds::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.holds.<a href="/lib/Coss/scheduling/holds/client.rb">confirm</a>(id:, request) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.holds.confirm(
  id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
  if_still_free: true
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**if_still_free:** `Internal::Types::Boolean` — After the hold expired, book anyway if nobody else took the slot. Default: refuse with `hold_expired`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Holds::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.holds.<a href="/lib/Coss/scheduling/holds/client.rb">release</a>(id:) -> Coss::Types::SchedulingBooking</code></summary>
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

```ruby
client.scheduling.holds.release(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Holds::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Series
<details><summary><code>client.scheduling.series.<a href="/lib/Coss/scheduling/series/client.rb">create</a>(request) -> Coss::Types::SchedulingSeries</code></summary>
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

```ruby
client.scheduling.series.create(
  idempotency_key: "welcome-user-123",
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-01-04T15:00:00.000Z",
  attendee: {
    uid: "patient_77",
    time_zone: "America/New_York"
  },
  recurrence: {
    frequency: "weekly",
    interval: 1,
    count: 12
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original booking instead of creating another, for 24 hours. A refused request keeps no key. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**request:** `Coss::Types::CreateSeriesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Series::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.series.<a href="/lib/Coss/scheduling/series/client.rb">preview</a>(request) -> Coss::Types::SchedulingSeriesPreview</code></summary>
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

```ruby
client.scheduling.series.preview(
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  start: "2027-01-04T15:00:00.000Z",
  attendee: {
    uid: "patient_77",
    time_zone: "America/New_York"
  },
  recurrence: {
    frequency: "weekly",
    interval: 1,
    count: 12
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Coss::Types::CreateSeriesRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Series::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.series.<a href="/lib/Coss/scheduling/series/client.rb">cancel</a>(id:, request) -> Coss::Types::SchedulingCancelledSeries</code></summary>
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

```ruby
client.scheduling.series.cancel(
  id: "series_01kd2m9a0b1c2d3e4f5g6h7j8m",
  from_index: 4
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The series' id.
    
</dd>
</dl>

<dl>
<dd>

**from_index:** `Integer` — Cancel this occurrence and those after it. Default: all of them.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Series::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Attendees
<details><summary><code>client.scheduling.attendees.<a href="/lib/Coss/scheduling/attendees/client.rb">erase</a>(uid:) -> Coss::Types::SchedulingAttendeeErasure</code></summary>
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

```ruby
client.scheduling.attendees.erase(uid: "patient_77")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**uid:** `String` — Your id for the attendee.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Attendees::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.attendees.<a href="/lib/Coss/scheduling/attendees/client.rb">erase_by_email</a>(request) -> Coss::Types::SchedulingAttendeeErasureByEmail</code></summary>
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

```ruby
client.scheduling.attendees.erase_by_email(email: "sam@example.com")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**email:** `String` — The address to forget, an attendee's or a guest's.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Attendees::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Calendars
<details><summary><code>client.scheduling.calendars.<a href="/lib/Coss/scheduling/calendars/client.rb">authorize</a>(host:, request) -> Coss::Types::SchedulingCalendarAuthorization</code></summary>
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

```ruby
client.scheduling.calendars.authorize(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  provider: "google"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**provider:** `Coss::Scheduling::Calendars::Types::AuthorizeCalendarRequestProvider` — Whose consent page to open. CalDAV connects with a password instead.
    
</dd>
</dl>

<dl>
<dd>

**return_url:** `String` — Where to send the browser afterwards, on one of the environment's allowed origins. `coss_calendar` says what happened: `connected`, `denied` or `invalid`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Calendars::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendars.<a href="/lib/Coss/scheduling/calendars/client.rb">list</a>(host:) -> Coss::Types::SchedulingCalendarConnectionList</code></summary>
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

```ruby
client.scheduling.calendars.list(host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Calendars::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendars.<a href="/lib/Coss/scheduling/calendars/client.rb">connect</a>(host:, request) -> Coss::Types::SchedulingCalendarConnection</code></summary>
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

```ruby
client.scheduling.calendars.connect(host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**request:** `Coss::Types::CreateCalendarConnectionRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Calendars::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendars.<a href="/lib/Coss/scheduling/calendars/client.rb">disconnect</a>(host:, id:) -> Coss::Types::DeletedSchedulingCalendarConnection</code></summary>
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

```ruby
client.scheduling.calendars.disconnect(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  id: "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**id:** `String` — The connection's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Calendars::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendars.<a href="/lib/Coss/scheduling/calendars/client.rb">update</a>(host:, calendar_id:, request) -> Coss::Types::SchedulingCalendarConnectionList</code></summary>
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

```ruby
client.scheduling.calendars.update(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  calendar_id: "cal_01kd2m9a0b1c2d3e4f5g6h7j8m",
  read_busy: true
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**calendar_id:** `String` — The calendar's id.
    
</dd>
</dl>

<dl>
<dd>

**read_busy:** `Internal::Types::Boolean` — Whether this calendar's busy times block slots.
    
</dd>
</dl>

<dl>
<dd>

**write_target:** `Internal::Types::Boolean` — Bookings are written to one calendar; setting this moves it here.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Calendars::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendars.<a href="/lib/Coss/scheduling/calendars/client.rb">set_simulated_busy</a>(host:, request) -> </code></summary>
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

```ruby
client.scheduling.calendars.set_simulated_busy(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  intervals: [{
    start: "2027-01-04T15:00:00.000Z",
    end_: "2027-01-04T16:00:00.000Z"
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**intervals:** `Internal::Types::Array[Coss::Scheduling::Calendars::Types::SetSimulatedBusyRequestIntervalsItem]` — The simulated calendar's busy times.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Calendars::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling CalendarDelegations
<details><summary><code>client.scheduling.calendar_delegations.<a href="/lib/Coss/scheduling/calendar_delegations/client.rb">list</a>() -> Coss::Types::SchedulingCalendarDelegationList</code></summary>
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

```ruby
client.scheduling.calendar_delegations.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Scheduling::CalendarDelegations::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendar_delegations.<a href="/lib/Coss/scheduling/calendar_delegations/client.rb">create</a>(request) -> Coss::Types::SchedulingCalendarDelegation</code></summary>
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

```ruby
client.scheduling.calendar_delegations.create
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request:** `Coss::Types::CreateCalendarDelegationRequest` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::CalendarDelegations::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendar_delegations.<a href="/lib/Coss/scheduling/calendar_delegations/client.rb">get</a>(id:) -> Coss::Types::SchedulingCalendarDelegation</code></summary>
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

```ruby
client.scheduling.calendar_delegations.get(id: "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The delegation's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::CalendarDelegations::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendar_delegations.<a href="/lib/Coss/scheduling/calendar_delegations/client.rb">delete</a>(id:) -> Coss::Types::DeletedSchedulingCalendarDelegation</code></summary>
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

```ruby
client.scheduling.calendar_delegations.delete(id: "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The delegation's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::CalendarDelegations::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendar_delegations.<a href="/lib/Coss/scheduling/calendar_delegations/client.rb">update</a>(id:, request) -> Coss::Types::SchedulingCalendarDelegation</code></summary>
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

```ruby
client.scheduling.calendar_delegations.update(
  id: "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
  match_host_email: false
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The delegation's id.
    
</dd>
</dl>

<dl>
<dd>

**match_host_email:** `Internal::Types::Boolean` — Whether a host's `email` picks their mailbox when `calendar_account` isn't set. Turn it off if end users can type their own email into your app: otherwise one could name a colleague's address and reach that calendar.
    
</dd>
</dl>

<dl>
<dd>

**service_account_key:** `String` — A new key. It's tried on the verified mailbox before it replaces the old one.
    
</dd>
</dl>

<dl>
<dd>

**client_secret:** `String` — A new client secret. It's tried on the verified mailbox before it replaces the old one.
    
</dd>
</dl>

<dl>
<dd>

**secret_expires_at:** `String` — When the Entra client secret expires. Owners and admins are warned 14 days before.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::CalendarDelegations::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.calendar_delegations.<a href="/lib/Coss/scheduling/calendar_delegations/client.rb">verify</a>(id:, request) -> Coss::Types::SchedulingCalendarDelegation</code></summary>
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

```ruby
client.scheduling.calendar_delegations.verify(
  id: "caldlg_01kd2m9a0b1c2d3e4f5g6h7j8m",
  account: "ana@example.com"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The delegation's id.
    
</dd>
</dl>

<dl>
<dd>

**account:** `String` — A real mailbox on the domain to try. In Microsoft 365, a user principal name.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::CalendarDelegations::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Sessions
<details><summary><code>client.scheduling.sessions.<a href="/lib/Coss/scheduling/sessions/client.rb">create_for_host</a>(host:, request) -> Coss::Types::SchedulingSession</code></summary>
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

```ruby
client.scheduling.sessions.create_for_host(
  host: "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
  expires_in: 3600
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**host:** `String` — The host's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**expires_in:** `Integer` — Seconds until it stops working. At most a day.
    
</dd>
</dl>

<dl>
<dd>

**read_only:** `Internal::Types::Boolean` — The host can look but not change anything.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Sessions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.sessions.<a href="/lib/Coss/scheduling/sessions/client.rb">create_for_booker</a>(request) -> Coss::Types::SchedulingSession</code></summary>
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

```ruby
client.scheduling.sessions.create_for_booker(
  event_type: "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
  attendee: {
    uid: "patient_77",
    name: "Sam Lee",
    time_zone: "UTC"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**event_type:** `String` — The event type's id or uid.
    
</dd>
</dl>

<dl>
<dd>

**host:** `String` — Only this host (id or uid).
    
</dd>
</dl>

<dl>
<dd>

**attributes:** `Internal::Types::Hash[String, Coss::Scheduling::Sessions::Types::CreateSchedulingBookerSessionRequestAttributesValue]` — Only offer times, and book, among pool hosts matching all of these. The browser can't see or change them.
    
</dd>
</dl>

<dl>
<dd>

**attendee:** `Coss::Scheduling::Sessions::Types::CreateSchedulingBookerSessionRequestAttendee` — Who's booking, if you already know: the browser then can't change it.
    
</dd>
</dl>

<dl>
<dd>

**expires_in:** `Integer` — Seconds until it stops working. At most a day.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Sessions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.sessions.<a href="/lib/Coss/scheduling/sessions/client.rb">create_for_booking</a>(id:) -> Coss::Types::SchedulingSession</code></summary>
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

```ruby
client.scheduling.sessions.create_for_booking(id: "book_01kd2m9a0b1c2d3e4f5g6h7j8m")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The booking's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Sessions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Scheduling Settings
<details><summary><code>client.scheduling.settings.<a href="/lib/Coss/scheduling/settings/client.rb">get</a>() -> Coss::Types::SchedulingSettings</code></summary>
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

```ruby
client.scheduling.settings.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Settings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.scheduling.settings.<a href="/lib/Coss/scheduling/settings/client.rb">update</a>(request) -> Coss::Types::SchedulingSettings</code></summary>
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

```ruby
client.scheduling.settings.update(brand_name: "Acme Health")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**allowed_origins:** `Internal::Types::Array[String]` — Sites allowed to embed coss.com's hosted pages and call the client API, as `https://host` origins.
    
</dd>
</dl>

<dl>
<dd>

**brand_name:** `String` — Your name on hosted pages and on emails sent from `email_from`. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**accent_color:** `String` — The accent color as `#RRGGBB`. `null` restores the default.
    
</dd>
</dl>

<dl>
<dd>

**logo:** `Coss::Scheduling::Settings::Types::UpdateSchedulingSettingsRequestLogo` — Your logo, a PNG or JPEG. `null` removes it.
    
</dd>
</dl>

<dl>
<dd>

**email_from:** `String` — Sender of booking emails, on a verified domain. `null`: coss.com's own address.
    
</dd>
</dl>

<dl>
<dd>

**sms_from:** `String` — Your approved number for SMS reminders, in E.164. `null`: no SMS is sent.
    
</dd>
</dl>

<dl>
<dd>

**calendar_failure_mode:** `Coss::Scheduling::Settings::Types::UpdateSchedulingSettingsRequestCalendarFailureMode` — When a host's calendar can't be read: `hide` stops offering them, `last_known` keeps offering their last known times.
    
</dd>
</dl>

<dl>
<dd>

**notifications:** `Internal::Types::Hash[String, Coss::Scheduling::Settings::Types::UpdateSchedulingSettingsRequestNotificationsValue]` — Per event (`confirmed`, `pending_approval`, `rescheduled`, `cancelled`, `declined`, `reminder`), overriding the defaults. `null` restores them.
    
</dd>
</dl>

<dl>
<dd>

**email_reply_to:** `String` — Where replies go, for emails from `email_from`.
    
</dd>
</dl>

<dl>
<dd>

**reminders:** `Internal::Types::Array[Coss::Types::SchedulingReminderInput]` — What goes out around a booking, unless an event type has its own. `null` goes back to a reminder a day before.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Scheduling::Settings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Documents
<details><summary><code>client.sign.documents.<a href="/lib/Coss/sign/documents/client.rb">list</a>() -> Coss::Types::SignDocumentList</code></summary>
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

```ruby
client.sign.documents.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Documents::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.documents.<a href="/lib/Coss/sign/documents/client.rb">upload</a>(request) -> Coss::Types::SignDocument</code></summary>
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

```ruby
client.sign.documents.upload(
  filename: "agreement.pdf",
  content: "JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNCAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovVHlwZSAvRm9udAovU3VidHlwZSAvVHlwZTEKL0Jhc2VGb250IC9IZWx2ZXRpY2EKL0VuY29kaW5nIC9XaW5BbnNpRW5jb2RpbmcKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9QYXJlbnQgMSAwIFIKL1Jlc291cmNlcyA8PAovRm9udCA8PAovSGVsdmV0aWNhLTcwOTg0ODA3ODkgMyAwIFIKPj4KL1hPYmplY3QgPDwKPj4KL0V4dEdTdGF0ZSA8PAo+Pgo+PgovTWVkaWFCb3ggWyAwIDAgNjEyIDc5MiBdCi9Bbm5vdHMgWyBdCi9Db250ZW50cyBbIDUgMCBSIF0KPj4KZW5kb2JqCgo1IDAgb2JqCjw8Ci9GaWx0ZXIgL0ZsYXRlRGVjb2RlCi9MZW5ndGggMTIwCj4+CnN0cmVhbQp4nG2KMQrCQBBF+znF1II4O7s7fxckYEjEwkaYC4hEiWgREc9vtLCSV/3330Stk/CHx4VWu+H2Gp7j6biE1JKKoFQOyn4mTex7Ct80MJQhwn6ndY5WDdZbQEKGWo4bFbQzf56fm3fexoAOXcN+JV9Q73SgN3RWIBIKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE2IDAwMDAwIG4gCjAwMDAwMDAwNzYgMDAwMDAgbiAKMDAwMDAwMDEyNiAwMDAwMCBuIAowMDAwMDAwMjI0IDAwMDAwIG4gCjAwMDAwMDA0MTkgMDAwMDAgbiAKCnRyYWlsZXIKPDwKL1NpemUgNgovUm9vdCAyIDAgUgo+PgoKc3RhcnR4cmVmCjYxMgolJUVPRg=="
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**filename:** `String` — The file's name, ending in `.pdf`.
    
</dd>
</dl>

<dl>
<dd>

**content:** `String` — The PDF's bytes, base64-encoded (at most 25 MB decoded).
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Documents::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.documents.<a href="/lib/Coss/sign/documents/client.rb">get</a>(id:) -> Coss::Types::SignDocument</code></summary>
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

```ruby
client.sign.documents.get(id: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The document's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Documents::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.documents.<a href="/lib/Coss/sign/documents/client.rb">remove</a>(id:) -> Coss::Types::DeletedSignDocument</code></summary>
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

```ruby
client.sign.documents.remove(id: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The document's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Documents::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Requests
<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">list</a>() -> Coss::Types::SignRequestList</code></summary>
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

```ruby
client.sign.requests.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**status:** `String` — Only requests in these statuses, comma-separated: `sent,draft`.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">create</a>(request) -> Coss::Types::SignRequest</code></summary>
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

```ruby
client.sign.requests.create(
  idempotency_key: "welcome-user-123",
  title: "Services agreement",
  documents: [{
    document_id: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz"
  }],
  signers: [{
    name: "Ada Lovelace",
    email: "ada@example.com",
    fields: [{
      type: "signature",
      anchor: "{{signature:signer_1}}",
      page: 1,
      x: 1.1,
      y: 1.1,
      width: 1.1,
      height: 1.1
    }, {
      type: "date_signed",
      page: 2,
      x: 320,
      y: 640,
      width: 120,
      height: 18
    }]
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original request (in its current state) instead of creating another, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**title:** `String` — Shown to signers.
    
</dd>
</dl>

<dl>
<dd>

**message:** `String` — A note to signers.
    
</dd>
</dl>

<dl>
<dd>

**documents:** `Internal::Types::Array[Coss::Sign::Requests::Types::CreateSignRequestRequestDocumentsItem]` — Uploaded documents by id, or PDFs inline (base64).
    
</dd>
</dl>

<dl>
<dd>

**signers:** `Internal::Types::Array[Coss::Sign::Requests::Types::CreateSignRequestRequestSignersItem]` — Who signs, and what each fills.
    
</dd>
</dl>

<dl>
<dd>

**signing_order:** `Coss::Sign::Requests::Types::CreateSignRequestRequestSigningOrder` — `parallel` (default): everyone at once. `sequential`: in each signer's `order`.
    
</dd>
</dl>

<dl>
<dd>

**expires_at:** `String` — When unsigned requests expire (at most 365 days ahead).
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs, returned with the request and its webhooks.
    
</dd>
</dl>

<dl>
<dd>

**reminder_interval_days:** `Integer` — Email signers who haven't signed get a reminder every this many days (up to 3). Default: your Sign settings' `reminder_interval_days`; `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**send_:** `Internal::Types::Boolean` — Default `true`: send at once. `false` keeps a `draft` to send later.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">get</a>(id:) -> Coss::Types::SignRequest</code></summary>
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

```ruby
client.sign.requests.get(id: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">remove</a>(id:) -> Coss::Types::DeletedSignRequest</code></summary>
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

```ruby
client.sign.requests.remove(id: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">send_</a>(id:) -> Coss::Types::SignRequest</code></summary>
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

```ruby
client.sign.requests.send_(id: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">cancel</a>(id:) -> Coss::Types::SignRequest</code></summary>
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

```ruby
client.sign.requests.cancel(id: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">audit_trail</a>(id:) -> Coss::Types::SignEventList</code></summary>
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

```ruby
client.sign.requests.audit_trail(id: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">remind</a>(id:) -> Coss::Types::SignRequest</code></summary>
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

```ruby
client.sign.requests.remind(id: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.requests.<a href="/lib/Coss/sign/requests/client.rb">signed_document</a>(id:) -> String</code></summary>
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

```ruby
client.sign.requests.signed_document(id: "id")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Requests::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Sessions
<details><summary><code>client.sign.sessions.<a href="/lib/Coss/sign/sessions/client.rb">create</a>(id:, signer_id:, request) -> Coss::Types::SignSession</code></summary>
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

```ruby
client.sign.sessions.create(
  id: "sreq_01k7c8m4q2f3e9v6t5r1n0p8yz",
  signer_id: "ssgn_01k7c8m4q2f3e9v6t5r1n0p8yz",
  expires_in: 3600
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The signature request's id.
    
</dd>
</dl>

<dl>
<dd>

**signer_id:** `String` — The signer's id (`signers[].id` of the request).
    
</dd>
</dl>

<dl>
<dd>

**expires_in:** `Integer` — Seconds until the link expires: default 3600, at most 86400. Mint one when your user opens the page that shows it.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Sessions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Settings
<details><summary><code>client.sign.settings.<a href="/lib/Coss/sign/settings/client.rb">get</a>() -> Coss::Types::SignSettings</code></summary>
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

```ruby
client.sign.settings.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Sign::Settings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.settings.<a href="/lib/Coss/sign/settings/client.rb">update</a>(request) -> Coss::Types::SignSettings</code></summary>
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

```ruby
client.sign.settings.update(
  allowed_origins: ["https://app.example.com"],
  display_name: "Acme"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**allowed_origins:** `Internal::Types::Array[String]` — Origins that may embed the signing page in an iframe, like `https://app.example.com` (sandbox environments also `http://localhost:<port>`). Empty: it can only be opened on its own.
    
</dd>
</dl>

<dl>
<dd>

**display_name:** `String` — The requester's name signers see. `null`: the organization's name.
    
</dd>
</dl>

<dl>
<dd>

**accent_color:** `String` — The signing page's accent color, as `#RRGGBB`. `null`: the default.
    
</dd>
</dl>

<dl>
<dd>

**theme:** `Coss::Sign::Settings::Types::UpdateSignSettingsRequestTheme` — The signing page's theme. `system` follows the signer's device.
    
</dd>
</dl>

<dl>
<dd>

**disclosure:** `String` — Your own consent text signers accept before they see a document. `null`: coss.com's default. Have your counsel review a replacement.
    
</dd>
</dl>

<dl>
<dd>

**email_from:** `String` — Signing emails come from this address, on a verified domain in live environments. `null`: from coss.com, as "<display name> via coss.com".
    
</dd>
</dl>

<dl>
<dd>

**reminder_interval_days:** `Integer` — The default days between reminders for new requests. `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Settings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sign Templates
<details><summary><code>client.sign.templates.<a href="/lib/Coss/sign/templates/client.rb">list</a>() -> Coss::Types::SignTemplateList</code></summary>
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

```ruby
client.sign.templates.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.templates.<a href="/lib/Coss/sign/templates/client.rb">create</a>(request) -> Coss::Types::SignTemplate</code></summary>
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

```ruby
client.sign.templates.create(
  name: "Mutual NDA",
  documents: [{
    document_id: "sdoc_01k7c8m4q2f3e9v6t5r1n0p8yz"
  }],
  roles: [{
    key: "client",
    name: "Client"
  }, {
    key: "company",
    name: "Company"
  }],
  fields: [{
    type: "signature",
    anchor: "{{signature:client}}",
    role: "client",
    page: 1,
    x: 1.1,
    y: 1.1,
    width: 1.1,
    height: 1.1
  }, {
    type: "text",
    page: 1,
    x: 72,
    y: 140,
    width: 200,
    height: 18,
    role: "client",
    merge_key: "client_company"
  }, {
    type: "signature",
    anchor: "{{signature:company}}",
    role: "company",
    page: 1,
    x: 1.1,
    y: 1.1,
    width: 1.1,
    height: 1.1
  }]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**name:** `String` — Your name for the template.
    
</dd>
</dl>

<dl>
<dd>

**title:** `String` — Requests' title (a request may set its own). Default: `name`.
    
</dd>
</dl>

<dl>
<dd>

**message:** `String` — Requests' message to signers (a request may set its own).
    
</dd>
</dl>

<dl>
<dd>

**signing_order:** `Coss::Sign::Templates::Types::CreateSignTemplateRequestSigningOrder` — `parallel`: everyone at once. `sequential`: in each signer's `order`. Default for its requests.
    
</dd>
</dl>

<dl>
<dd>

**documents:** `Internal::Types::Array[Coss::Sign::Templates::Types::CreateSignTemplateRequestDocumentsItem]` — Uploaded documents by id, or PDFs inline (base64).
    
</dd>
</dl>

<dl>
<dd>

**roles:** `Internal::Types::Array[Coss::Sign::Templates::Types::CreateSignTemplateRequestRolesItem]` — Who signs: each request names one signer per role.
    
</dd>
</dl>

<dl>
<dd>

**fields:** `Internal::Types::Array[Coss::Sign::Templates::Types::CreateSignTemplateRequestFieldsItem]` — Each role's fields, by position or text anchor (resolved when saved). A template can be used once every role has a `signature` field.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.templates.<a href="/lib/Coss/sign/templates/client.rb">get</a>(id:) -> Coss::Types::SignTemplate</code></summary>
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

```ruby
client.sign.templates.get(id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.templates.<a href="/lib/Coss/sign/templates/client.rb">remove</a>(id:) -> Coss::Types::DeletedSignTemplate</code></summary>
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

```ruby
client.sign.templates.remove(id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.templates.<a href="/lib/Coss/sign/templates/client.rb">update</a>(id:, request) -> Coss::Types::SignTemplate</code></summary>
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

```ruby
client.sign.templates.update(
  id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  name: "Mutual NDA (2026)"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id.
    
</dd>
</dl>

<dl>
<dd>

**name:** `String` — Your name for the template.
    
</dd>
</dl>

<dl>
<dd>

**title:** `String` — Requests' title (a request may set its own). Default: `name`.
    
</dd>
</dl>

<dl>
<dd>

**message:** `String` — Requests' message to signers (a request may set its own).
    
</dd>
</dl>

<dl>
<dd>

**signing_order:** `Coss::Sign::Templates::Types::UpdateSignTemplateRequestSigningOrder` — `parallel`: everyone at once. `sequential`: in each signer's `order`. Default for its requests.
    
</dd>
</dl>

<dl>
<dd>

**documents:** `Internal::Types::Array[Coss::Sign::Templates::Types::UpdateSignTemplateRequestDocumentsItem]` — Uploaded documents by id, or PDFs inline (base64).
    
</dd>
</dl>

<dl>
<dd>

**roles:** `Internal::Types::Array[Coss::Sign::Templates::Types::UpdateSignTemplateRequestRolesItem]` — Who signs: each request names one signer per role.
    
</dd>
</dl>

<dl>
<dd>

**fields:** `Internal::Types::Array[Coss::Sign::Templates::Types::UpdateSignTemplateRequestFieldsItem]` — Each role's fields, by position or text anchor (resolved when saved). A template can be used once every role has a `signature` field.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.templates.<a href="/lib/Coss/sign/templates/client.rb">create_request</a>(id:, request) -> Coss::Types::SignRequest</code></summary>
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

```ruby
client.sign.templates.create_request(
  id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  idempotency_key: "welcome-user-123",
  signers: [{
    role: "client",
    name: "Ada Lovelace",
    email: "ada@example.com"
  }, {
    role: "company",
    name: "Grace Hopper",
    email: "grace@acme.com",
    delivery: "embedded"
  }],
  merge_fields: {
    client_company: "Analytical Engines Ltd"
  }
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id.
    
</dd>
</dl>

<dl>
<dd>

**idempotency_key:** `String` — Makes retries safe: a repeated request with the same key and body returns the original request (in its current state) instead of creating another, for 24 hours. 1-256 characters.
    
</dd>
</dl>

<dl>
<dd>

**title:** `String` — Default: the template's title (else its name).
    
</dd>
</dl>

<dl>
<dd>

**message:** `String` — Default: the template's message.
    
</dd>
</dl>

<dl>
<dd>

**signers:** `Internal::Types::Array[Coss::Sign::Templates::Types::CreateSignRequestFromTemplateRequestSignersItem]` — One signer for each of the template's roles.
    
</dd>
</dl>

<dl>
<dd>

**merge_fields:** `Internal::Types::Hash[String, String]` — Values of the template's merge fields, by `merge_key`.
    
</dd>
</dl>

<dl>
<dd>

**signing_order:** `Coss::Sign::Templates::Types::CreateSignRequestFromTemplateRequestSigningOrder` — Default: the template's.
    
</dd>
</dl>

<dl>
<dd>

**expires_at:** `String` — When an unfinished request expires, at most 365 days ahead.
    
</dd>
</dl>

<dl>
<dd>

**metadata:** `Internal::Types::Hash[String, String]` — Your own key-value pairs, returned with the request and its webhooks.
    
</dd>
</dl>

<dl>
<dd>

**reminder_interval_days:** `Integer` — Days between reminders to email signers. Default: your Sign settings'. `null`: none.
    
</dd>
</dl>

<dl>
<dd>

**send_:** `Internal::Types::Boolean` — Default `true`.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sign.templates.<a href="/lib/Coss/sign/templates/client.rb">create_builder_session</a>(id:, request) -> Coss::Types::SignBuilderSession</code></summary>
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

```ruby
client.sign.templates.create_builder_session(
  id: "stpl_01k7c8m4q2f3e9v6t5r1n0p8yz",
  expires_in: 3600
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The template's id.
    
</dd>
</dl>

<dl>
<dd>

**expires_in:** `Integer` — Seconds until the link expires: default 3600, at most 86400.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sign::Templates::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Suppressions
<details><summary><code>client.sms.suppressions.<a href="/lib/Coss/sms/suppressions/client.rb">list</a>() -> Coss::Types::SmsSuppressionList</code></summary>
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

```ruby
client.sms.suppressions.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**phone_number:** `String` — Only this number's entry.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.suppressions.<a href="/lib/Coss/sms/suppressions/client.rb">add</a>(request) -> Coss::Types::SmsSuppression</code></summary>
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

```ruby
client.sms.suppressions.add(phone_number: "+14155550199")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**phone_number:** `String` — The number to suppress, in E.164.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.suppressions.<a href="/lib/Coss/sms/suppressions/client.rb">check</a>() -> Coss::Types::SmsSuppressionCheck</code></summary>
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

```ruby
client.sms.suppressions.check(phone_number: "phone_number")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**phone_number:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.suppressions.<a href="/lib/Coss/sms/suppressions/client.rb">get</a>(id:) -> Coss::Types::SmsSuppression</code></summary>
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

```ruby
client.sms.suppressions.get(id: "smssup_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The entry's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.suppressions.<a href="/lib/Coss/sms/suppressions/client.rb">remove</a>(id:) -> Coss::Types::DeletedSmsSuppression</code></summary>
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

```ruby
client.sms.suppressions.remove(id: "smssup_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The entry's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::Suppressions::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Received
<details><summary><code>client.sms.received.<a href="/lib/Coss/sms/received/client.rb">list</a>() -> Coss::Types::ReceivedSmsList</code></summary>
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

```ruby
client.sms.received.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**from:** `String` — Only messages from this number.
    
</dd>
</dl>

<dl>
<dd>

**to:** `String` — Only messages to this number of yours.
    
</dd>
</dl>

<dl>
<dd>

**created_after:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**created_before:** `String` 
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 20.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last item of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::Received::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.sms.received.<a href="/lib/Coss/sms/received/client.rb">get</a>(id:) -> Coss::Types::ReceivedSms</code></summary>
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

```ruby
client.sms.received.get(id: "smsin_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The received message's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Sms::Received::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Sms Numbers
<details><summary><code>client.sms.numbers.<a href="/lib/Coss/sms/numbers/client.rb">list</a>() -> Coss::Types::SmsNumberList</code></summary>
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

```ruby
client.sms.numbers.list
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Sms::Numbers::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## Verify Settings
<details><summary><code>client.verify.settings.<a href="/lib/Coss/verify/settings/client.rb">get</a>() -> Coss::Types::VerifySettings</code></summary>
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

```ruby
client.verify.settings.get
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**request_options:** `Coss::Verify::Settings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.verify.settings.<a href="/lib/Coss/verify/settings/client.rb">update</a>(request) -> Coss::Types::VerifySettings</code></summary>
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

```ruby
client.verify.settings.update(
  sms_from: "+14155550100",
  allowed_countries: %w[CA GB US]
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**app_name:** `String` — The name codes are sent for; `null`: the project's.
    
</dd>
</dl>

<dl>
<dd>

**code_length:** `Integer` — Digits in a code, 4-10.
    
</dd>
</dl>

<dl>
<dd>

**ttl_seconds:** `Integer` — How long a code works, 60-1800 s.
    
</dd>
</dl>

<dl>
<dd>

**max_attempts:** `Integer` — Wrong codes before a verification fails, 1-10.
    
</dd>
</dl>

<dl>
<dd>

**sms_from:** `String` — One of the organization's numbers; `null`: coss.com's shared numbers.
    
</dd>
</dl>

<dl>
<dd>

**email_from:** `String` — An address on one of the organization's verified domains (live keys); `null`: coss.com's.
    
</dd>
</dl>

<dl>
<dd>

**allowed_countries:** `Internal::Types::Array[String]` — ISO 3166 countries SMS codes may go to.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::Verify::Settings::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

## WebhookEndpoints Deliveries
<details><summary><code>client.webhook_endpoints.deliveries.<a href="/lib/Coss/webhook_endpoints/deliveries/client.rb">list</a>(id:) -> Coss::Types::WebhookDeliveryList</code></summary>
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

```ruby
client.webhook_endpoints.deliveries.list(id: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz")
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**status:** `Coss::WebhookEndpoints::Deliveries::Types::ListDeliveriesRequestStatus` — Only deliveries with this status.
    
</dd>
</dl>

<dl>
<dd>

**event_id:** `String` — Only the delivery of this event.
    
</dd>
</dl>

<dl>
<dd>

**limit:** `Integer` — 1-100, default 50.
    
</dd>
</dl>

<dl>
<dd>

**after:** `String` — Cursor: the `id` of the last delivery of the previous page.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::Deliveries::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_endpoints.deliveries.<a href="/lib/Coss/webhook_endpoints/deliveries/client.rb">get</a>(id:, delivery_id:) -> Coss::Types::WebhookDelivery</code></summary>
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

```ruby
client.webhook_endpoints.deliveries.get(
  id: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  delivery_id: "whdel_01k7c8n2b5d7f9h1k3m5p7r9tv"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**delivery_id:** `String` — The delivery's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::Deliveries::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

<details><summary><code>client.webhook_endpoints.deliveries.<a href="/lib/Coss/webhook_endpoints/deliveries/client.rb">retry_</a>(id:, delivery_id:) -> Coss::Types::WebhookDelivery</code></summary>
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

```ruby
client.webhook_endpoints.deliveries.retry_(
  id: "whep_01k7c8m4q2f3e9v6t5r1n0p8yz",
  delivery_id: "whdel_01k7c8n2b5d7f9h1k3m5p7r9tv"
)
```
</dd>
</dl>
</dd>
</dl>

#### ⚙️ Parameters

<dl>
<dd>

<dl>
<dd>

**id:** `String` — The webhook endpoint's id.
    
</dd>
</dl>

<dl>
<dd>

**delivery_id:** `String` — The delivery's id.
    
</dd>
</dl>

<dl>
<dd>

**request_options:** `Coss::WebhookEndpoints::Deliveries::RequestOptions` 
    
</dd>
</dl>
</dd>
</dl>


</dd>
</dl>
</details>

