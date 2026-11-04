using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Bookings;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class NotificationsTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "list",
              "data": [
                {
                  "object": "scheduling.booking_notification",
                  "id": "id",
                  "kind": "kind",
                  "reminder_key": "reminder_key",
                  "channel": "email",
                  "recipient": "attendee",
                  "due_at": "due_at",
                  "finished_at": "finished_at",
                  "outcome": "outcome"
                },
                {
                  "object": "scheduling.booking_notification",
                  "id": "id",
                  "kind": "kind",
                  "reminder_key": "reminder_key",
                  "channel": "email",
                  "recipient": "attendee",
                  "due_at": "due_at",
                  "finished_at": "finished_at",
                  "outcome": "outcome"
                }
              ],
              "has_more": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/bookings/id/notifications")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Bookings.NotificationsAsync(
            new NotificationsBookingsRequest { Id = "id" }
        );
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
                  "object": "scheduling.booking_notification",
                  "id": "sntf_01kd2m9a0b1c2d3e4f5g6h7j8m",
                  "kind": "reminder",
                  "reminder_key": "start-1440",
                  "channel": "email",
                  "recipient": "attendee",
                  "due_at": "2027-01-03T15:00:00.000Z",
                  "finished_at": null,
                  "outcome": null
                }
              ],
              "has_more": false
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath(
                        "/v1/scheduling/bookings/book_01kd2m9a0b1c2d3e4f5g6h7j8m/notifications"
                    )
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Bookings.NotificationsAsync(
            new NotificationsBookingsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
