using Coss.Hooks;
using Coss.Scheduling;
using Coss.Sign;

namespace Coss;

public partial interface ICossClient
{
    public IEnvironmentClient Environment { get; }
    public IApiKeyClient ApiKey { get; }
    public IEmailClient Email { get; }
    public IDomainsClient Domains { get; }
    public IWebhookEndpointsClient WebhookEndpoints { get; }
    public IWebhookListenersClient WebhookListeners { get; }
    public IWebhookEventsClient WebhookEvents { get; }
    public ISmsClient Sms { get; }
    public IVerifyClient Verify { get; }
    public IFormsClient Forms { get; }
    public IReputationClient Reputation { get; }
    public ILogsClient Logs { get; }
    public IAuditEventsClient AuditEvents { get; }
    public IBillingClient Billing { get; }
    public ILogDrainsClient LogDrains { get; }
    public IInboxesClient Inboxes { get; }
    public IRiskClient Risk { get; }
    public IHooksClient Hooks { get; }
    public ISchedulingClient Scheduling { get; }
    public ISignClient Sign { get; }
}
