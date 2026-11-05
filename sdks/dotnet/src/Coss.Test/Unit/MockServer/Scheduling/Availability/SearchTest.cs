using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;
using OneOf;

namespace Coss.Test.Unit.MockServer.Scheduling.Availability;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class SearchTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "event_type": "event_type",
              "start": "start",
              "end": "end"
            }
            """;

        const string mockResponse = """
            {
              "object": "list",
              "data": [
                {
                  "host": "host",
                  "uid": "uid",
                  "slots": [
                    {
                      "start": "start",
                      "end": "end"
                    },
                    {
                      "start": "start",
                      "end": "end"
                    }
                  ]
                },
                {
                  "host": "host",
                  "uid": "uid",
                  "slots": [
                    {
                      "start": "start",
                      "end": "end"
                    },
                    {
                      "start": "start",
                      "end": "end"
                    }
                  ]
                }
              ],
              "has_more": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/availability/search")
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

        var response = await Client.Scheduling.Availability.SearchAsync(
            new AvailabilitySearchRequest
            {
                EventType = "event_type",
                Start = "start",
                End = "end",
                Attributes = null,
                Hosts = null,
                SlotsPerHost = null,
                Limit = null,
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
              "start": "2027-01-04T00:00:00.000Z",
              "end": "2027-01-18T00:00:00.000Z",
              "attributes": {
                "licensed_in": "CA"
              }
            }
            """;

        const string mockResponse = """
            {
              "object": "list",
              "data": [
                {
                  "host": "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                  "uid": "doctor_482",
                  "slots": [
                    {
                      "start": "2027-01-04T15:00:00.000Z",
                      "end": "2027-01-04T15:30:00.000Z"
                    }
                  ]
                }
              ],
              "has_more": false
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/availability/search")
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

        var response = await Client.Scheduling.Availability.SearchAsync(
            new AvailabilitySearchRequest
            {
                EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Start = "2027-01-04T00:00:00.000Z",
                End = "2027-01-18T00:00:00.000Z",
                Attributes = new Dictionary<string, OneOf<string, IEnumerable<string>>>()
                {
                    { "licensed_in", "CA" },
                },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
