var repl = require("repl");
var Web3 = require("web3");
var vm = require("vm");
var _ = require("lodash");
var fs = require("fs");
var path = require("path");

var awaitOutside = require("await-outside");

var provision = require("truffle-provisioner");
var contract = require("truffle-contract");
var expect = require("truffle-expect");
var TruffleError = require("truffle-error");
var TruffleRequire = require("truffle-require");

var Command = require("./command");

function TruffleInterpreter(tasks, options) {
  this.options = options;
  this.r = null;
  this.command = new Command(tasks);
};

TruffleInterpreter.prototype.start = function() {
  var self = this;
  var options = this.options;

  var web3 = new Web3();
  web3.setProvider(options.provider);

  this.provision(function(err, abstractions) {
    if (err) {
      options.logger.log("Unexpected error: Cannot provision contracts while instantiating the console.");
      options.logger.log(err.stack || err.message || err);
    }

    var prefix = "truffle(" + options.network + ")> ";

    try {
      self.r = repl.start({
        prompt: prefix,
      });

      self.r.on("exit", function() {
        process.exit(1);
      });

      self.resetContractsInConsoleContext(abstractions);
      self.r.context.web3 = web3;

      // Add commands as repl commands
      Object.keys(self.command.commands).forEach(function(k) {
        var command = self.command.commands[k]
        self.r.defineCommand(k, {
          help: "[Truffle] " + command.description,
          action: function() {
            var _this = this;
            self.command.run(command.command, self.options, function(err) {
              // @TODO(shrugs) err

              // Reprovision after each command as it may change contracts.
              self.provision(function(err) {
                _this.displayPrompt();
              });
            })
          }
        })
      });

      // process our code with babel first
      var originalEval = self.r.eval;
      self.r.eval = function(source, context, file, cb) {
        var code;
        try {
          code = TruffleRequire.transform(source);
        } catch (error) {
          return cb(new repl.Recoverable(error))
        }
        originalEval(code, context, file, function(err, res) {
          // We want to hide any transpiled nonsense from the user
          if (res === "use strict") {
            return cb(err);
          } else {
            return cb(err, res);
          }
        });
      }

      // finally, add await-outside to this repl
      awaitOutside.addAwaitOutsideToReplServer(self.r);

    } catch(e) {
      console.log(e.stack);
      process.exit(1);
    }
  });
};

TruffleInterpreter.prototype.provision = function(callback) {
  var self = this;

  fs.readdir(this.options.contracts_build_directory, function(err, files) {
    if (err) {
      // Error reading the build directory? Must mean it doesn't exist or we don't have access to it.
      // Couldn't provision the contracts if we wanted. It's possible we're hiding very rare FS
      // errors, but that's better than showing the user error messages that will be "build folder
      // doesn't exist" 99.9% of the time.
    }

    var promises = [];
    files = files || [];

    files.forEach(function(file) {
      promises.push(new Promise(function(accept, reject) {
        fs.readFile(path.join(self.options.contracts_build_directory, file), "utf8", function(err, body) {
          if (err) return reject(err);
          try {
            body = JSON.parse(body);
          } catch (e) {
            return reject(new Error("Cannot parse " + file + ": " + e.message));
          }

          accept(body);
        })
      }))
    });

    Promise.all(promises).then(function(json_blobs) {
      var abstractions = json_blobs.map(function(json) {
        var abstraction = contract(json);
        provision(abstraction, self.options);
        return abstraction;
      });

      self.resetContractsInConsoleContext(abstractions);

      callback(null, abstractions);
    }).catch(callback);
  });
};

TruffleInterpreter.prototype.resetContractsInConsoleContext = function(abstractions) {
  var self = this;

  abstractions = abstractions || []

  if (this.r != null) {
    abstractions.forEach(function(abstraction) {
      self.r.context[abstraction.contract_name] = abstraction;
    });
  }
}

var Repl = {
  TruffleInterpreter: TruffleInterpreter,

  run: function(tasks, options) {
    var self = this;

    expect.options(options, [
      "working_directory",
      "contracts_directory",
      "contracts_build_directory",
      "migrations_directory",
      "network",
      "network_id",
      "provider",
      "resolver",
      "build_directory"
    ]);

    var interpreter = new TruffleInterpreter(tasks, options);
    interpreter.start();
  }
}

module.exports = Repl;
