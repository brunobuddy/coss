<?php

namespace Coss\Scheduling;

use Coss\Scheduling\Hosts\HostsClient;
use Coss\Scheduling\Schedules\SchedulesClient;
use Coss\Scheduling\EventTypes\EventTypesClient;
use Coss\Scheduling\Slots\SlotsClient;
use Coss\Scheduling\Availability\AvailabilityClient;
use Coss\Scheduling\Bookings\BookingsClient;
use Coss\Scheduling\Holds\HoldsClient;
use Coss\Scheduling\Series\SeriesClient;
use Coss\Scheduling\Attendees\AttendeesClient;
use Coss\Scheduling\Calendars\CalendarsClient;
use Coss\Scheduling\CalendarDelegations\CalendarDelegationsClient;
use Coss\Scheduling\Sessions\SessionsClient;
use Coss\Scheduling\Settings\SettingsClient;
use Psr\Http\Client\ClientInterface;
use Coss\Core\Client\RawClient;

class SchedulingClient
{
    /**
     * @var HostsClient $hosts
     */
    public HostsClient $hosts;

    /**
     * @var SchedulesClient $schedules
     */
    public SchedulesClient $schedules;

    /**
     * @var EventTypesClient $eventTypes
     */
    public EventTypesClient $eventTypes;

    /**
     * @var SlotsClient $slots
     */
    public SlotsClient $slots;

    /**
     * @var AvailabilityClient $availability
     */
    public AvailabilityClient $availability;

    /**
     * @var BookingsClient $bookings
     */
    public BookingsClient $bookings;

    /**
     * @var HoldsClient $holds
     */
    public HoldsClient $holds;

    /**
     * @var SeriesClient $series
     */
    public SeriesClient $series;

    /**
     * @var AttendeesClient $attendees
     */
    public AttendeesClient $attendees;

    /**
     * @var CalendarsClient $calendars
     */
    public CalendarsClient $calendars;

    /**
     * @var CalendarDelegationsClient $calendarDelegations
     */
    public CalendarDelegationsClient $calendarDelegations;

    /**
     * @var SessionsClient $sessions
     */
    public SessionsClient $sessions;

    /**
     * @var SettingsClient $settings
     */
    public SettingsClient $settings;

    /**
     * @var array{
     *   baseUrl?: string,
     *   client?: ClientInterface,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     * } $options @phpstan-ignore-next-line Property is used in endpoint methods via HttpEndpointGenerator
     */
    private array $options;

    /**
     * @var RawClient $client
     */
    private RawClient $client;

    /**
     * @param RawClient $client
     * @param ?array{
     *   baseUrl?: string,
     *   client?: ClientInterface,
     *   maxRetries?: int,
     *   timeout?: float,
     *   headers?: array<string, string>,
     * } $options
     */
    public function __construct(
        RawClient $client,
        ?array $options = null,
    ) {
        $this->client = $client;
        $this->options = $options ?? [];
        $this->hosts = new HostsClient($this->client, $this->options);
        $this->schedules = new SchedulesClient($this->client, $this->options);
        $this->eventTypes = new EventTypesClient($this->client, $this->options);
        $this->slots = new SlotsClient($this->client, $this->options);
        $this->availability = new AvailabilityClient($this->client, $this->options);
        $this->bookings = new BookingsClient($this->client, $this->options);
        $this->holds = new HoldsClient($this->client, $this->options);
        $this->series = new SeriesClient($this->client, $this->options);
        $this->attendees = new AttendeesClient($this->client, $this->options);
        $this->calendars = new CalendarsClient($this->client, $this->options);
        $this->calendarDelegations = new CalendarDelegationsClient($this->client, $this->options);
        $this->sessions = new SessionsClient($this->client, $this->options);
        $this->settings = new SettingsClient($this->client, $this->options);
    }
}
