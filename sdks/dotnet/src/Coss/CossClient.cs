using Coss.Core;
using Coss.Hooks;
using Coss.Scheduling;
using Coss.Sign;

namespace Coss;

public partial class CossClient : ICossClient
{
    private readonly RawClient _client;

    public CossClient(
        string? apiKey = null,
        string? apiVersion = null,
        ClientOptions? clientOptions = null
    )
    {
        apiKey ??= GetFromEnvironmentOrThrow(
            "COSS_API_KEY",
            "Please pass in apiKey or set the environment variable COSS_API_KEY."
        );
        clientOptions ??= new ClientOptions();
        var platformHeaders = new Headers(
            new Dictionary<string, string>()
            {
                { "X-Fern-Language", "C#" },
                { "X-Fern-SDK-Name", "Coss" },
                { "X-Fern-SDK-Version", global::Coss.Version.Current },
                { "User-Agent", "coss-dotnet/0.3.0" },
            }
        );
        foreach (var header in platformHeaders)
        {
            if (!clientOptions.Headers.ContainsKey(header.Key))
            {
                clientOptions.Headers[header.Key] = header.Value;
            }
        }
        var clientOptionsWithAuth = clientOptions.Clone();
        var authHeaders = new Headers(
            new Dictionary<string, string>()
            {
                { "Authorization", $"Bearer {apiKey ?? ""}" },
                { "Coss-Version", apiVersion ?? "2026-10-10" },
            }
        );
        foreach (var header in authHeaders)
        {
            clientOptionsWithAuth.Headers[header.Key] = header.Value;
        }
        _client = new RawClient(clientOptionsWithAuth);
        Environment = new EnvironmentClient(_client);
        ApiKey = new ApiKeyClient(_client);
        Email = new EmailClient(_client);
        Domains = new DomainsClient(_client);
        WebhookEndpoints = new WebhookEndpointsClient(_client);
        WebhookListeners = new WebhookListenersClient(_client);
        WebhookEvents = new WebhookEventsClient(_client);
        Sms = new SmsClient(_client);
        Verify = new VerifyClient(_client);
        Forms = new FormsClient(_client);
        Reputation = new ReputationClient(_client);
        Logs = new LogsClient(_client);
        AuditEvents = new AuditEventsClient(_client);
        Billing = new BillingClient(_client);
        LogDrains = new LogDrainsClient(_client);
        Inboxes = new InboxesClient(_client);
        Risk = new RiskClient(_client);
        Hooks = new HooksClient(_client);
        Scheduling = new SchedulingClient(_client);
        Sign = new SignClient(_client);
    }

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

    private static string GetFromEnvironmentOrThrow(string env, string message)
    {
        return System.Environment.GetEnvironmentVariable(env) ?? throw new Exception(message);
    }
}
