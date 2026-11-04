using Coss;
using Coss.Scheduling;
using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;
using OneOf;

namespace Coss.Test.Unit.MockServer.Scheduling.Hosts;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class CreateTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string requestJson = """
            {
              "name": "x",
              "calendar_account": null,
              "time_zone": "x",
              "locale": null
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.host",
              "id": "id",
              "uid": "uid",
              "name": "name",
              "email": "email",
              "phone": "phone",
              "calendar_account": "calendar_account",
              "time_zone": "time_zone",
              "locale": "locale",
              "attributes": {
                "attributes": "attributes"
              },
              "locations": [
                {
                  "type": "link",
                  "url": "url"
                },
                {
                  "type": "link",
                  "url": "url"
                }
              ],
              "metadata": {
                "metadata": "metadata"
              },
              "status": "active",
              "created_at": "created_at",
              "updated_at": "updated_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts")
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

        var response = await Client.Scheduling.Hosts.CreateAsync(
            new CreateHostRequest
            {
                Uid = null,
                Name = "x",
                Email = null,
                Phone = null,
                CalendarAccount = null,
                TimeZone = "x",
                Locale = null,
                Attributes = null,
                Locations = null,
                Metadata = null,
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string requestJson = """
            {
              "uid": "doctor_482",
              "name": "Dr. Ana Reyes",
              "email": "ana@example.com",
              "time_zone": "America/New_York",
              "attributes": {
                "licensed_in": [
                  "NY",
                  "NJ"
                ]
              },
              "locations": [
                {
                  "type": "in_person",
                  "address": "12 Main St, New York, NY"
                }
              ]
            }
            """;

        const string mockResponse = """
            {
              "object": "scheduling.host",
              "id": "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "uid": "doctor_482",
              "name": "Dr. Ana Reyes",
              "email": "ana@example.com",
              "phone": null,
              "calendar_account": null,
              "time_zone": "America/New_York",
              "locale": null,
              "attributes": {
                "licensed_in": [
                  "NY",
                  "NJ"
                ]
              },
              "locations": [
                {
                  "type": "in_person",
                  "address": "12 Main St, New York, NY"
                }
              ],
              "metadata": {
                "key": "value"
              },
              "status": "active",
              "created_at": "2027-01-01T10:00:00.000Z",
              "updated_at": "2027-01-01T10:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/hosts")
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

        var response = await Client.Scheduling.Hosts.CreateAsync(
            new CreateHostRequest
            {
                Uid = "doctor_482",
                Name = "Dr. Ana Reyes",
                Email = "ana@example.com",
                TimeZone = "America/New_York",
                Attributes = new Dictionary<string, OneOf<string, IEnumerable<string>>>()
                {
                    {
                        "licensed_in",
                        new List<string>() { "NY", "NJ" }
                    },
                },
                Locations = new List<SchedulingHostLocation>()
                {
                    new SchedulingHostLocation(
                        new SchedulingHostLocation.InPerson(
                            new SchedulingHostLocationInPerson
                            {
                                Address = "12 Main St, New York, NY",
                            }
                        )
                    ),
                },
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
