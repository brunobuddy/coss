using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Slots;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class ExplainTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "scheduling.slot_explanation",
              "start": "start",
              "end": "end",
              "available": true,
              "reason": "reason",
              "hosts": [
                {
                  "host": "host",
                  "role": "required",
                  "available": true,
                  "reason": "reason",
                  "calendar_reason": "calendar_reason"
                },
                {
                  "host": "host",
                  "role": "required",
                  "available": true,
                  "reason": "reason",
                  "calendar_reason": "calendar_reason"
                }
              ]
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/event_types/event_type/slots/explain")
                    .WithParam("start", "start")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Slots.ExplainAsync(
            new ExplainSlotsRequest { EventType = "event_type", Start = "start" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string mockResponse = """
            {
              "object": "scheduling.slot_explanation",
              "start": "2027-01-04T15:00:00.000Z",
              "end": "2027-01-04T15:30:00.000Z",
              "available": false,
              "reason": "host_busy",
              "hosts": [
                {
                  "host": "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                  "role": "member",
                  "available": false,
                  "reason": "host_busy",
                  "calendar_reason": null
                }
              ]
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath(
                        "/v1/scheduling/event_types/evtype_01kd2m9a0b1c2d3e4f5g6h7j8m/slots/explain"
                    )
                    .WithParam("start", "2027-01-04T15:00:00.000Z")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Slots.ExplainAsync(
            new ExplainSlotsRequest
            {
                EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Start = "2027-01-04T15:00:00.000Z",
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
