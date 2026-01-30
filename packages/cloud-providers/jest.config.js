/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",
  testRegex: ".*\\.(?<!integration\\.)test\\.ts$",
  testPathIgnorePatterns: ["/node_modules/", "/__integration__/"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  testEnvironment: "node",
  testTimeout: 30000,
  verbose: true,
};
