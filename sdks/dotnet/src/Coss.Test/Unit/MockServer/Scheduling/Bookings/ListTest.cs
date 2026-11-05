using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Bookings;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class ListTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "list",
              "data": [
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
                },
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
              ],
              "has_more": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/bookings")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Bookings.ListAsync(new ListBookingsRequest());
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string mockResponse = """
            {
              "object": "list",
              "data": [
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
                      "locale": null
                    }
                  ],
                  "location": {
                    "type": "link"
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
              ],
              "has_more": false
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/bookings")
                    .WithParam("start_after", "2027-01-04T15:00:00.000Z")
                    .WithParam("start_before", "2027-01-04T15:00:00.000Z")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Bookings.ListAsync(
            new ListBookingsRequest
            {
                StartAfter = "2027-01-04T15:00:00.000Z",
                StartBefore = "2027-01-04T15:00:00.000Z",
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
