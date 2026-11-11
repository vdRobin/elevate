import { LowPassFilter } from "./low-pass-filter";

describe("LowPassFilter", () => {
  let lowPassFilter: LowPassFilter;

  beforeEach(done => {
    lowPassFilter = new LowPassFilter();
    done();
  });

  describe("init()", () => {
    it("should return initiated stream", () => {
      lowPassFilter.init([10, 8, 9, 10, 12, 8, 50, 10, 12, 8]);
      expect(lowPassFilter.buffer).toEqual([10, 8, 9, 10, 12, 8, 50, 10, 12, 8]);
    });

    it("should return initiated stream - overflow", () => {
      lowPassFilter.init([10, 8, 9, 10, 12, 8, 50, 10, 12, 8, 15, 20, 30]);
      expect(lowPassFilter.buffer).toEqual([10, 12, 8, 50, 10, 12, 8, 15, 20, 30]);
    });
  });

  describe("next()", () => {
    it("should return same value", () => {
      lowPassFilter.smoothing = 1;
      lowPassFilter.init([10, 8, 9, 10, 12, 8, 50, 10, 12, 8]);
      const result = Math.round(lowPassFilter.next(50));
      expect(result).toEqual(50);
    });

    it("should return smoothed value", () => {
      lowPassFilter.smoothing = 0.2;
      lowPassFilter.init([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
      const result = Math.round(lowPassFilter.next(20));
      expect(result).toEqual(12);
    });
  });

  describe("smoothArray()", () => {
    it("should return same array", () => {
      lowPassFilter.smoothing = 1;
      const values = [10, 8, 9, 10, 12, 8, 50, 10, 12, 8];
      expect(lowPassFilter.smoothArray(values)).toEqual(values);
    });

    it("should return smoothed array", () => {
      lowPassFilter.smoothing = 0.5;
      const values = [10, 8, 9, 10, 12, 8, 50, 10, 12, 8];
      expect(lowPassFilter.smoothArray(values)).toEqual([10, 9, 9, 9.5, 10.75, 9.38, 29.69, 19.84, 15.92, 11.96]);
    });
  });
});
