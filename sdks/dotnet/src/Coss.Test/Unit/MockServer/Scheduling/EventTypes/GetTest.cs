using Coss.Test.Unit.MockServer;
using Coss.Test.Utils;
using NUnit.Framework;

namespace Coss.Test.Unit.MockServer.Scheduling.EventTypes;

[TestFixture]
[Parallelizable(ParallelScope.Self)]
public class GetTest : BaseMockServerTest
{
    [NUnit.Framework.Test]
    public async Task MockServerTest_1()
    {
        const string mockResponse = """
            {
              "object": "scheduling.event_type",
              "id": "id",
              "uid": "uid",
              "description": "description",
              "title": "title",
              "kind": "one_on_one",
              "status": "active",
              "duration_minutes": 1.1,
              "duration_options": [
                1.1,
                1.1
              ],
              "step_minutes": 1.1,
              "grid_time_zone": "grid_time_zone",
              "buffer_before_minutes": 1.1,
              "buffer_after_minutes": 1.1,
              "min_notice_minutes": 1.1,
              "booking_window": {
                "kind": "rolling",
                "days": 730
              },
              "limits": [
                {
                  "period": "day",
                  "max": 1000,
                  "scope": "event_type"
                },
                {
                  "period": "day",
                  "max": 1000,
                  "scope": "event_type"
                }
              ],
              "capacity": 1.1,
              "requires_approval": true,
              "approval_ttl_minutes": 1.1,
              "hold_ttl_seconds": 1.1,
              "cancel_notice_minutes": 1.1,
              "reschedule_notice_minutes": 1.1,
              "max_guests": 1.1,
              "max_active_bookings_per_attendee": 1.1,
              "host_calendar_details": "neutral",
              "questions": [
                {
                  "key": "key",
                  "type": "text",
                  "label": "x",
                  "required": true,
                  "options": [
                    "options",
                    "options"
                  ]
                },
                {
                  "key": "key",
                  "type": "text",
                  "label": "x",
                  "required": true,
                  "options": [
                    "options",
                    "options"
                  ]
                }
              ],
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
              "host_filter": {
                "host_filter": "host_filter"
              },
              "notifications": {
                "notifications": {
                  "email_attendee": true,
                  "email_host": true,
                  "sms_attendee": true
                }
              },
              "reminders": [
                {
                  "key": "key",
                  "anchor": "start",
                  "before_minutes": 1.1,
                  "after_minutes": 1.1,
                  "send": [
                    "email_attendee",
                    "email_attendee"
                  ],
                  "email_to": [
                    "email_to",
                    "email_to"
                  ],
                  "subject": "subject",
                  "message": "message",
                  "sms_message": "sms_message",
                  "button": {
                    "label": "label",
                    "url": "url"
                  },
                  "include_invite": true,
                  "send_if_late": true,
                  "skip_no_show": true,
                  "only_if": {
                    "metadata": {
                      "metadata": "metadata"
                    },
                    "location_types": [
                      "location_types",
                      "location_types"
                    ]
                  }
                },
                {
                  "key": "key",
                  "anchor": "start",
                  "before_minutes": 1.1,
                  "after_minutes": 1.1,
                  "send": [
                    "email_attendee",
                    "email_attendee"
                  ],
                  "email_to": [
                    "email_to",
                    "email_to"
                  ],
                  "subject": "subject",
                  "message": "message",
                  "sms_message": "sms_message",
                  "button": {
                    "label": "label",
                    "url": "url"
                  },
                  "include_invite": true,
                  "send_if_late": true,
                  "skip_no_show": true,
                  "only_if": {
                    "metadata": {
                      "metadata": "metadata"
                    },
                    "location_types": [
                      "location_types",
                      "location_types"
                    ]
                  }
                }
              ],
              "hosts": [
                {
                  "host": "host",
                  "role": "required",
                  "weight": 1.1,
                  "schedule": "schedule"
                },
                {
                  "host": "host",
                  "role": "required",
                  "weight": 1.1,
                  "schedule": "schedule"
                }
              ],
              "metadata": {
                "metadata": "metadata"
              },
              "created_at": "created_at",
              "updated_at": "updated_at"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/event_types/event_type")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.EventTypes.GetAsync(
            new Coss.Scheduling.GetEventTypesRequest { EventType = "event_type" }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }

    [NUnit.Framework.Test]
    public async Task MockServerTest_2()
    {
        const string mockResponse = """
            {
              "object": "scheduling.event_type",
              "id": "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
              "uid": null,
              "description": null,
              "title": "Initial consultation",
              "kind": "one_on_one",
              "status": "active",
              "duration_minutes": 30,
              "duration_options": [
                1.1
              ],
              "step_minutes": 30,
              "grid_time_zone": null,
              "buffer_before_minutes": 0,
              "buffer_after_minutes": 10,
              "min_notice_minutes": 120,
              "booking_window": null,
              "limits": [
                {
                  "period": "day",
                  "max": 1,
                  "scope": "event_type"
                }
              ],
              "capacity": null,
              "requires_approval": false,
              "approval_ttl_minutes": 1440,
              "hold_ttl_seconds": 600,
              "cancel_notice_minutes": 0,
              "reschedule_notice_minutes": 0,
              "max_guests": 0,
              "max_active_bookings_per_attendee": null,
              "host_calendar_details": "neutral",
              "questions": [
                {
                  "key": "key",
                  "type": "text",
                  "label": "label",
                  "required": true,
                  "options": [
                    "options"
                  ]
                }
              ],
              "locations": [
                {
                  "type": "link",
                  "url": "url"
                }
              ],
              "host_filter": null,
              "notifications": null,
              "reminders": null,
              "hosts": [
                {
                  "host": "host_01kd2m9a0b1c2d3e4f5g6h7j8m",
                  "role": "member",
                  "weight": 100,
                  "schedule": null
                }
              ],
              "metadata": {
                "key": "value"
              },
              "created_at": "2027-01-01T10:00:00.000Z",
              "updated_at": "2027-01-01T10:00:00.000Z"
            }
            """;

        Server
            .Given(
                WireMock
                    .RequestBuilders.Request.Create()
                    .WithPath("/v1/scheduling/event_types/evtype_01kd2m9a0b1c2d3e4f5g6h7j8m")
                    .UsingGet()
            )
            .RespondWith(
                WireMock
                    .ResponseBuilders.Response.Create()
                    .WithStatusCode(200)
                    .WithBody(mockResponse)
            );

        var response = await Client.Scheduling.EventTypes.GetAsync(
            new Coss.Scheduling.GetEventTypesRequest
            {
                EventType = "evtype_01kd2m9a0b1c2d3e4f5g6h7j8m",
            }
        );
        JsonAssert.AreEqual(response, mockResponse);
    }
}
