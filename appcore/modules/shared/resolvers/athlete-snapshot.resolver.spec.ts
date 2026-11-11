import { AthleteSnapshotResolver } from "./athlete-snapshot.resolver";
import { AthleteModel } from "../models/athlete/athlete.model";
import { DatedAthleteSettings } from "../models/athlete/athlete-settings/dated-athlete-settings.model";
import { AthleteSettings } from "../models/athlete/athlete-settings/athlete-settings.model";
import { Gender } from "../models/athlete/gender.enum";

describe("AthleteSnapshotResolver", () => {
  const settings = (maxHr: number) => new AthleteSettings(maxHr, 60, null, 250, 300, 100, 70);

  it("should sort a copy of the dated athlete settings, not the caller's model", () => {
    // Given: dated settings in ascending order
    const datedSettings = [
      new DatedAthleteSettings(null, settings(180)),
      new DatedAthleteSettings("2018-01-01", settings(185)),
      new DatedAthleteSettings("2019-01-01", settings(190))
    ];
    const athleteModel = new AthleteModel(Gender.MEN, datedSettings);
    const callerOrder = athleteModel.datedAthleteSettings.map(dated => dated.since);

    // When
    const resolver = new AthleteSnapshotResolver(athleteModel);

    // Then: the resolver sorts most recent first, the caller's model keeps its order
    expect(resolver.athleteModel.datedAthleteSettings.map(dated => dated.since)).toEqual([
      "2019-01-01",
      "2018-01-01",
      null
    ]);
    expect(athleteModel.datedAthleteSettings.map(dated => dated.since)).toEqual(callerOrder);
    expect(resolver.athleteModel instanceof AthleteModel).toBe(true);
  });

  it("should not modify the static default model", () => {
    const defaultSettings = AthleteModel.DEFAULT_MODEL.datedAthleteSettings;

    const resolver = new AthleteSnapshotResolver(null);

    expect(AthleteModel.DEFAULT_MODEL.datedAthleteSettings).toBe(defaultSettings);
    expect(resolver.athleteModel).not.toBe(AthleteModel.DEFAULT_MODEL);
  });
});
