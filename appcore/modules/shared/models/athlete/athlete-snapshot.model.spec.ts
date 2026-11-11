import { AthleteSnapshot } from "./athlete-snapshot.model";
import { AthleteSettings } from "./athlete-settings/athlete-settings.model";
import { Gender } from "./gender.enum";
import { UserLactateThreshold } from "./athlete-settings/user-lactate-threshold.model";

describe("AthleteSnapshot", () => {
  const settings = (lthr: UserLactateThreshold = null, maxHr = 190) =>
    new AthleteSettings(maxHr, 60, lthr, 250, 300, 100, 70);

  it("should equal a snapshot with the same values", () => {
    const snapshot = new AthleteSnapshot(Gender.MEN, 30, settings());
    expect(snapshot.equals(new AthleteSnapshot(Gender.MEN, 30, settings()))).toBe(true);
  });

  it("should not equal a snapshot with a different value", () => {
    const snapshot = new AthleteSnapshot(Gender.MEN, 30, settings());
    expect(snapshot.equals(new AthleteSnapshot(Gender.MEN, 30, settings(null, 185)))).toBe(false);
    expect(snapshot.equals(new AthleteSnapshot(Gender.MEN, 31, settings()))).toBe(false);
  });

  it("should not equal a missing snapshot", () => {
    const snapshot = new AthleteSnapshot(Gender.MEN, 30, settings());
    expect(snapshot.equals(null)).toBe(false);
    expect(snapshot.equals(undefined)).toBe(false);
  });

  it("should compare snapshots without lactate threshold", () => {
    const withLthr = new AthleteSnapshot(Gender.MEN, 30, settings({ default: 160, cycling: 165, running: 170 }));
    const withoutLthr = new AthleteSnapshot(Gender.MEN, 30, settings(null));

    expect(withoutLthr.equals(new AthleteSnapshot(Gender.MEN, 30, settings(null)))).toBe(true);
    expect(withoutLthr.equals(withLthr)).toBe(false);
    expect(withLthr.equals(withoutLthr)).toBe(false);
  });
});
