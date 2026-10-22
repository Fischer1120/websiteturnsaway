import { parse } from "exifr";
import { whitelist } from "./exif-fields.js";

const PICK = [
  "DateTimeOriginal",
  "CreateDate",
  "DateTimeDigitized",
  "OffsetTimeOriginal",
  "GPSLatitude",
  "GPSLongitude",
  "GPSLatitudeRef",
  "GPSLongitudeRef",
  "Make",
  "Model",
  "LensModel",
  "FocalLength",
  "ISO",
  "PhotographicSensitivity",
  "FNumber",
  "ApertureValue",
  "ExposureTime",
  "ShutterSpeedValue",
  "Orientation",
];

async function read(file) {
  try {
    const tags = await parse(file, {
      pick: PICK,
      translateKeys: true,
      translateValues: false,
      reviveValues: false,
      sanitize: true,
      silentErrors: true,
    });
    const fields = whitelist(tags);
    return { status: Object.keys(fields).length ? "recognized" : "missing", fields };
  } catch {
    return { status: "failed", fields: {} };
  }
}

globalThis.WTAExif = { read };
