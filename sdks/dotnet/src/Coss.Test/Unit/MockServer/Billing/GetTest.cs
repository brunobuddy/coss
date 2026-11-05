using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Billing;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class GetTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "billing",
              "organization_id": "organization_id",
              "plan": "free",
              "contract": {
                "id": "id",
                "kind": "self_serve",
                "effective_from": "2024-01-15T09:30:00.000Z",
                "effective_until": "2024-01-15T09:30:00.000Z",
                "term_end": "2024-01-15T09:30:00.000Z",
                "auto_renew": true
              },
              "scheduled_change": {
                "effective_at": "2024-01-15T09:30:00.000Z",
                "plan": "free"
              },
              "status": "active",
              "holds": [
                {
                  "reason": "delinquent",
                  "since": "2024-01-15T09:30:00.000Z"
                },
                {
                  "reason": "delinquent",
                  "since": "2024-01-15T09:30:00.000Z"
                }
              ],
              "currency": "usd",
              "period": {
                "start": "2024-01-15T09:30:00.000Z",
                "end": "2024-01-15T09:30:00.000Z"
              },
              "usage": [
                {
                  "meter": "email.recipients",
                  "quantity": 1000000,
                  "included": 1000000
                },
                {
                  "meter": "email.recipients",
                  "quantity": 1000000,
                  "included": 1000000
                }
              ],
              "estimate": {
                "usage": 1000000,
                "discount": 1000000,
                "credit": 1000000,
                "total": 1000000
              },
              "credit_remaining": 1000000,
              "spend_limit": 1000000,
              "credit_limit": {
                "limit": 1000000,
                "used": 1000000,
                "charge_threshold": 1000000
              },
              "payment_method": {
                "type": "type",
                "brand": "brand",
                "last4": "last4"
              },
              "add_ons": [
                {
                  "key": "key",
                  "name": "name",
                  "quantity": 1000000,
                  "unit_amount": 1000000,
                  "interval": "month"
                },
                {
                  "key": "key",
                  "name": "name",
                  "quantity": 1000000,
                  "unit_amount": 1000000,
                  "interval": "month"
                }
              ],
              "features": {
                "tracking_domains": true,
                "audit_log": true,
                "log_drains": true,
                "sso": true,
                "scim": true,
                "dedicated_ips": true
              },
              "limits": {
                "domains": 1000000,
                "members": 1000000,
                "webhook_endpoints_per_environment": 1000000,
                "contacts_per_environment": 1000000,
                "inboxes": 1000000
              }
            }
            """;

        Server
            .Given(WireMock.RequestBuilders.Request.Create().WithPath("/v1/billing").UsingGet())
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Billing.GetAsync();
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string mockResponse = """
            {
              "object": "billing",
              "organization_id": "org_01k7c8m4q2f3e9v6t5r1n0p8yz",
              "plan": "pro",
              "contract": {
                "id": "bcon_01k7c8m4q2f3e9v6t5r1n0p8yz",
                "kind": "self_serve",
                "effective_from": "2026-10-01T00:00:00.000Z",
                "effective_until": null,
                "term_end": null,
                "auto_renew": false
              },
              "scheduled_change": null,
              "status": "active",
              "holds": [
                {
                  "reason": "delinquent",
                  "since": "2024-01-15T09:30:00.000Z"
                }
              ],
              "currency": "usd",
              "period": {
                "start": "2026-10-01T00:00:00.000Z",
                "end": "2026-11-01T00:00:00.000Z"
              },
              "usage": [
                {
                  "meter": "email.recipients",
                  "quantity": 120000,
                  "included": null
                }
              ],
              "estimate": {
                "usage": 4800,
                "discount": 0,
                "credit": 2500,
                "total": 2300
              },
              "credit_remaining": 0,
              "spend_limit": null,
              "credit_limit": {
                "limit": 50000,
                "used": 2300,
                "charge_threshold": 10000
              },
              "payment_method": {
                "type": "card",
                "brand": "visa",
                "last4": "4242"
              },
              "add_ons": [
                {
                  "key": "key",
                  "name": "name",
                  "quantity": 1000000,
                  "unit_amount": 1000000,
                  "interval": "month"
                }
              ],
              "features": {
                "tracking_domains": true,
                "audit_log": true,
                "log_drains": false,
                "sso": false,
                "scim": false,
                "dedicated_ips": false
              },
              "limits": {
                "domains": 10,
                "members": 10,
                "webhook_endpoints_per_environment": 10,
                "contacts_per_environment": 50000,
                "inboxes": 1000
              }
            }
            """;

        Server
            .Given(WireMock.RequestBuilders.Request.Create().WithPath("/v1/billing").UsingGet())
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Billing.GetAsync();
        JsonAssert.AreEqual(response, mockResponse);
    }
}
