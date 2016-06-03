/*!
  Spoke - A lightweight Jasmine test framework for ServiceNow
  Contribute at github.com/sn-developer/Spoke
  james@sndeveloper.com
*/
function snd_Spoke() {
  this.total_specs_defined = 0;
  this.reporter = snd_Spoke.Reporter();
  this.current_spec = null;
  this.currently_executing_suites = [];
  this.top_suite = new snd_Spoke.Suite({
    description: 'Spoke_Top_Suite',
    id: 'TopSuite',
    tree_only: true
  });
  this.current_declaration_suite = this.top_suite;
  this.next_suite_id = 0;
}

snd_Spoke.prototype = {
  type: 'Spoke',

  execute: function () {
    this.reporter.start({
      total_specs_defined: this.total_specs_defined
    });
    this.top_suite.execute({
      reporter: this.reporter,
      env: this
    });
    this.reporter.done();
    return this.reporter;
  },

  getNextSuiteId: function () {
    return 'suite' + this.next_suite_id++;
  },

  addSpecsToSuite: function (suite, spec_definitions) {
    var parent_suite = this.current_declaration_suite;
    parent_suite.addChild(suite);
    this.current_declaration_suite = suite;

    var declaration_error = null;
    try {
      if (spec_definitions) {
        spec_definitions.call(suite);
      }
    } catch (e) {
      declaration_error = e;
    }

    if (declaration_error) {
      this.it('encountered a declaration exception', function () {
        throw declaration_error;
      });
    }

    this.current_declaration_suite = parent_suite;
  },

  currentRunnable: function () {
    return this.current_spec || this.currentSuite();
  },

  currentSuite: function () {
    return this.currently_executing_suites[this.currently_executing_suites.length - 1];
  },

  updateEnv: function (env) {
    var self = this;
    env.describe = function () {
      return self.describe.apply(self, arguments);
    };
    env.xdescribe = function () {
      var suite = self.describe.apply(self, arguments);
      suite.disable();
      return suite;
    };
    env.it = function () {
      return self.it.apply(self, arguments);
    };
    env.xit = function () {
      var spec = self.it.apply(self, arguments);
      spec.pend();
      return spec;
    };
    env.expect = function () {
      return self.expect.apply(self, arguments);
    };
    env.fail = function () {
      return self.fail.apply(self, arguments);
    };
    env.beforeAll = function () {
      return self.beforeAll.apply(self, arguments);
    };
    env.afterAll = function () {
      return self.afterAll.apply(self, arguments);
    };
    env.beforeEach = function () {
      return self.beforeEach.apply(self, arguments);
    };
    env.afterEach = function () {
      return self.afterEach.apply(self, arguments);
    };
    env.pending = function () {
      return self.pending.apply(self, arguments);
    };
  },

  describe: function (description, spec_definitions) {
    var suite = new snd_Spoke.Suite({
      description: description,
      id: this.getNextSuiteId(),
      parent_suite: this.current_declaration_suite
    });
    this.addSpecsToSuite(suite, spec_definitions);
    return suite;
  },

  it: function (description, fn) {
    var suite = this.current_declaration_suite;
    this.total_specs_defined++;
    var spec = new snd_Spoke.Spec({
      description: description,
      fn: fn,
      getSpecName: function (spec) {
        return suite.getFullName() + ' ' + spec.description;
      }
    });
    this.current_declaration_suite.addChild(spec);
    return spec;
  },

  expect: function (actual) {
    var runnable = this.currentRunnable();
    if (!runnable) {
      throw new Error('\'expect\' was used when there was no current spec');
    }
    return this.currentRunnable().expect(actual);
  },

  fail: function (error) {
    var runnable = this.currentRunnable();
    var message = 'Failed';
    if (error) {
      message += ': ';
      message += error.message || error;
    }

    if (!runnable) {
      throw new Error('\'fail\' was used when there was no current spec');
    }

    this.currentRunnable().addExpectationResult(false, {
      matcherName: '',
      passed: false,
      expected: '',
      actual: '',
      message: message,
      error: error && error.message ? error : null
    });
  },

  beforeAll: function () {
    throw new Error('beforeAll is not implemented yet.');
  },
  afterAll: function () {
    throw new Error('afterAll is not implemented yet.');
  },
  beforeEach: function () {
    throw new Error('beforeEach is not implemented yet.');
  },
  afterEach: function () {
    throw new Error('afterEach is not implemented yet.');
  },

  pending: function (message) {
    var fullMessage = snd_Spoke.Spec.pendingSpecExceptionMessage;
    if(message) {
      fullMessage += message;
    }
    throw fullMessage;
  }

};

snd_Spoke.isArray_ = function (value) {
    return snd_Spoke.isA_('Array', value);
  };
snd_Spoke.isString_ = function (value) {
  return snd_Spoke.isA_('String', value);
};
snd_Spoke.isNumber_ = function (value) {
  return snd_Spoke.isA_('Number', value);
};
snd_Spoke.isA_ = function (typeName, value) {
  return Object.prototype.toString.apply(value) === '[object ' + typeName + ']';
};
snd_Spoke.fnNameFor = function (func) {
  return func.name || func.toString().match(/^\s*function\s*(\w*)\s*\(/)[1];
};

snd_Spoke.executeFromScripts = function (glide_record, script_field) {

  function getCurrentScope(gr) {
    var name;

    if (glide_record.sys_scope && !glide_record.sys_scope.nil()) {
      return glide_record.sys_scope;
    }

    name = gs.getCurrentScopeName();
    gr = new GlideRecord('sys_scope');
    if (name && name != 'rhino.global') {
      gr.addQuery('scope', '=', name);
      gr.setLimit(1);
      gr.query();
      gr.next();
    }

    return gr.sys_id;
  }

  var self = this,
      gse,
      fn;

  var script = 'var $ = new snd_Spoke();\n' +
      '$.updateEnv(this);\n\n';

  if (glide_record.hasNext()) {
    while (glide_record.next()) {
      script += 'describe("Specification script: ' + glide_record.getDisplayValue() + '", function () { \n';
      script += glide_record.getValue(script_field) + '\n\n';
      script += '});\n';
    }
    script += '$.execute();';
  } else {
    script += '$.execute();';
    script += "$.reporter.status = 'ignored';";
    script += '$.reporter'; // so the reporter is returned
  }

  var test = new GlideRecord('sys_script_include');
  test.sys_scope = getCurrentScope(glide_record);
  test.script = script;

  gse = new GlideScopedEvaluator();
  return gse.evaluateScript(test, 'script');
};


/*************************
  SUITE
 *************************/
snd_Spoke.Suite = function (options) {
  this.disabled = !!options.disabled;
  this.children = [];
  this.description = options.description;
  this.parent_suite = options.parent_suite;
  this.id = options.id;
  this.tree_only = !!options.tree_only;

  this.result = {
    id: this.id,
    description: this.description,
    fullName: this.getFullName(),
    failed_expectations: [],
    status: ''
  };
};
snd_Spoke.Suite.prototype = {
  type: 'snd_Spoke.Suite',
  disable: function () {
    this.disabled = true;
  },
  addChild: function (child) {
    this.children.push(child);
  },
  getFullName: function () {
    var fullName = this.description,
        parent_suite = this.parent_suite;

    for (parent_suite; parent_suite; parent_suite = parent_suite.parent_suite) {
      if (parent_suite.parent_suite) {
        fullName = parent_suite.description + ' ' + fullName;
      }
    }

    return fullName;
  },
  expect: function (actual) {
    return snd_Spoke.Expectation.Factory({
      util: snd_Spoke.matchersUtil,
      actual: actual,
      spec: this
    });
  },
  execute: function (options, parent_enabled) {
    var children = this.children,
        child,
        i;

    if (arguments.length == 1) parent_enabled = true;

    if (!this.tree_only) {
      options.reporter.suiteStarted(this.result);
      options.env.currently_executing_suites.push(this);
    }

    for (i = 0; i < children.length; i++) {
      children[i].execute(options, parent_enabled && !this.disabled);
    }

    if (!this.tree_only) {
      this.result.status = this.status();
      options.reporter.suiteDone(this.result);
      options.env.currently_executing_suites.pop();
    }
  },
  status: function () {
    if (this.disabled) {
      return 'disabled';
    }
    return this.result.failed_expectations.length > 0 ? 'failed' : 'finished';
  }
};

/*************************
  SPEC
 *************************/
snd_Spoke.Spec = function (options) {
  this.description = options.description;
  this.fn = options.fn;
  this.userContext = options.userContext || function () { return {}; };
  this.markedPending = false;
  this.getSpecName = options.getSpecName || function () { return ''; };

  this.result = {
    id: this.id,
    description: this.description,
    fullName: this.getFullName(),
    failed_expectations: [],
    passed_expectations: [],
    pendingReason: ''
  };

  if (!options.fn) {
    this.pend();
  }
};
snd_Spoke.Spec.pendingSpecExceptionMessage = '=> marked Pending';
snd_Spoke.Spec.prototype = {
  type: 'snd_Spoke.Spec',
  expect: function (actual) {
    var self = this;
    return snd_Spoke.Expectation.Factory({
      util: snd_Spoke.matchersUtil,
      actual: actual,
      spec: this,
      addExpectationResult: function (passed, result) {
        self.addExpectationResult(passed, result);
      }
    });
  },
  getFullName: function () {
    return this.getSpecName(this);
  },
  pend: function (message) {
    this.markedPending = true;
    if (message) {
      this.result.pendingReason = message;
    }
  },
  execute: function (options, parent_enabled) {

    options.reporter.specStarted(this.result);
    options.env.current_spec = this;

    if (!parent_enabled) {
      this.pend();
    }

    if (!this.markedPending) {
      try {
        this.fn.apply(this.userContext());
      } catch (e) {
        if (e && e.toString && e.toString().indexOf(snd_Spoke.Spec.pendingSpecExceptionMessage) !== -1) {
          e = e.toString().
          e = e.substr(e.indexOf(snd_Spoke.Spec.pendingSpecExceptionMessage) +
              snd_Spoke.Spec.pendingSpecExceptionMessage.length);
          this.pend(e);
          this.result.failed_expectations = [];
        } else {
          this.addExpectationResult(false, {
            matcherName: '',
            passed: false,
            message: '',
            error: '' + e
          });
        }
      }
    }

    this.result.status = this.status();
    options.reporter.specDone(this.result);
    options.env.current_spec = null;

  },
  addExpectationResult: function (passed, data, isError) {
    var result;

    data = data || {};
    data.passed = passed;
    result = snd_Spoke.Expectation.buildResult(data);

    if (passed) {
      this.result.passed_expectations.push(result);
    } else {
      this.result.failed_expectations.push(result);
    }
  },
  status: function () {
    if (this.disabled) {
      return 'disabled';
    }
    if (this.markedPending) {
      return 'pending';
    }
    if (this.result.failed_expectations.length > 0) {
      return 'failed';
    }
    return 'passed';
  }
};

/*************************
  EXPECTATION
 *************************/
snd_Spoke.Expectation = function (options) {
  this.util = options.util || { buildFailureMessage: function() {} };
  this.customEqualityTesters = options.customEqualityTesters || [];
  this.actual = options.actual;
  this.addExpectationResult = options.addExpectationResult || function(){};
  this.isNot = options.isNot;

  var customMatchers = options.customMatchers || {};
  for (var matcherName in customMatchers) {
    this[matcherName] = Expectation.prototype.wrapCompare(matcherName, customMatchers[matcherName]);
  }
};
snd_Spoke.Expectation.prototype.wrapCompare = function (name, matcherFactory) {
  return function() {
    var args = Array.prototype.slice.call(arguments, 0),
      expected = args.slice(0),
      message = '';

    args.unshift(this.actual);

    var matcher = matcherFactory(this.util, this.customEqualityTesters),
        matcherCompare = matcher.compare;

    function defaultNegativeCompare() {
      var result = matcher.compare.apply(null, args);
      result.pass = !result.pass;
      return result;
    }

    if (this.isNot) {
      matcherCompare = matcher.negativeCompare || defaultNegativeCompare;
    }

    var result = matcherCompare.apply(null, args);

    if (!result.pass) {
      if (!result.message) {
        args.unshift(this.isNot);
        args.unshift(name);
        message = this.util.buildFailureMessage.apply(null, args);
      } else {
        if (Object.prototype.toString.apply(result.message) === '[object Function]') {
          message = result.message();
        } else {
          message = result.message;
        }
      }
    }

    if (expected.length == 1) {
      expected = expected[0];
    }

    this.addExpectationResult(
      result.pass,
      {
        matcherName: name,
        passed: result.pass,
        message: message,
        actual: this.actual,
        expected: expected
      }
    );
  };
};
snd_Spoke.Expectation.Factory = function (options) {
  var expect;

  options = options || {};
  expect = new snd_Spoke.Expectation(options);

  options.isNot = true;
  expect.not = new snd_Spoke.Expectation(options);

  return expect;
};
snd_Spoke.Expectation.buildResult = function (options) {
  var result = {
    matcherName: options.matcherName,
    passed: options.passed
  };

  if (!result.passed) {
    result.expected = options.expected;
    result.actual = options.actual;
    result.message = options.message || options.error || '';
  } else {
    result.message = 'Passed.';
  }

  return result;
};
snd_Spoke.Expectation.addCoreMatchers = function (matchers) {
  var prototype = snd_Spoke.Expectation.prototype,
      name;
  for (name in matchers) {
    prototype[name] = prototype.wrapCompare(name, matchers[name]);
  }
};
snd_Spoke.Expectation.addCoreMatchers({
  toBe: function () {
    return {
      compare: function(actual, expected) {
        return {
          pass: actual === expected
        };
      }
    };
  },
  toBeCloseTo: function () {
    return {
      compare: function(actual, expected, precision) {
        if (precision !== 0) {
          precision = precision || 2;
        }
        return {
          pass: Math.abs(expected - actual) < (Math.pow(10, -precision) / 2)
        };
      }
    };
  },
  toBeDefined: function() {
    return {
      compare: function(actual) {
        return {
          pass: (void 0 !== actual)
        };
      }
    };
  },
  toBeFalsy: function() {
    return {
      compare: function(actual) {
        return {
          pass: !!!actual
        };
      }
    };
  },
  toBeGreaterThan: function() {
    return {
      compare: function(actual, expected) {
        return {
          pass: actual > expected
        };
      }
    };
  },
  toBeLessThan: function() {
    return {
      compare: function(actual, expected) {
        return {
          pass: actual < expected
        };
      }
    };
  },
  toBeNaN: function() {
    return {
      compare: function(actual) {
        var result = {
          pass: (actual !== actual)
        };

        if (result.pass) {
          result.message = 'Expected actual not to be NaN.';
        } else {
          result.message = function() { return 'Expected ' + snd_Spoke.prettyPrint(actual) + ' to be NaN.'; };
        }

        return result;
      }
    };
  },
  toBeNull: function() {
    return {
      compare: function(actual) {
        return {
          pass: actual === null
        };
      }
    };
  },
  toBeTruthy: function() {
    return {
      compare: function(actual) {
        return {
          pass: !!actual
        };
      }
    };
  },
  toBeUndefined: function() {
    return {
      compare: function(actual) {
        return {
          pass: void 0 === actual
        };
      }
    };
  },
  toContain: function (util, customEqualityTesters) {
    customEqualityTesters = customEqualityTesters || [];
    return {
      compare: function(actual, expected) {
        return {
          pass: util.contains(actual, expected, customEqualityTesters)
        };
      }
    };
  },
  toEqual: function (util, customEqualityTesters) {
    customEqualityTesters = customEqualityTesters || [];
    return {
      compare: function(actual, expected) {
        var result = {
          pass: false
        };
        result.pass = util.equals(actual, expected, customEqualityTesters);
        return result;
      }
    };
  },
  toMatch: function() {
    return {
      compare: function(actual, expected) {
        if (!snd_Spoke.isString_(expected) && !snd_Spoke.isA_('RegExp', expected) && !snd_Spoke.isA_('SNRegExp', expected)) {
          throw new Error('Expected is not a String, RegExp or SNRegExp');
        }
        var regexp = new RegExp(expected);
        return {
          pass: regexp.test(actual)
        };
      }
    };
  },
  toThrow: function (util) {
    return {
      compare: function(actual, expected) {
        var result = { pass: false },
          threw = false,
          thrown;

        if (typeof actual != 'function') {
          throw new Error('Actual is not a Function');
        }

        try {
          actual();
        } catch (e) {
          threw = true;
          thrown = e;
        }

        if (!threw) {
          result.message = 'Expected function to throw an exception.';
          return result;
        }

        if (arguments.length == 1) {
          result.pass = true;
          result.message = function() {
            return 'Expected function not to throw, but it threw ' +
                snd_Spoke.prettyPrint(thrown) + '.';
          };

          return result;
        }

        if (util.equals(thrown, expected)) {
          result.pass = true;
          result.message = function() {
            return 'Expected function not to throw ' +
                snd_Spoke.prettyPrint(expected) + '.';
          };
        } else {
          result.message = function() {
            return 'Expected function to throw ' +
                snd_Spoke.prettyPrint(expected) + ', but it threw ' +
                snd_Spoke.prettyPrint(thrown) + '.';
          };
        }

        return result;
      }
    };
  },
  toThrowError: function (util) {

    function getMatcher() {
      var expected = null,
          errorType = null;

      if (arguments.length == 2) {
        expected = arguments[1];
        if (isAnErrorType(expected)) {
          errorType = expected;
          expected = null;
        }
      } else if (arguments.length > 2) {
        errorType = arguments[1];
        expected = arguments[2];
        if (!isAnErrorType(errorType)) {
          throw new Error('Expected error type is not an Error.');
        }
      }

      if (expected && !isStringOrRegExp(expected)) {
        if (errorType) {
          throw new Error('Expected error message is not a string or RegExp.');
        } else {
          throw new Error('Expected is not an Error, string, or RegExp.');
        }
      }

      function messageMatch(message) {
        if (typeof expected == 'string') {
          return expected == message;
        } else {
          return expected.test(message);
        }
      }

      return {
        errorTypeDescription: errorType ? snd_Spoke.fnNameFor(errorType) : 'an exception',
        thrownDescription: function(thrown) {
          var thrownName = errorType ? snd_Spoke.fnNameFor(thrown.constructor) : 'an exception',
              thrownMessage = '';

          if (expected) {
            thrownMessage = ' with message ' + snd_Spoke.prettyPrint(thrown.message);
          }

          return thrownName + thrownMessage;
        },
        messageDescription: function() {
          if (expected === null) {
            return '';
          } else if (expected instanceof RegExp) {
            return ' with a message matching ' + snd_Spoke.prettyPrint(expected);
          } else {
            return ' with message ' + snd_Spoke.prettyPrint(expected);
          }
        },
        hasNoSpecifics: function() {
          return expected === null && errorType === null;
        },
        matches: function(error) {
          return (errorType === null || error instanceof errorType) &&
            (expected === null || messageMatch(error.message));
        }
      };
    }

    function isStringOrRegExp(potential) {
      return potential instanceof RegExp || (typeof potential == 'string');
    }

    function isAnErrorType(type) {
      if (typeof type !== 'function') {
        return false;
      }

      var Surrogate = function() {};
      Surrogate.prototype = type.prototype;
      return (new Surrogate()) instanceof Error;
    }

    return {
      compare: function(actual) {
        var threw = false,
          pass = {pass: true},
          fail = {pass: false},
          thrown;

        if (!snd_Spoke.isA_('Function', actual)) {
          throw new Error('Actual is not a Function');
        }

        var errorMatcher = getMatcher.apply(null, arguments);

        try {
          actual();
        } catch (e) {
          threw = true;
          thrown = e;
        }

        if (!threw) {
          fail.message = 'Expected function to throw an Error.';
          return fail;
        }

        if (!(thrown instanceof Error)) {
          fail.message = function() { return 'Expected function to throw an Error, but it threw ' +
              snd_Spoke.prettyPrint(thrown) + '.'; };
          return fail;
        }

        if (errorMatcher.hasNoSpecifics()) {
          pass.message = 'Expected function not to throw an Error, but it threw ' +
              snd_Spoke.fnNameFor(thrown) + '.';
          return pass;
        }

        if (errorMatcher.matches(thrown)) {
          pass.message = function() {
            return 'Expected function not to throw ' + errorMatcher.errorTypeDescription +
                errorMatcher.messageDescription() + '.';
          };
          return pass;
        } else {
          fail.message = function() {
            return 'Expected function to throw ' + errorMatcher.errorTypeDescription +
                errorMatcher.messageDescription() +
                ', but it threw ' + errorMatcher.thrownDescription(thrown) + '.';
          };
          return fail;
        }
      }
    };
  }
});

/*************************
  PRETTY PRINTER
 *************************/
snd_Spoke.PrettyPrinter = function () {

};
snd_Spoke.PrettyPrinter.prototype = {
  type: 'snd_Spoke.PrettyPrinter',
  format: function (value) {
    var type = Object.prototype.toString.apply(value);
    try {
      if (value === void 0) {
        return 'undefined';
      } else if (value === null) {
        return 'null';
      } else if (value === 0 && 1/value === -Infinity) {
        return '-0';
      } else if (value === global) {
        return '<$global>';
      } else if (value instanceof Date) {
        return 'Date(' + value + ')';
      } else if (value.toString) {
        return '' + value;
      } else if (type == '[object Function]') {
        return 'Function';
      } else if (type == '[object String]' || type == '[object Number]') {
        return '' + value;
      } else if (type == '[object Array]') {
        return 'Array';
      } else {
        return type;
      }
    } catch (e) {
      return '<$error: ' + e + '>';
    }
  }
};
snd_Spoke.prettyPrint = function (value) {
  var printer = new snd_Spoke.PrettyPrinter();
  return printer.format(value);
};

snd_Spoke.matchersUtil = (function() {

  function isAsymmetric(obj) {
    return obj && snd_Spoke.isA_('Function', obj.asymmetricMatch);
  }

  function asymmetricMatch(a, b) {
    var asymmetricA = isAsymmetric(a),
        asymmetricB = isAsymmetric(b);

    if (asymmetricA && asymmetricB) {
      return undefined;
    }

    if (asymmetricA) {
      return a.asymmetricMatch(b);
    }

    if (asymmetricB) {
      return b.asymmetricMatch(a);
    }
  }

  // Equality function lovingly adapted from isEqual in
  //   [Underscore](http://underscorejs.org)
  function eq(a, b, aStack, bStack, customTesters) {

    function has(obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    }

    function isFunction(obj) {
      return typeof obj === 'function';
    }

    var result = true;

    var asymmetricResult = asymmetricMatch(a, b);
    if (asymmetricResult !== void 0) {
      return asymmetricResult;
    }

    for (var i = 0; i < customTesters.length; i++) {
      var customTesterResult = customTesters[i](a, b);
      if (customTesterResult !== void 0) {
        return customTesterResult;
      }
    }

    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) { return a !== 0 || 1 / a == 1 / b; }

    // A strict comparison is necessary because `null == undefined`.
    if (a === null || b === null) { return a === b; }

    // undefined cannot be compared using instanceof in ServiceNow
    if (a === undefined || b === undefined) { return a === b; }

    if (a instanceof Error && b instanceof Error) {
      return a.message == b.message;
    }

    var className = Object.prototype.toString.call(a);
    if (className != Object.prototype.toString.call(b)) { return false; }
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `'5'` is
        // equivalent to `new String('5')`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a === 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
          a.global == b.global &&
          a.multiline == b.multiline &&
          a.ignoreCase == b.ignoreCase;
    }

    if (typeof a != 'object' || typeof b != 'object') { return false; }

    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) { return bStack[length] == b; }
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0;
    // Recursively compare objects and arrays.
    // Compare array lengths to determine if a deep comparison is necessary.
    if (className == '[object Array]' && a.length !== b.length) {
      result = false;
    }

    if (result) {
      // Objects with different constructors are not equivalent, but `Object`s
      // or `Array`s from different frames are.
      if (className !== '[object Array]') {
        var aCtor = a.constructor, bCtor = b.constructor;
        if (aCtor !== bCtor && !(isFunction(aCtor) && aCtor instanceof aCtor &&
               isFunction(bCtor) && bCtor instanceof bCtor)) {
          return false;
        }
      }
      // Deep compare objects.
      for (var key in a) {
        if (has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = has(b, key) && eq(a[key], b[key], aStack, bStack, customTesters))) { break; }
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (has(b, key) && !(size--)) { break; }
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();

    return result;
  }

  return {
    equals: function(a, b, customTesters) {
      customTesters = customTesters || [];

      return eq(a, b, [], [], customTesters);
    },

    contains: function(haystack, needle, customTesters) {
      customTesters = customTesters || [];

      if ((Object.prototype.toString.apply(haystack) === '[object Array]') ||
        (!!haystack && !haystack.indexOf))
      {
        for (var i = 0; i < haystack.length; i++) {
          if (eq(haystack[i], needle, [], [], customTesters)) {
            return true;
          }
        }
        return false;
      }

      return !!haystack && haystack.indexOf(needle) >= 0;
    },

    buildFailureMessage: function() {
      var args = Array.prototype.slice.call(arguments, 0),
        matcherName = args[0],
        isNot = args[1],
        actual = args[2],
        expected = args.slice(3),
        englishyPredicate = matcherName.replace(/[A-Z]/g, function(s) { return ' ' + s.toLowerCase(); });

      var message = 'Expected ' +
        snd_Spoke.prettyPrint(actual) +
        (isNot ? ' not ' : ' ') +
        englishyPredicate;

      if (expected.length > 0) {
        for (var i = 0; i < expected.length; i++) {
          if (i > 0) {
            message += ',';
          }
          message += ' ' + snd_Spoke.prettyPrint(expected[i]);
        }
      }

      return message + '.';
    }
  };

})();

/*************************
  UTILITY
 *************************/
snd_Spoke.util = {
  type: 'snd_Spoke.util',
  inherit: function (childClass, parentClass) {
    var Subclass = function() {};
    Subclass.prototype = parentClass.prototype;
    childClass.prototype = new Subclass();
  },
  htmlEscape: function (str) {
    if (!str) {
      return str;
    }
    return str.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  },
  isUndefined: function (obj) {
    return obj === void 0;
  },
  arrayContains: function (array, search) {
    var i = array.length;
    while (i--) {
      if (array[i] === search) {
        return true;
      }
    }
    return false;
  },
  clone: function (obj) {
    if (Object.prototype.toString.apply(obj) === '[object Array]') {
      return obj.slice();
    }

    var cloned = {};
    for (var prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        cloned[prop] = obj[prop];
      }
    }

    return cloned;
  },
  contains: function (haystack, needle) {
    if ((Object.prototype.toString.apply(haystack) === '[object Array]') ||
        (!!haystack && !haystack.indexOf))
      {
        for (var i = 0; i < haystack.length; i++) {
          if (snd_Spoke.util.equals(haystack[i], needle)) {
            return true;
          }
        }
        return false;
      }

      return !!haystack && haystack.indexOf(needle) >= 0;
  },
  equals: function (actual, expected) {
    // deep recursive equality check
    return actual === expected;
  }
};

/*************************
  REPORTER
 *************************/
snd_Spoke.Reporter = function () {

  var reporter = {
    result_log: [],
    current: null,
    tree: null,
    parent: null,
    parent_hash: {},
    total_specs: 0,
    failed_specs: 0,
    status: 'loaded'
  };

  reporter.addNode = function (type, result) {

    var n = {
      type: type,
      id: result.id || '',
      description: result.description || '',
      status: result.status || ''
    };

    this.parent = this.current;
    this.current = n;

    if (this.parent) {
      if (!this.parent.hasOwnProperty('children')) {
        this.parent.children = [];
      }
      this.parent.children.push(this.current);
      this.parent_hash[this.current.id] = this.parent;
    }

    return n;
  };

  reporter.addFailedExpectations = function (failed_expectations) {
    if (!this.current.hasOwnProperty('failed_expectations')) {
      this.current.failed_expectations = [];
    }

  }

  // we do this because storing the parent on the node along with the children
  // causes a Stack Overflow
  reporter.getParent = function (node) {
    return this.parent_hash[node.id];
  };

  reporter.exitNode = function (result) {

    this.current.status = result.status;
    if (result.pendingReason) {
      this.current.pendingReason = result.pendingReason;
    }

    if (result.failed_expectations && result.failed_expectations.length) {
      if (!this.current.hasOwnProperty('failed_expectations')) {
        this.current.failed_expectations = [];
      }
      for(var i = 0; i < result.failed_expectations.length; i++) {
        this.current.failed_expectations.push(result.failed_expectations[i].message);
      }
    }

    this.current = this.parent;
    this.parent = this.getParent(this.current);
  };

  reporter.tree = reporter.current = reporter.addNode('suite', {
    id: 'root',
    description: 'Root Suite'
  });

  reporter.start = function (suiteInfo) {
    this.result_log.push('Running suite with ' + suiteInfo.total_specs_defined + ' specs.');
    this.started = true;
    this.status = 'started';
    this.total_specs = suiteInfo.total_specs_defined;
  };

  reporter.done = function () {
    this.result_log.push('Finished suite.');
    this.finished = true;
    this.status = 'finished';
  };

  reporter.suiteStarted = function (result) {
    this.result_log.push('Suite started: ' + result.description);
    this.addNode('suite', result);
  };

  reporter.suiteDone = function (result) {
    this.result_log.push('Suite: ' + result.description + ' was ' + result.status + '.');
    this.exitNode(result);
  };

  reporter.specStarted = function (result) {
    this.result_log.push('Spec started: ' + result.description);
    this.addNode('spec', result);
  };

  reporter.specDone = function (result) {
    this.result_log.push('Spec done: ' + result.description + ' ' +
        (!result.failed_expectations.length ? 'passed' : 'failed'));
    this.failed_specs += result.failed_expectations.length;
    this.exitNode(result);
  };

  return reporter;
};