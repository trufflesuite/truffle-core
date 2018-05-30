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
    var fs = require("fs");
    var path = require("path");
    var Config = require("truffle-config");
    var Contracts = require("truffle-workflow-compile");
    var Resolver = require("truffle-resolver");
    var Artifactor = require("truffle-artifactor");
    var Migrate = require("truffle-migrate");
    var Environment = require("../environment");
    var temp = require("temp");
    var async = require("async");
    var _ = require("lodash");
    var toposort = require('toposort')
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

    var visitedPackages = {}
    var allDependencies = []

    function getNPMDependenciesOf(pkgName, parentName) {
      if (visitedPackages[pkgName]) {
        if (visitedPackages[pkgName] instanceof Config && parentName) {
          allDependencies.push([pkgName, parentName]);
        }
        return;
      }

      visitedPackages[pkgName] = true;

      if (pkgName === ".") {
        pkgRoot = ".";
        visitedPackages[pkgName] = rootConfig;
      } else {
        pkgRoot = path.join(".", "node_modules", pkgName);

        var pkgOptions = _.assign({}, options, { workingDirectory: pkgRoot });
        delete pkgOptions.working_directory;
        var config = Config.detect(pkgOptions);

        // If package is a Truffle project, then the Truffle config
        // will be found in the package root.
        // Otherwise, skip this package.
        if (path.relative(pkgRoot, config.working_directory) !== '') {
          return;
        }

        visitedPackages[pkgName] = config;
      }

      if (parentName) {
        allDependencies.push([pkgName, parentName]);
      }

      var pkgJsonPath = path.join(pkgRoot, "package.json");

      try {
        var pkgJsonStr = fs.readFileSync(pkgJsonPath);
      } catch(e) {
        if(pkgName !== ".")
          logger.log(pkgJsonPath + ' could not be read: ' + e);
        return;
      }

      try {
        var pkgJson = JSON.parse(pkgJsonStr);
      } catch(e) {
        if (e instanceof SyntaxError) {
          logger.log(pkgJsonPath + ' not valid JSON');
          return;
        }
        throw e;
      }

      _.keys(pkgJson.dependencies).forEach(function(dep) {
        getNPMDependenciesOf(dep, pkgName);
      });
    }

    getNPMDependenciesOf(".");

    var migrationSequence = allDependencies.length > 0 ? toposort(allDependencies) : ["."];
    var migrationConfigs = migrationSequence.map(function(pkgName) {
      var config = visitedPackages[pkgName];
      if (!(config instanceof Config)) {
        throw new ValueError(pkgName + " did not produce a config???");
      }
      return config;
    });

    migrationConfigs.forEach(function(config) {
      config.networks = rootConfig.networks;
      config.node_modules_directory = rootConfig.node_modules_directory;
    });

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
