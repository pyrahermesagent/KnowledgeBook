// Was raw JSON in a .js file, which is not valid JavaScript — `{"extends": ...}`
// parses as a block with a string label and failed both tsc and commitlint.
export default { extends: ['@commitlint/config-conventional'] };
