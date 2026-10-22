function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (value && typeof value === "object" && "numerator" in value && "denominator" in value) {
    const result = Number(value.numerator) / Number(value.denominator);
    return Number.isFinite(result) ? result : undefined;
  }
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function first(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function text(value) {
  if (value === undefined || value === null) return "";
  return String(value).replaceAll(/\u0000/g, "").trim().slice(0, 240);
}

function dms(value) {
  if (Array.isArray(value)) {
    const parts = value.map(number).filter((item) => item !== undefined);
    if (parts.length === 3) return parts[0] + parts[1] / 60 + parts[2] / 3600;
    if (parts.length === 1) return parts[0];
  }
  if (value && typeof value === "object" && "degrees" in value) {
    const degrees = number(value.degrees);
    const minutes = number(value.minutes) || 0;
    const seconds = number(value.seconds) || 0;
    if (degrees !== undefined) return degrees + minutes / 60 + seconds / 3600;
  }
  return number(value);
}

function signedCoordinate(value, reference) {
  const coordinate = dms(value);
  if (coordinate === undefined) return undefined;
  const ref = text(reference).toUpperCase();
  const signed = ref === "S" || ref === "W" ? -Math.abs(coordinate) : coordinate;
  return Number.isFinite(signed) ? signed : undefined;
}

export function offsetMinutes(value) {
  const match = text(value).match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[2]);
  const remainder = Number(match[3]);
  const minutes = hours * 60 + remainder;
  if (!Number.isFinite(minutes) || hours > 23 || remainder > 59) return undefined;
  return match[1] === "-" ? -minutes : minutes;
}

export function isoFromExif(value, offset) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?/);
  if (!match) {
    const parsed = new Date(raw);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : undefined;
  }
  const milliseconds = Number((match[7] || "0").slice(0, 3).padEnd(3, "0"));
  const parts = [Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]), milliseconds];
  const instant = offset === undefined
    ? new Date(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6])
    : new Date(Date.UTC(parts[0], parts[1], parts[2], parts[3], parts[4], parts[5], parts[6]) - offset * 60 * 1000);
  return Number.isFinite(instant.getTime()) ? instant.toISOString() : undefined;
}

function decimal(value) {
  const result = number(value);
  if (result === undefined) return "";
  return Number.isInteger(result) ? String(result) : String(Number(result.toFixed(2)));
}

function formatLens(value) {
  const focalLength = number(value);
  return focalLength === undefined || focalLength < 0 ? "" : `${decimal(focalLength)}mm`;
}

function formatIso(value) {
  const iso = number(value);
  return iso === undefined || iso < 0 ? undefined : String(Math.round(iso));
}

function formatAperture(value) {
  const aperture = number(value);
  if (aperture === undefined || aperture <= 0) return "";
  return `f/${decimal(aperture)}`;
}

function formatShutter(value) {
  const seconds = number(value);
  if (seconds === undefined || seconds <= 0) return "";
  if (seconds < 1) return `1/${Math.max(1, Math.round(1 / seconds))}s`;
  return `${decimal(seconds)}s`;
}

export function whitelist(tags) {
  const source = tags && typeof tags === "object" ? tags : {};
  const dateValue = first(source.DateTimeOriginal, source.dateTimeOriginal, source.CreateDate, source.createDate, source.DateTimeDigitized, source.dateTimeDigitized);
  const offset = offsetMinutes(first(source.OffsetTimeOriginal, source.offsetTimeOriginal));
  const apertureValue = number(first(source.FNumber, source.fNumber));
  const apertureFallback = number(first(source.ApertureValue, source.apertureValue));
  const shutterValue = number(first(source.ExposureTime, source.exposureTime));
  const shutterFallback = number(first(source.ShutterSpeedValue, source.shutterSpeedValue));
  const latitudeValue = signedCoordinate(first(source.GPSLatitude, source.latitude), first(source.GPSLatitudeRef, source.latitudeRef));
  const longitudeValue = signedCoordinate(first(source.GPSLongitude, source.longitude), first(source.GPSLongitudeRef, source.longitudeRef));
  const latitude = latitudeValue !== undefined && latitudeValue >= -90 && latitudeValue <= 90 ? latitudeValue : undefined;
  const longitude = longitudeValue !== undefined && longitudeValue >= -180 && longitudeValue <= 180 ? longitudeValue : undefined;
  const aperture = apertureValue !== undefined ? apertureValue : apertureFallback !== undefined ? 2 ** (apertureFallback / 2) : undefined;
  const shutter = shutterValue !== undefined ? shutterValue : shutterFallback !== undefined ? 2 ** -shutterFallback : undefined;
  const iso = formatIso(first(source.ISO, source.iso, source.PhotographicSensitivity, source.photographicSensitivity));
  const formattedAperture = formatAperture(aperture);
  const formattedShutter = formatShutter(shutter);
  const orientation = number(first(source.Orientation, source.orientation));
  return {
    ...(dateValue !== undefined ? { capturedAt: isoFromExif(dateValue, offset) } : {}),
    ...(text(first(source.Make, source.make)) ? { cameraMake: text(first(source.Make, source.make)) } : {}),
    ...(text(first(source.Model, source.model)) ? { cameraModel: text(first(source.Model, source.model)) } : {}),
    ...(text(first(source.LensModel, source.lensModel)) ? { lensModel: text(first(source.LensModel, source.lensModel)) } : {}),
    ...(formatLens(first(source.FocalLength, source.focalLength)) ? { focalLength: formatLens(first(source.FocalLength, source.focalLength)) } : {}),
    ...(iso ? { cameraIso: iso } : {}),
    ...(formattedAperture ? { cameraAperture: formattedAperture } : {}),
    ...(formattedShutter ? { cameraShutter: formattedShutter } : {}),
    ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    ...(orientation !== undefined && orientation >= 1 && orientation <= 8 ? { orientation: Math.trunc(orientation) } : {}),
  };
}
