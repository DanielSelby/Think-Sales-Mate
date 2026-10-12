export type CashClosingShiftWindow = { start: string; end: string };

export function businessDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function businessDateForSchedule(
  instant: Date,
  timeZone: string,
  requiredShifts: string[],
  shiftWindows: Record<string, CashClosingShiftWindow>,
) {
  const currentLocalDate = businessDateInTimeZone(instant, timeZone);
  const previousDate = new Date(`${currentLocalDate}T00:00:00.000Z`);
  previousDate.setUTCDate(previousDate.getUTCDate() - 1);
  const previousBusinessDate = previousDate.toISOString().slice(0, 10);
  for (const shift of requiredShifts) {
    const window = shiftWindows[shift];
    if (!window || window.end > window.start) continue;
    const period = getCashClosingPeriod(previousBusinessDate, shift, timeZone, window);
    if (instant >= period.start && instant < period.end) return previousBusinessDate;
  }
  return currentLocalDate;
}

export function localDateTimeToUtc(date: string, time: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = desiredWallClock;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const values = Object.fromEntries(formatter.formatToParts(new Date(timestamp)).map(({ type, value }) => [type, value]));
    const representedWallClock = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
    );
    const adjustment = desiredWallClock - representedWallClock;
    if (adjustment === 0) return new Date(timestamp);
    timestamp += adjustment;
  }

  throw new Error(`The selected time does not exist in timezone ${timeZone} on ${date}.`);
}

export function getCashClosingPeriod(
  date: string,
  shift: string,
  timeZone: string,
  shiftWindow?: CashClosingShiftWindow,
) {
  if (shift === "full_day" || !shiftWindow) {
    const start = localDateTimeToUtc(date, "00:00", timeZone);
    const nextDate = new Date(`${date}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const end = localDateTimeToUtc(nextDate.toISOString().slice(0, 10), "00:00", timeZone);
    return { start, end };
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(shiftWindow.start)
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(shiftWindow.end)
    || shiftWindow.start === shiftWindow.end) {
    throw new Error("The selected branch has an invalid shift time window.");
  }

  const start = localDateTimeToUtc(date, shiftWindow.start, timeZone);
  const endDate = new Date(`${date}T00:00:00.000Z`);
  if (shiftWindow.end <= shiftWindow.start) endDate.setUTCDate(endDate.getUTCDate() + 1);
  const end = localDateTimeToUtc(endDate.toISOString().slice(0, 10), shiftWindow.end, timeZone);
  return { start, end };
}
