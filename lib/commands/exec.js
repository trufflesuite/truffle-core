var command = {
  command: 'exec <file>',
  description: 'Execute a JS module within this Truffle environment',
  builder: {
    network: {
      description: 'Specify the network to use, using artifacts specific to that network.',
      type: 'string',
      default: 'development'
    }
  },
  run: function (options, done) {
    var Config = require("truffle-config");
    var ConfigurationError = require("../errors/configurationerror");
    var Require = require("truffle-require");
    var Environment = require("../environment");
    var path = require("path");
    var OS = require("os");

    var config = Config.detect(options);

    var file = options.file;

    if (file == null) {
      done(new ConfigurationError("Please specify a file, passing the path of the script you'd like the run. Note that all scripts *must* call process.exit() when finished."));
      return;
    }

    if (path.isAbsolute(file) == false) {
      file = path.join(process.cwd(), file);
    }

    Environment.detect(config, function(err) {
      if (err) return done(err);

      if (config.networkHint !== false) {
        config.logger.log("Using network '" + config.network + "'." + OS.EOL);
      }

      Require.exec(config.with({
        file: file
      }), done);
    });
  }
}

module.exports = command;
