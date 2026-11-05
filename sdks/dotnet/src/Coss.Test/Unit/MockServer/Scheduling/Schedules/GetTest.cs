using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Schedules;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class GetTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "scheduling.schedule",
              "id": "id",
              "host": "host",
              "name": "name",
              "time_zone": "time_zone",
              "is_default": true,
              "rules": [
                {
                  "days": [
                    1.1,
                    1.1
                  ],
                  "start": "start",
                  "end": "end"
                },
                {
                  "days": [
                    1.1,
                    1.1
                  ],
                  "start": "start",
                  "end": "end"
                }
              ],
              "overrides": [
                {
                  "date": "date",
                  "ranges": [
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
                  "date": "date",
                  "ranges": [
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
              "created_at": "created_at",
              "updated_at": "updated_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts/host/schedules/schedule_id")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Schedules.GetAsync(
            new GetSchedulesRequest { Host = "host", ScheduleId = "schedule_id" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string mockResponse = """
            {
              "object": "scheduling.schedule",
              "id": "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "host": "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "name": "Clinic hours",
              "time_zone": "America/New_York",
              "is_default": true,
              "rules": [
                {
                  "days": [
                    1,
                    2,
                    3,
                    4,
                    5
                  ],
                  "start": "09:00",
                  "end": "17:00"
                }
              ],
              "overrides": [
                {
                  "date": "2027-12-24",
                  "ranges": [
                    {
                      "start": "start",
                      "end": "end"
                    }
                  ]
                }
              ],
              "created_at": "2027-01-01T10:00:00.000Z",
              "updated_at": "2027-01-01T10:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath(
                        "/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m/schedules/sched_01kd2m9a0b1c2d3e4f5g6h7j8m"
                    )
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Schedules.GetAsync(
            new GetSchedulesRequest
            {
                Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                ScheduleId = "sched_01kd2m9a0b1c2d3e4f5g6h7j8m",
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
