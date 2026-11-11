module.exports = {
  testRunner: "jest-jasmine2",
  testEnvironment: "jsdom",
  preset: "jest-preset-angular",
  roots: ["<rootDir>/src/", "<rootDir>/modules/"],
  testMatch: ["**/+(*.)+(spec).+(ts)"],
  setupFilesAfterEnv: ["<rootDir>/src/test.ts"],
  collectCoverage: true,
  coverageReporters: ["html"],
  coverageDirectory: "coverage/"
};
