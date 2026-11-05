using Coss;
using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Holds;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class CreateTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "event_type": "event_type",
              "start": "start",
              "attendee": {
                "time_zone": "x"
              }
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.booking",
              "id": "id",
              "event_type": "event_type",
              "status": "held",
              "title": "title",
              "start": "start",
              "end": "end",
              "hosts": [
                "hosts",
                "hosts"
              ],
              "attendees": [
                {
                  "id": "id",
                  "role": "attendee",
                  "uid": "uid",
                  "name": "name",
                  "email": "email",
                  "phone": "phone",
                  "time_zone": "time_zone",
                  "locale": "locale",
                  "answers": {
                    "answers": "answers"
                  }
                },
                {
                  "id": "id",
                  "role": "attendee",
                  "uid": "uid",
                  "name": "name",
                  "email": "email",
                  "phone": "phone",
                  "time_zone": "time_zone",
                  "locale": "locale",
                  "answers": {
                    "answers": "answers"
                  }
                }
              ],
              "location": {
                "type": "link",
                "url": "url"
              },
              "hold_expires_at": "hold_expires_at",
              "approval_expires_at": "approval_expires_at",
              "series": "series",
              "series_index": 1.1,
              "group_session": "group_session",
              "calendar_unverified": true,
              "external_conflict_at": "external_conflict_at",
              "no_show_at": "no_show_at",
              "cancelled_at": "cancelled_at",
              "cancelled_by": "api_key",
              "cancellation_reason": "cancellation_reason",
              "metadata": {
                "metadata": "metadata"
              },
              "created_at": "created_at",
              "updated_at": "updated_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/holds")
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

        var response = await Client.Scheduling.Holds.CreateAsync(
            new CreateHoldRequest
            {
                EventType = "event_type",
                Start = "start",
                Host = null,
                Attributes = null,
                DurationMinutes = null,
                Attendee = new SchedulingAttendeeInput
                {
                    Uid = null,
                    Name = null,
                    Email = null,
                    Phone = null,
                    TimeZone = "x",
                    Locale = null,
                },
                Guests = null,
                Answers = null,
                Location = null,
                Metadata = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "event_type": "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "start": "2027-01-04T15:00:00.000Z",
              "attendee": {
                "uid": "patient_77",
                "time_zone": "UTC"
              }
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.booking",
              "id": "book_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "event_type": "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "status": "confirmed",
              "title": "Initial consultation",
              "start": "2027-01-04T15:00:00.000Z",
              "end": "2027-01-04T15:30:00.000Z",
              "hosts": [
                "host_01kd2m9a0b1c2d3e4f5g6h7j8m"
              ],
              "attendees": [
                {
                  "id": "attn_01kd2m9a0b1c2d3e4f5g6h7j8m",
                  "role": "attendee",
                  "uid": "patient_77",
                  "name": "Sam Lee",
                  "email": "sam@example.com",
                  "phone": null,
                  "time_zone": "UTC",
                  "locale": null,
                  "answers": {
                    "key": "value"
                  }
                }
              ],
              "location": {
                "type": "link",
                "url": "url"
              },
              "hold_expires_at": null,
              "approval_expires_at": null,
              "series": null,
              "series_index": null,
              "group_session": null,
              "calendar_unverified": false,
              "external_conflict_at": null,
              "no_show_at": null,
              "cancelled_at": null,
              "cancelled_by": null,
              "cancellation_reason": "cancellation_reason",
              "metadata": {
                "key": "value"
              },
              "created_at": "2027-01-01T10:00:00.000Z",
              "updated_at": "2027-01-01T10:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/holds")
                    .WithHeader("Idempotency-Key", "welcome-user-123")
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

        var response = await Client.Scheduling.Holds.CreateAsync(
            new CreateHoldRequest
            {
                IdempotencyKey = "welcome-user-123",
                EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Start = "2027-01-04T15:00:00.000Z",
                Attendee = new SchedulingAttendeeInput { Uid = "patient_77", TimeZone = "UTC" },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
