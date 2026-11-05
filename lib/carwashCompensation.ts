/** Crew-level provision only; individual worker distribution remains OWNER-UNAPPROVED. */
export type CarwashSize = "small" | "large";
export type CrewEntitlement = { size: CarwashSize; quantity: number };

/** Crew-wide amount per registered paid car; never a per-worker earning. */
export const CREW_RATE_PER_CAR = 10 as const;
export function crewProvisionForCarCount(carCount: number): number {
  if (!Number.isInteger(carCount) || carCount < 0) throw new Error("Invalid paid car count");
  return carCount * CREW_RATE_PER_CAR;
}


export const APPROVED_CREW_RATE_PER_CAR: Readonly<Record<CarwashSize, number>> = Object.freeze({
  small: 10, large: 10,
});

export function provisionalCrewEntitlement(cars: CrewEntitlement[]): number {
  return cars.reduce((sum, car) => {
    if (!Number.isInteger(car.quantity) || car.quantity < 0) throw new Error("Invalid car count");
    const rate = APPROVED_CREW_RATE_PER_CAR[car.size];
    if (typeof rate !== "number") throw new Error("Unapproved car size for worker entitlement");
    return sum + rate * car.quantity;
  }, 0);
}

/** Separate from wages already accrued: manager-issued discretionary bonus. */
export function shiftBonusAmount(raw: number): number {
  if (!Number.isFinite(raw) || raw < 0 || Math.abs(Math.round(raw * 100) - raw * 100) > 1e-7) {
    throw new Error("Invalid manager bonus");
  }
  return raw;
}
