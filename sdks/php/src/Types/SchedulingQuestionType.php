<?php

namespace Coss\Types;

enum SchedulingQuestionType: string
{
    case Text = "text";
    case Textarea = "textarea";
    case Select = "select";
    case Radio = "radio";
    case Checkbox = "checkbox";
    case Phone = "phone";
    case Email = "email";
    case Number = "number";
}
