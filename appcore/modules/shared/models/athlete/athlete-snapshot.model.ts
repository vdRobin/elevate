import { AbstractAthlete } from "./abstract.athlete";
import { Gender } from "./gender.enum";
import { AthleteSettings } from "./athlete-settings/athlete-settings.model";

export class AthleteSnapshot extends AbstractAthlete {
  constructor(
    public readonly gender: Gender,
    public readonly age: number,
    public readonly athleteSettings: AthleteSettings
  ) {
    super();
  }

  public equals(otherSnapshot: AthleteSnapshot): boolean {
    if (!otherSnapshot || !otherSnapshot.athleteSettings) {
      return false;
    }

    const settings = this.athleteSettings;
    const otherSettings = otherSnapshot.athleteSettings;

    const isDifferent =
      settings.maxHr !== otherSettings.maxHr ||
      settings.restHr !== otherSettings.restHr ||
      settings.cyclingFtp !== otherSettings.cyclingFtp ||
      settings.runningFtp !== otherSettings.runningFtp ||
      settings.lthr?.default !== otherSettings.lthr?.default ||
      settings.lthr?.cycling !== otherSettings.lthr?.cycling ||
      settings.lthr?.running !== otherSettings.lthr?.running ||
      settings.weight !== otherSettings.weight ||
      settings.swimFtp !== otherSettings.swimFtp ||
      this.age !== otherSnapshot.age ||
      this.gender !== otherSnapshot.gender;

    return !isDifferent;
  }
}
