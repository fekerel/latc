const SRT_TIMESTAMP_LINE_PATTERN =
  /(\d{1,3}:\d{2}:\d{2},\d{3})(\s*-->\s*)(\d{1,3}:\d{2}:\d{2},\d{3})/g;

export function shiftSrtTimestamps(srt, shiftMs = 0) {
  const normalizedShiftMs = Number(shiftMs);

  if (!Number.isFinite(normalizedShiftMs) || normalizedShiftMs === 0) {
    return srt;
  }

  return String(srt).replace(
    SRT_TIMESTAMP_LINE_PATTERN,
    (match, start, separator, end) =>
      `${formatSrtTimestamp(parseSrtTimestamp(start) + normalizedShiftMs)}${separator}${formatSrtTimestamp(parseSrtTimestamp(end) + normalizedShiftMs)}`
  );
}

function parseSrtTimestamp(timestamp) {
  const [hours, minutes, secondsAndMilliseconds] = timestamp.split(":");
  const [seconds, milliseconds] = secondsAndMilliseconds.split(",");

  return (
    Number(hours) * 60 * 60 * 1000 +
    Number(minutes) * 60 * 1000 +
    Number(seconds) * 1000 +
    Number(milliseconds)
  );
}

function formatSrtTimestamp(milliseconds) {
  const clampedMilliseconds = Math.max(0, Math.trunc(milliseconds));
  const hours = Math.floor(clampedMilliseconds / 3_600_000);
  const minutes = Math.floor((clampedMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((clampedMilliseconds % 60_000) / 1000);
  const remainingMilliseconds = clampedMilliseconds % 1000;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(seconds).padStart(2, "0")},${String(remainingMilliseconds).padStart(3, "0")}`
  ].join(":");
}
