var command = {
  command: 'compile',
  description: 'Compile contract source files',
  builder: {
    all: {
      type: "boolean",
      default: false
    },
    network: {
      type: 'string',
      description: 'Specify the network to use, saving artifacts specific to that network',
      default: 'development'
    }
  },
  run: function (options, done) {
    var Config = require("truffle-config");
    var Contracts = require("../contracts");

    var config = Config.detect(options);
    Contracts.compile(config, done);
    console.log(config.network())
  }
}

module.exports = command;
