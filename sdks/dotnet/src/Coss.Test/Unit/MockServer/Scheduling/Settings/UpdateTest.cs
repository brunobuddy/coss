using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Settings;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class UpdateTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "brand_name": null,
              "accent_color": null,
              "logo": null,
              "email_from": null,
              "sms_from": null,
              "notifications": null,
              "email_reply_to": null,
              "reminders": null
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.settings",
              "allowed_origins": [
                "allowed_origins",
                "allowed_origins"
              ],
              "brand_name": "brand_name",
              "accent_color": "accent_color",
              "logo": {
                "content_type": "image/png",
                "width": 1000000,
                "height": 1000000,
                "data_url": "data_url"
              },
              "email_from": "email_from",
              "sms_from": "sms_from",
              "calendar_failure_mode": "hide",
              "notifications": {
                "notifications": {
                  "email_attendee": true,
                  "email_host": true,
                  "sms_attendee": true
                }
              },
              "email_reply_to": "email_reply_to",
              "reminders": [
                {
                  "key": "key",
                  "anchor": "start",
                  "before_minutes": 1.1,
                  "after_minutes": 1.1,
                  "send": [
                    "email_attendee",
                    "email_attendee"
                  ],
                  "email_to": [
                    "email_to",
                    "email_to"
                  ],
                  "subject": "subject",
                  "message": "message",
                  "sms_message": "sms_message",
                  "button": {
                    "label": "label",
                    "url": "url"
                  },
                  "include_invite": true,
                  "send_if_late": true,
                  "skip_no_show": true,
                  "only_if": {
                    "metadata": {
                      "metadata": "metadata"
                    },
                    "location_types": [
                      "location_types",
                      "location_types"
                    ]
                  }
                },
                {
                  "key": "key",
                  "anchor": "start",
                  "before_minutes": 1.1,
                  "after_minutes": 1.1,
                  "send": [
                    "email_attendee",
                    "email_attendee"
                  ],
                  "email_to": [
                    "email_to",
                    "email_to"
                  ],
                  "subject": "subject",
                  "message": "message",
                  "sms_message": "sms_message",
                  "button": {
                    "label": "label",
                    "url": "url"
                  },
                  "include_invite": true,
                  "send_if_late": true,
                  "skip_no_show": true,
                  "only_if": {
                    "metadata": {
                      "metadata": "metadata"
                    },
                    "location_types": [
                      "location_types",
                      "location_types"
                    ]
                  }
                }
              ]
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/settings")
                    .WithHeader("Content-Type", "application/json")
                    .UsingPatch()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Settings.UpdateAsync(
            new UpdateSchedulingSettingsRequest
            {
                AllowedOrigins = null,
                BrandName = null,
                AccentColor = null,
                Logo = null,
                EmailFrom = null,
                SmsFrom = null,
                CalendarFailureMode = null,
                Notifications = null,
                EmailReplyTo = null,
                Reminders = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "brand_name": "Acme Health"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.settings",
              "allowed_origins": [
                "https://app.example.com"
              ],
              "brand_name": "Acme Health",
              "accent_color": null,
              "logo": null,
              "email_from": "appointments@example.com",
              "sms_from": null,
              "calendar_failure_mode": "hide",
              "notifications": {
                "reminder": {
                  "email_attendee": true,
                  "email_host": true,
                  "sms_attendee": true
                }
              },
              "email_reply_to": null,
              "reminders": null
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/settings")
                    .WithHeader("Content-Type", "application/json")
                    .UsingPatch()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Settings.UpdateAsync(
            new UpdateSchedulingSettingsRequest { BrandName = "Acme Health" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
