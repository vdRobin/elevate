// Specs expect local-time results (e.g. "Afternoon Ride" for 11:10Z) computed in the zone the fixtures were
// written in. Pin it so the suite gives the same results on a UTC CI runner. Workers inherit this variable.
process.env.TZ = "Europe/Paris";

module.exports = {
  testRunner: "jest-jasmine2",
  transform: {
    ".(ts|tsx)": "ts-jest",
    "node_modules/(serialize-error|retry-axios)/.+\\.js$": "ts-jest"
  },
  testTimeout: 60000,
  transformIgnorePatterns: ["json", "node_modules/(?!(serialize-error|retry-axios)/)"],
  globals: {
    "ts-jest": {
      tsconfig: "./tsconfig.json"
    }
  },
  setupFilesAfterEnv: ["<rootDir>/src/test.ts"],
  testEnvironment: "node",
  testRegex: "./src.*\\.(test|spec)\\.(ts|tsx|js)$",
  moduleFileExtensions: ["ts", "tsx", "js"],

  moduleNameMapper: {
    "^@elevate/shared/(.*)$": "<rootDir>/../appcore/modules/shared/$1/",
    "^axios$": "<rootDir>/node_modules/axios/dist/node/axios.cjs"
  }
};
