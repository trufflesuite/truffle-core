var pkg = require("../package.json");
var solc = require("solc");

var bundle_version = null;

// NOTE: Webpack will replace BUNDLE_VERSION with a string.
if (typeof BUNDLE_VERSION != "undefined") {
  bundle_version = BUNDLE_VERSION;
}

module.exports = {
  core: pkg.version,
  bundle: bundle_version,
  solc: solc.version()
};
