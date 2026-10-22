/**
 * ReMarket geographic distance utility.
 *
 * Computes the great-circle distance between two latitude/longitude points
 * with the Haversine formula. The result is in kilometres (km), not road or
 * driving distance.
 *
 * Keep this function signature compatible with the Near Me API:
 * haversineDistance(latitude, longitude, businessLatitude, businessLongitude)
 */

const EARTH_MEAN_RADIUS_KM = 6_371.0088;
const DEGREES_TO_RADIANS = Math.PI / 180;

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function toRadians(degrees: number): number {
  return degrees * DEGREES_TO_RADIANS;
}

/**
 * Return straight-line distance between two geographic coordinates in km.
 *
 * @throws RangeError when any coordinate is non-finite or outside its valid
 * latitude/longitude range. Callers handling untrusted or nullable coordinates
 * should validate those values before calling this function.
 */
export function haversineDistance(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
): number {
  if (!isValidLatitude(latitude1)) {
    throw new RangeError("latitude1 must be a finite value between -90 and 90.");
  }

  if (!isValidLongitude(longitude1)) {
    throw new RangeError("longitude1 must be a finite value between -180 and 180.");
  }

  if (!isValidLatitude(latitude2)) {
    throw new RangeError("latitude2 must be a finite value between -90 and 90.");
  }

  if (!isValidLongitude(longitude2)) {
    throw new RangeError("longitude2 must be a finite value between -180 and 180.");
  }

  const lat1 = toRadians(latitude1);
  const lat2 = toRadians(latitude2);
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);

  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);

  const haversine =
    sinLatitude * sinLatitude +
    Math.cos(lat1) *
      Math.cos(lat2) *
      sinLongitude *
      sinLongitude;

  // Floating-point rounding can produce a value marginally outside [0, 1].
  const clampedHaversine = Math.min(1, Math.max(0, haversine));
  const centralAngle =
    2 *
    Math.atan2(
      Math.sqrt(clampedHaversine),
      Math.sqrt(1 - clampedHaversine)
    );

  return EARTH_MEAN_RADIUS_KM * centralAngle;
}
