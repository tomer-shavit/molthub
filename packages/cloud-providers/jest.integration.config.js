/** @type {import('jest').Config} */
const baseConfig = require("./jest.config");

module.exports = {
  ...baseConfig,
  testRegex: ".*\\.integration\\.test\\.ts$",
  testPathIgnorePatterns: ["/node_modules/"],
  testTimeout: 180000, // 3 minutes per test for slow deployments
};
