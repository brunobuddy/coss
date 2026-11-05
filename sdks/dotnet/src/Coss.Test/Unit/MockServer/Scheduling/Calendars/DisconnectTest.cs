using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Calendars;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class DisconnectTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "scheduling.calendar_connection",
              "id": "id",
              "deleted": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host/calendar_connections/id")
                    .UsingDelete()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Calendars.DisconnectAsync(
            new DisconnectCalendarsRequest { Host = "host", Id = "id" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string mockResponse = """
            {
              "object": "scheduling.calendar_connection",
              "id": "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "deleted": true
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath(
                        "/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m/calendar_connections/calconn_01kd2m9a0b1c2d3e4f5g6h7j8m"
                    )
                    .UsingDelete()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Calendars.DisconnectAsync(
            new DisconnectCalendarsRequest
            {
                Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Id = "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m",
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
