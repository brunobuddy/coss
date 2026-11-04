import { describe, expect, test } from "bun:test";
import { dateLocale, MESSAGE_LOCALES, messageLocale, translator } from "../src/i18n.ts";

describe("choosing a language", () => {
  test.each([
    ["de", "de"],
    ["de-DE", "de"],
    ["de-AT", "de"],
    ["DE-de", "de"],
    ["pt", "pt"],
    ["pt-PT", "pt"],
    ["pt-BR", "pt-BR"],
    ["zh", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["zh-Hans", "zh-CN"],
    ["zh-TW", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-Hant", "zh-TW"],
    ["es-419", "es"],
    ["en-GB", "en"],
    ["ar", "en"],
    ["he-IL", "en"],
    ["not a locale", "en"],
    ["", "en"],
    [null, "en"],
    [undefined, "en"],
  ])("%s gets %s", (given, expected) => {
    expect(messageLocale(given)).toBe(expected as never);
  });

  test("a date is only in another language when the words are", () => {
    expect(dateLocale("de-DE")).toBe("de-DE");
    expect(dateLocale("en-GB")).toBe("en-GB");
    expect(dateLocale("ar")).toBe("en-US");
    expect(dateLocale("not a locale")).toBe("en-US");
    expect(dateLocale(null)).toBe("en-US");
  });
});

describe("the catalogs", () => {
  const english = translator("en");
  const withPlaceholders = [
    "subject_confirmed",
    "subject_pending_approval",
    "subject_rescheduled",
    "subject_cancelled",
    "subject_declined",
    "subject_reminder",
    "reason_attendee",
    "reason_guest",
    "reason_host",
    "reconnect_through",
  ] as const;

  test.each(MESSAGE_LOCALES)("%s keeps every placeholder", (locale) => {
    const t = translator(locale);
    for (const key of withPlaceholders) {
      const placeholders = (text: string) => text.match(/\{\w+\}/g)?.sort();
      expect(placeholders(t(key))).toEqual(placeholders(english(key)));
    }
  });

  test.each(MESSAGE_LOCALES)("%s keeps STOP as the keyword", (locale) => {
    expect(translator(locale)("sms_opt_out")).toContain("STOP");
  });

  test("everything but English is translated", () => {
    for (const locale of MESSAGE_LOCALES.filter((name) => name !== "en")) {
      const t = translator(locale);
      expect(t("lead_confirmed_attendee")).not.toBe(english("lead_confirmed_attendee"));
      expect(t("button_manage")).not.toBe(english("button_manage"));
    }
  });

  test("a customer's text can't be taken for a placeholder", () => {
    const t = translator("en");
    expect(t("subject_confirmed", { title: "{sender} $& $1" })).toBe("Confirmed: {sender} $& $1");
  });
});
