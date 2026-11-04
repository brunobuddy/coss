using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Sessions;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class CreateForBookerTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "event_type": "event_type"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.session",
              "id": "id",
              "token": "token",
              "url": "url",
              "expires_at": "expires_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/booker_sessions")
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

        var response = await Client.Scheduling.Sessions.CreateForBookerAsync(
            new CreateSchedulingBookerSessionRequest
            {
                EventType = "event_type",
                Host = null,
                Attributes = null,
                Attendee = null,
                ExpiresIn = null,
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
              "attendee": {
                "uid": "patient_77",
                "name": "Sam Lee",
                "time_zone": "UTC"
              }
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.session",
              "id": "schs_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "token": "cossch_abc123",
              "url": "https://example.test/h/schs_01kd2m9a0b1c2d3e4f5g6h7j8m#cossch_abc123",
              "expires_at": "2027-01-01T11:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/booker_sessions")
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

        var response = await Client.Scheduling.Sessions.CreateForBookerAsync(
            new CreateSchedulingBookerSessionRequest
            {
                EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Attendee = new CreateSchedulingBookerSessionRequestAttendee
                {
                    Uid = "patient_77",
                    Name = "Sam Lee",
                    TimeZone = "UTC",
                },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
