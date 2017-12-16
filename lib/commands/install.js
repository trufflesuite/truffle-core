var command = {
  command: 'install [packages...]',
  description: 'Install a package from the Ethereum Package Registry',
  builder: {},
  run: function (options, done) {
    var Config = require("truffle-config");
    var Package = require("../package");

    var config = Config.detect(options);
    Package.install(config, done);
  }
}

module.exports = command;
