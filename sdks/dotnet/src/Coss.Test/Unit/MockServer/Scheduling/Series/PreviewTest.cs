using Coss;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.Series;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class PreviewTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "event_type": "event_type",
              "start": "start",
              "attendee": {
                "time_zone": "x"
              },
              "recurrence": {
                "frequency": "weekly",
                "count": 52
              }
            }
            """;

        const string mockResponse = """
            {
              "object": "list",
              "data": [
                {
                  "start": "start",
                  "available": true,
                  "reason": "reason",
                  "hosts": [
                    "hosts",
                    "hosts"
                  ]
                },
                {
                  "start": "start",
                  "available": true,
                  "reason": "reason",
                  "hosts": [
                    "hosts",
                    "hosts"
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
                    .WithPath("/v1/scheduling/series/preview")
                    .UsingPost()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Series.PreviewAsync(
            new CreateSeriesRequest
            {
                EventType = "event_type",
                Start = "start",
                Host = null,
                Attributes = null,
                DurationMinutes = null,
                Attendee = new SchedulingAttendeeInput
                {
                    Uid = null,
                    Name = null,
                    Email = null,
                    Phone = null,
                    TimeZone = "x",
                    Locale = null,
                },
                Guests = null,
                Answers = null,
                Location = null,
                Metadata = null,
                Recurrence = new CreateSeriesRequestRecurrence
                {
                    Frequency = CreateSeriesRequestRecurrenceFrequency.Weekly,
                    Interval = null,
                    Count = 52,
                },
                OnConflict = null,
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
              "start": "2027-01-04T15:00:00.000Z",
              "attendee": {
                "uid": "patient_77",
                "time_zone": "America/New_York"
              },
              "recurrence": {
                "frequency": "weekly",
                "interval": 1,
                "count": 12
              }
            }
            """;

        const string mockResponse = """
            {
              "object": "list",
              "data": [
                {
                  "start": "2027-01-04T15:00:00.000Z",
                  "available": true,
                  "reason": null,
                  "hosts": [
                    "host_01kd2m9a0b1c2d3e4f5g6h7j8m"
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
                    .WithPath("/v1/scheduling/series/preview")
                    .UsingPost()
                    .WithBodyAsJson(requestJson)
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.Series.PreviewAsync(
            new CreateSeriesRequest
            {
                EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
                Start = "2027-01-04T15:00:00.000Z",
                Attendee = new SchedulingAttendeeInput
                {
                    Uid = "patient_77",
                    TimeZone = "America/New_York",
                },
                Recurrence = new CreateSeriesRequestRecurrence
                {
                    Frequency = CreateSeriesRequestRecurrenceFrequency.Weekly,
                    Interval = 1,
                    Count = 12,
                },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
