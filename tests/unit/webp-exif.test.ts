import { describe, expect, it } from "vitest";

import { hasImageMagic, inspectWebP, isSafePublicWebP } from "../../functions/_shared/webp";
import { isoFromExif, offsetMinutes, whitelist } from "../../src/client/exif-fields.js";

function chunk(type: string, payload: number[]) {
  const bytes = new Uint8Array(8 + payload.length + (payload.length % 2));
  bytes.set([...type].map((value) => value.charCodeAt(0)), 0);
  new DataView(bytes.buffer).setUint32(4, payload.length, true);
  bytes.set(payload, 8);
  return bytes;
}

function validWebP(width = 320, height = 240) {
  const vp8x = [0, 0, 0, 0, (width - 1) & 0xff, ((width - 1) >> 8) & 0xff, (width - 1) >> 16, (height - 1) & 0xff, ((height - 1) >> 8) & 0xff, (height - 1) >> 16];
  const vp8 = [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff];
  const body = new Uint8Array([...chunk("VP8X", vp8x), ...chunk("VP8 ", vp8)]);
  const result = new Uint8Array(12 + body.length);
  result.set([..."RIFF"].map((value) => value.charCodeAt(0)), 0);
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  result.set([..."WEBP"].map((value) => value.charCodeAt(0)), 8);
  result.set(body, 12);
  return result;
}

describe("public WebP boundary", () => {
  it("accepts one bounded static frame and rejects metadata, animation, truncation, and oversize dimensions", () => {
    const source = validWebP();
    expect(inspectWebP(source, 900)).toMatchObject({ width: 320, height: 240 });
    expect(isSafePublicWebP(source, 2_000_000, 900)).toBe(true);

    const withExif = new Uint8Array([...source, ...chunk("EXIF", [1, 2, 3, 4])]);
    new DataView(withExif.buffer).setUint32(4, withExif.length - 8, true);
    expect(isSafePublicWebP(withExif, 2_000_000, 900)).toBe(false);

    const withAnimation = new Uint8Array([...source, ...chunk("ANMF", [1, 2, 3, 4])]);
    new DataView(withAnimation.buffer).setUint32(4, withAnimation.length - 8, true);
    expect(isSafePublicWebP(withAnimation, 2_000_000, 900)).toBe(false);
    const withXmpFlag = source.slice();
    withXmpFlag[20] = 0x04;
    expect(isSafePublicWebP(withXmpFlag, 2_000_000, 900)).toBe(false);
    expect(isSafePublicWebP(source.slice(0, -1), 2_000_000, 900)).toBe(false);
    expect(isSafePublicWebP(validWebP(901, 900), 2_000_000, 900)).toBe(false);
  });

  it("recognizes only the supported original-image signatures", () => {
    expect(hasImageMagic("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true);
    expect(hasImageMagic("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(hasImageMagic("image/webp", validWebP())).toBe(true);
    expect(hasImageMagic("image/png", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false);
  });
});

describe("EXIF field whitelist", () => {
  it("maps time zones, signed DMS GPS, camera fields, and safe fallbacks", () => {
    expect(offsetMinutes("+08:00")).toBe(480);
    expect(offsetMinutes("+08:99")).toBeUndefined();
    expect(isoFromExif("2026:08:13 12:34:56", 480)).toBe("2026-08-13T04:34:56.000Z");
    expect(whitelist({
      DateTimeOriginal: "2026:08:13 12:34:56",
      OffsetTimeOriginal: "+08:00",
      GPSLatitude: [{ numerator: 31, denominator: 1 }, { numerator: 13, denominator: 1 }, { numerator: 49, denominator: 1 }],
      GPSLongitude: [121, 28, 25],
      GPSLatitudeRef: "S",
      GPSLongitudeRef: "W",
      Make: "Camera Co",
      Model: "Model X",
      FocalLength: { numerator: 35, denominator: 1 },
      PhotographicSensitivity: 400,
      ApertureValue: 2,
      ShutterSpeedValue: 7,
      Orientation: 6,
      SecretGpsBlob: "must not survive",
    })).toMatchObject({
      capturedAt: "2026-08-13T04:34:56.000Z",
      latitude: -(31 + 13 / 60 + 49 / 3600),
      longitude: -(121 + 28 / 60 + 25 / 3600),
      cameraMake: "Camera Co",
      cameraModel: "Model X",
      focalLength: "35mm",
      cameraIso: "400",
      cameraAperture: "f/2",
      cameraShutter: "1/128s",
      orientation: 6,
    });
    expect(whitelist({ GPSLatitude: 0, GPSLongitude: 0, GPSLatitudeRef: "N", GPSLongitudeRef: "E" })).toMatchObject({ latitude: 0, longitude: 0 });
    expect(whitelist({ GPSLatitude: 91, GPSLongitude: 0 })).not.toHaveProperty("latitude");
  });
});
