using Coss;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.WebhookEvents;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class TestTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "type": "email.sent"
            }
            """;

        const string mockResponse = """
            {
              "object": "webhook_test_event",
              "event": {
                "id": "id",
                "object": "event",
                "type": "email.sent",
                "api_version": "api_version",
                "created_at": "2024-01-15T09:30:00.000Z",
                "data": {
                  "bounce": {
                    "type": "permanent",
                    "sub_type": "sub_type",
                    "diagnostic_code": "diagnostic_code"
                  },
                  "complaint": {
                    "feedback_type": "feedback_type",
                    "sub_type": "sub_type"
                  },
                  "delay": {
                    "type": "type",
                    "expires_at": "2024-01-15T09:30:00.000Z",
                    "diagnostic_code": "diagnostic_code"
                  },
                  "delivery": {
                    "smtp_response": "smtp_response"
                  },
                  "failure": {
                    "code": "code",
                    "message": "message"
                  },
                  "suppression": {
                    "id": "id",
                    "scope": "scope",
                    "reason": "bounce"
                  },
                  "unsubscribe": {
                    "contact_id": "contact_id",
                    "topic": "topic"
                  },
                  "open": {
                    "user_agent": "user_agent"
                  },
                  "click": {
                    "url": "url",
                    "link_position": 1000000,
                    "user_agent": "user_agent"
                  },
                  "reschedule": {
                    "scheduled_at": "2024-01-15T09:30:00.000Z",
                    "previous_scheduled_at": "2024-01-15T09:30:00.000Z"
                  },
                  "email_id": "email_id",
                  "from": "from",
                  "to": [
                    "to",
                    "to"
                  ],
                  "subject": "subject",
                  "tags": [
                    {
                      "name": "name",
                      "value": "value"
                    },
                    {
                      "name": "name",
                      "value": "value"
                    }
                  ],
                  "category": "category",
                  "sandbox": true,
                  "recipient": "recipient",
                  "occurred_at": "2024-01-15T09:30:00.000Z",
                  "subaccount_id": "subaccount_id",
                  "traceparent": "traceparent"
                }
              },
              "endpoints": 1000000,
              "listeners": 1000000
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/webhook_events/test")
                    .WithHeader("Content-Type", "application/json")
                    .UsingPost()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.WebhookEvents.TestAsync(
            new CreateTestWebhookEventRequest
            {
                Type = CreateTestWebhookEventRequestType.EmailSent,
                Data = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "type": "email.bounced",
              "data": {
                "recipient": "ada@example.com"
              }
            }
            """;

        const string mockResponse = """
            {
              "object": "webhook_test_event",
              "event": {
                "id": "evt_01k7c8m4r0c2b8w9y3d5f6g7h8",
                "object": "event",
                "type": "email.bounced",
                "api_version": "2026-10-10",
                "created_at": "2026-10-10T12:00:03.000Z",
                "data": {
                  "bounce": {
                    "type": "permanent",
                    "sub_type": "General",
                    "diagnostic_code": "smtp; 550 5.1.1 The email account that you tried to reach does not exist"
                  },
                  "complaint": {
                    "feedback_type": null,
                    "sub_type": null
                  },
                  "delay": {
                    "type": "type",
                    "expires_at": null,
                    "diagnostic_code": null
                  },
                  "delivery": {
                    "smtp_response": null
                  },
                  "failure": {
                    "code": "code",
                    "message": "message"
                  },
                  "suppression": {
                    "id": "id",
                    "scope": "scope",
                    "reason": "bounce"
                  },
                  "unsubscribe": {
                    "contact_id": null,
                    "topic": null
                  },
                  "open": {
                    "user_agent": null
                  },
                  "click": {
                    "url": "url",
                    "link_position": 1000000,
                    "user_agent": null
                  },
                  "reschedule": {
                    "scheduled_at": "2024-01-15T09:30:00.000Z",
                    "previous_scheduled_at": "2024-01-15T09:30:00.000Z"
                  },
                  "email_id": "email_01k7c8m4q2f3e9v6t5r1n0p8yz",
                  "from": "Acme <onboarding@acme.com>",
                  "to": [
                    "ada@example.com"
                  ],
                  "subject": "Welcome to Acme",
                  "tags": [
                    {
                      "name": "template",
                      "value": "welcome"
                    }
                  ],
                  "category": "onboarding",
                  "sandbox": true,
                  "recipient": "ada@example.com",
                  "occurred_at": "2026-10-10T12:00:03.000Z",
                  "subaccount_id": "subaccount_id",
                  "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
                }
              },
              "endpoints": 1,
              "listeners": 1
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/webhook_events/test")
                    .WithHeader("Content-Type", "application/json")
                    .UsingPost()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.WebhookEvents.TestAsync(
            new CreateTestWebhookEventRequest
            {
                Type = CreateTestWebhookEventRequestType.EmailBounced,
                Data = new Dictionary<string, object?>() { { "recipient", "ada@example.com" } },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
