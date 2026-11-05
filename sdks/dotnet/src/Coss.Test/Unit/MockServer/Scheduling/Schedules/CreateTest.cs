using Coss;
using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Schedules;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class CreateTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "rules": [
                {
                  "days": [
                    1,
                    1
                  ],
                  "start": "start",
                  "end": "end"
                },
                {
                  "days": [
                    1,
                    1
                  ],
                  "start": "start",
                  "end": "end"
                }
              ]
            }
            """;

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
                    .WithPath("/v1/scheduling/hosts/host/schedules")
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

        var response = await Client.Scheduling.Schedules.CreateAsync(
            new CreateSchedulesRequest
            {
                Host = "host",
                Body = new UpsertScheduleRequest
                {
                    Name = null,
                    TimeZone = null,
                    IsDefault = null,
                    Rules = new List<SchedulingWeeklyRule>()
                    {
                        new SchedulingWeeklyRule
                        {
                            Days = new List<int>() { 1, 1 },
                            Start = "start",
                            End = "end",
                        },
                        new SchedulingWeeklyRule
                        {
                            Days = new List<int>() { 1, 1 },
                            Start = "start",
                            End = "end",
                        },
                    },
                    Overrides = null,
                },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "name": "Clinic hours",
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
              ]
            }
            """;

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
                    .WithPath("/v1/scheduling/hosts/host_01kd2m9a0b1c2d3e4f5g6h7j8m/schedules")
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

        var response = await Client.Scheduling.Schedules.CreateAsync(
            new CreateSchedulesRequest
            {
                Host = "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Body = new UpsertScheduleRequest
                {
                    Name = "Clinic hours",
                    Rules = new List<SchedulingWeeklyRule>()
                    {
                        new SchedulingWeeklyRule
                        {
                            Days = new List<int>() { 1, 2, 3, 4, 5 },
                            Start = "09:00",
                            End = "17:00",
                        },
                    },
                    Overrides = new List<SchedulingScheduleOverride>()
                    {
                        new SchedulingScheduleOverride
                        {
                            Date = "2027-12-24",
                            Ranges = new List<SchedulingScheduleOverrideRangesItem>()
                            {
                                new SchedulingScheduleOverrideRangesItem
                                {
                                    Start = "start",
                                    End = "end",
                                },
                            },
                        },
                    },
                },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
