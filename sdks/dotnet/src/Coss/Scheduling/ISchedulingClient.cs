namespace Coss.Scheduling;

public partial interface ISchedulingClient
{
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
