// Order matters: Edge and the iOS Chrome/Firefox also say "Safari"; Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/(Firefox|FxiOS)\//, 'Firefox'],
  [/(Chrome|CriOS)\//, 'Chrome'],
  [/Version\/[\d.]+.*Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];

const match = (rules: [RegExp, string][], userAgent: string) => rules.find(([pattern]) => pattern.test(userAgent))?.[1];

/** The browser and system of a session, as the settings list them: "Chrome en macOS". */
export function describeDevice(userAgent: string | null | undefined): string {
  const browser = userAgent ? match(BROWSERS, userAgent) : undefined;
  const system = userAgent ? match(SYSTEMS, userAgent) : undefined;
  if (!system) return browser ?? 'Navegador desconocido';
  return `${browser ?? 'Navegador'} en ${system}`;
}
