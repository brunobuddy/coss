using Coss;
using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Calendars;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class ConnectTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "provider": "caldav",
              "url": "url",
              "username": "x",
              "password": "x"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.calendar_connection",
              "id": "id",
              "host": "host",
              "provider": "google",
              "account": "account",
              "status": "active",
              "delegation": "delegation",
              "calendars": [
                {
                  "id": "id",
                  "external_id": "external_id",
                  "read_busy": true,
                  "write_target": true,
                  "verified_at": "verified_at"
                },
                {
                  "id": "id",
                  "external_id": "external_id",
                  "read_busy": true,
                  "write_target": true,
                  "verified_at": "verified_at"
                }
              ],
              "created_at": "created_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host/calendar_connections")
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

        var response = await Client.Scheduling.Calendars.ConnectAsync(
            new ConnectCalendarsRequest
            {
                Host = "host",
                Body = new CreateCalendarConnectionRequest(
                    new CreateCalendarConnectionRequest.Caldav(
                        new CreateCalendarConnectionRequestCaldav
                        {
                            Url = "url",
                            Username = "x",
                            Password = "x",
                        }
                    )
                ),
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "provider": "caldav",
              "url": "url",
              "username": "username",
              "password": "password"
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.calendar_connection",
              "id": "calconn_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "host": "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "provider": "google",
              "account": "ana@example.com",
              "status": "active",
              "delegation": null,
              "calendars": [
                {
                  "id": "cal_01kd2m9a0b1c2d3e4f5g6h7j8m",
                  "external_id": "ana@example.com",
                  "read_busy": true,
                  "write_target": true,
                  "verified_at": "2027-01-01T10:00:00.000Z"
                }
              ],
              "created_at": "2027-01-01T10:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath(
                        "/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m/calendar_connections"
                    )
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

        var response = await Client.Scheduling.Calendars.ConnectAsync(
            new ConnectCalendarsRequest
            {
                Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Body = new CreateCalendarConnectionRequest(
                    new CreateCalendarConnectionRequest.Caldav(
                        new CreateCalendarConnectionRequestCaldav
                        {
                            Url = "url",
                            Username = "username",
                            Password = "password",
                        }
                    )
                ),
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
