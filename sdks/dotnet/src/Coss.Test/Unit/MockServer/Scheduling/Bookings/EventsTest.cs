using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Bookings;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class EventsTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "list",
              "data": [
                {
                  "object": "scheduling.booking_event",
                  "id": "id",
                  "sequence": 1.1,
                  "type": "type",
                  "actor": {
                    "kind": "api_key",
                    "id": "id"
                  },
                  "details": {
                    "details": {
                      "key": "value"
                    }
                  },
                  "occurred_at": "occurred_at"
                },
                {
                  "object": "scheduling.booking_event",
                  "id": "id",
                  "sequence": 1.1,
                  "type": "type",
                  "actor": {
                    "kind": "api_key",
                    "id": "id"
                  },
                  "details": {
                    "details": {
                      "key": "value"
                    }
                  },
                  "occurred_at": "occurred_at"
                }
              ],
              "has_more": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/bookings/id/events")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Bookings.EventsAsync(
            new EventsBookingsRequest { Id = "id" }
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
                  "object": "scheduling.booking_event",
                  "id": "bevt_01kd2m9a0b1c2d3e4f5g6h7j8m",
                  "sequence": 1,
                  "type": "scheduling.booking.confirmed",
                  "actor": {
                    "kind": "api_key",
                    "id": "key_01kd2m9a0b1c2d3e4f5g6h7j8m"
                  },
                  "details": {
                    "key": "value"
                  },
                  "occurred_at": "2027-01-02T09:00:00.000Z"
                }
              ],
              "has_more": false
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/bookings/book_01kd2m9a0b1c2d3e4f5g6h7j8m/events")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Bookings.EventsAsync(
            new EventsBookingsRequest { Id = "book_01kd2m9a0b1c2d3e4f5g6h7j8m" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
