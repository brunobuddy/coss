using Coss.Core;

namespace Coss.Scheduling;

public partial class SchedulingClient : ISchedulingClient
{
    private readonly RawClient _client;

    internal SchedulingClient(RawClient client)
    {
        _client = client;
        Hosts = new HostsClient(_client);
        Schedules = new SchedulesClient(_client);
        EventTypes = new EventTypesClient(_client);
        Slots = new SlotsClient(_client);
        Availability = new AvailabilityClient(_client);
        Bookings = new BookingsClient(_client);
        Holds = new HoldsClient(_client);
        Series = new SeriesClient(_client);
        Attendees = new AttendeesClient(_client);
        Calendars = new CalendarsClient(_client);
        CalendarDelegations = new CalendarDelegationsClient(_client);
        Sessions = new SessionsClient(_client);
        Settings = new SettingsClient(_client);
    }

    public IHostsClient Hosts { get; }

    public ISchedulesClient Schedules { get; }

    public IEventTypesClient EventTypes { get; }

    public ISlotsClient Slots { get; }

    public IAvailabilityClient Availability { get; }

    public IBookingsClient Bookings { get; }

    public IHoldsClient Holds { get; }

    public ISeriesClient Series { get; }

    public IAttendeesClient Attendees { get; }

    public ICalendarsClient Calendars { get; }

    public ICalendarDelegationsClient CalendarDelegations { get; }

    public ISessionsClient Sessions { get; }

    public ISettingsClient Settings { get; }
}
