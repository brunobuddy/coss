using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Slots;

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
                  "start": "start",
                  "end": "end",
                  "hosts": [
                    "hosts",
                    "hosts"
                  ],
                  "seats_left": 1.1
                },
                {
                  "start": "start",
                  "end": "end",
                  "hosts": [
                    "hosts",
                    "hosts"
                  ],
                  "seats_left": 1.1
                }
              ],
              "has_more": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/event_types/event_type/slots")
                    .WithParam("start", "start")
                    .WithParam("end", "end")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Slots.ListAsync(
            new ListSlotsRequest
            {
                EventType = "event_type",
                Start = "start",
                End = "end",
            }
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
                  "start": "2027-01-04T15:00:00.000Z",
                  "end": "2027-01-04T15:30:00.000Z",
                  "hosts": [
                    "host_01kd2m9a0b1c2d3e4f5g6h7j8m"
                  ],
                  "seats_left": null
                }
              ],
              "has_more": false
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/event_types/evtype_01kd2m9a0b1c2d3e4f5g6h7j8m/slots")
                    .WithParam("start", "2027-01-04T15:00:00.000Z")
                    .WithParam("end", "2027-01-04T15:00:00.000Z")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Slots.ListAsync(
            new ListSlotsRequest
            {
                EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Start = "2027-01-04T15:00:00.000Z",
                End = "2027-01-04T15:00:00.000Z",
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
