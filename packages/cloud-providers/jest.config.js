/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.test\\.ts$",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  testEnvironment: "node",
  testTimeout: 30000,
  verbose: true,
};
