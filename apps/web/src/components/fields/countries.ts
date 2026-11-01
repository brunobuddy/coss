const names = new Intl.DisplayNames(["en"], { type: "region" });

/** "DE" → "Germany" (the code itself when unknown). */
export function countryName(code: string): string {
  try {
    return names.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function isCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code) && countryName(code) !== code;
}
