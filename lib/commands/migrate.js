var command = {
  command: 'migrate',
  description: 'Run migrations to deploy contracts',
  builder: {
    reset: {
      type: "boolean",
      default: false
    },
    "compile-all": {
      describe: "recompile all contracts",
      type: "boolean",
      default: false
    },
    "dry-run": {
      describe: "Run migrations against an in-memory fork, for testing",
      type: "boolean",
      default: false
    },
    f: {
      describe: "Specify a migration number to run from",
      type: "number"
    }
  },
  run: function (options, done) {
    var OS = require("os");
    var Config = require("truffle-config");
    var Contracts = require("truffle-workflow-compile");
    var Resolver = require("truffle-resolver");
    var Artifactor = require("truffle-artifactor");
    var Migrate = require("truffle-migrate");
    var Environment = require("../environment");
    var NPMDependencies = require("../npmdeps");
    var temp = require("temp");
    var async = require("async");
    var copy = require("../copy");

    var rootConfig = Config.detect(options);
    var logger = rootConfig.logger;

    function setupDryRunEnvironmentAndRunAllMigrations(rootConfig, configs, callback) {
      Environment.fork(rootConfig, function(err) {
        if (err) return callback(err);

        function cleanup() {
          var args = arguments;
          // Ensure directory cleanup.
          temp.cleanup(function(err) {
            // Ignore cleanup errors.
            callback.apply(null, args);
          });
        };

        // Copy artifacts to a temporary directory
        async.eachSeries(configs, function(config, cb2) {
          temp.mkdir('migrate-dry-run-', function(err, temporaryDirectory) {
            if (err) return cb2(err);

            copy(config.contracts_build_directory, temporaryDirectory, function(err) {
              if (err) return cb2(err);

              config.contracts_build_directory = temporaryDirectory;

              // Note: Create a new artifactor and resolver with the updated config.
              // This is because the contracts_build_directory changed.
              // Ideally we could architect them to be reactive of the config changes.
              config.artifactor = new Artifactor(temporaryDirectory);
              config.resolver = new Resolver(config);

              runMigrations(config, cb2);
            });
          }, cleanup);
        });
      });
    }

    function runMigrations(config, callback) {
      if (options.f) {
        Migrate.runFrom(options.f, config, callback);
      } else {
        Migrate.needsMigrating(config, function(err, needsMigrating) {
          if (err) return callback(err);

          if (needsMigrating) {
            Migrate.run(config, callback);
          } else {
            logger.log("Network up to date.")
            callback();
          }
        });
      }
    };

    var migrationConfigs = NPMDependencies.detect(rootConfig, options);

    async.eachSeries(migrationConfigs, Environment.detect, function(err) {
      if (err) return done(err);

      async.eachSeries(migrationConfigs, function(config, callback) {
        // async's introspection trips on Contracts.compile's variate signature
        // so we explicitly pass through these params
        Contracts.compile(config, callback);
      }, function(err) {
        if (err) return done(err);

        var dryRun = options.dryRun === true;

        var networkMessage = "Using networks '" + migrationConfigs.map(function(cfg) { return cfg.network; }).join(',') + "'";

        if (dryRun) {
          networkMessage += " (dry run)";
        }

        logger.log(networkMessage + "." + OS.EOL);

        if (dryRun) {
          setupDryRunEnvironmentAndRunAllMigrations(rootConfig, migrationConfigs, done);
        } else {
          async.eachSeries(migrationConfigs, runMigrations, done);
        }
      });
    });
  }
}

module.exports = command;
