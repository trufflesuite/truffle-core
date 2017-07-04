var copy = require("./copy");
var path = require("path");
var fs = require("fs");

var templates = {
  test: {
    filename: path.join(__dirname, "templates", "example.js"),
    variable: "example"
  },
  contract: {
    filename: path.join(__dirname, "templates", "Example.sol"),
    name: "Example",
    variable: "example"
  },
  migration: {
    filename: path.join(__dirname, "templates", "migration.js"),
  }
};

var processFile = function(file_path, processfn, callback) {
  var stat = fs.statSync(file_path);

  fs.readFile(file_path, {encoding: "utf8"}, function(err, data) {
    if (err != null) {
      callback(err);
      return;
    }

    var result = processfn(data);
    fs.writeFile(file_path, result, {encoding: "utf8"}, callback);
  });
};

var replaceContents = function(file_path, find, replacement, callback) {
  processFile(file_path, function(data) {
    if (typeof find == "string") {
      find = new RegExp(find, "g");
    }
    return data.replace(find, replacement);
  }, callback);
};

var toUnderscoreFromCamel = function(string) {
  string = string.replace(/([A-Z])/g, function($1) {
    return "_" + $1.toLowerCase();
  });

  if (string[0] == "_") {
    string = string.substring(1);
  }

  return string;
};

var Create = {
  contract: function(directory, name, callback) {
    var from = templates.contract.filename;
    var to = path.join(directory, name + ".sol");

    copy.file(from, to, function(err) {
      if (err) return callback(err);

      replaceContents(to, templates.contract.name, name, callback);
    });
  },

  test: function(directory, name, callback) {
    var underscored = toUnderscoreFromCamel(name);
    underscored = underscored.replace(/\./g, "_");
    var from = templates.test.filename;
    var to = path.join(directory, underscored + ".js");

    copy.file(from, to, function(err) {
      if (err) return callback(err);

      replaceContents(to, templates.contract.name, name, function(err) {
        if (err) return callback(err);
        replaceContents(to, templates.contract.variable, underscored, callback);
      });
    });
  },
  migration: function(directory, name, callback) {
    var underscored = toUnderscoreFromCamel(name || "");
    underscored = underscored.replace(/\./g, "_");
    var from = templates.migration.filename;
    var to = new Date().getTime() / 1000 | 0; // Only do seconds.

    if (name != null && name != "") {
      to += "_" + underscored;
    }

    to += ".js";
    to = path.join(directory, to);

    copy.file(from, to, callback);
  }
}

module.exports = Create
