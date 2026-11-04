<?php

namespace Coss\Types;

enum SchedulingReminderInputOnlyIfLocationTypesItem: string
{
    case Link = "link";
    case Phone = "phone";
    case InPerson = "in_person";
    case GoogleMeet = "google_meet";
    case MicrosoftTeams = "microsoft_teams";
    case Zoom = "zoom";
}
