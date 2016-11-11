/*!
  Spoke - A lightweight Jasmine test framework for ServiceNow
  Contribute at github.com/sn-developer/Spoke
  james@sndeveloper.com
*/
var snd_Spoke = function () {

  this.totalSpecsDefined = 0;

  this.$catchExceptions = true;

  this.runnableLookupTable = {};
  this.runnableResources = {};

  this.currentSpec = null;
  this.currentlyExecutingSuites = [];
  this.currentDeclarationSuite = null;
  this.$throwOnExpectationFailure = false;

  this.nextSuiteId = 0;
  this.nextSpecId = 0;

  /*this.topSuite = new snd_Spoke.Suite({
    env: this,
    id: this.getNextSuiteId(),
    description: 'Spoke__TopLevel__Suite',
    queueRunner: this.queueRunnerFactory
  });
  this.runnableLookupTable[this.topSuite.id] = this.topSuite;*/

  this.topSuite = this.suiteFactory('Spoke__TopLevel__Suite');

  this.defaultResourcesForRunnable(this.topSuite.id);
  this.currentDeclarationSuite = this.topSuite;

  this.reporter = new snd_Spoke.Reporter();
  this.exceptionFormatter = snd_Spoke.exceptionFormatter;

  this.currentSpecCallbackDepth = 0;
  this.maximumSpecCallbackDepth = 20;
};

snd_Spoke.DEFAULT_TIMEOUT_INTERVAL = 5000;

snd_Spoke.prototype = {
  type: 'snd_Spoke',

  currentSuite: function () {
    return this.currentlyExecutingSuites[this.currentlyExecutingSuites.length - 1];
  },

  currentRunnable: function () {
    return this.currentSpec || this.currentSuite();
  },

  specFilter: function () {
    return true;
  },

  addCustomEqualityTester: function (tester) {
    var runnable = this.currentRunnable();
    if(!runnable) {
      throw new Error('Custom Equalities must be added in a before function or a spec');
    }
    this.runnableResources[runnable.id].customEqualityTesters.push(tester);
  },

  addMatchers: function (matchersToAdd) {
    var runnable = this.currentRunnable();
    if(!runnable) {
      throw new Error('Matchers must be added in a before function or a spec');
    }
    var customMatchers = this.runnableResources[runnable.id].customMatchers;
    for (var matcherName in matchersToAdd) {
      customMatchers[matcherName] = matchersToAdd[matcherName];
    }
  },

  defaultResourcesForRunnable: function (id, parentRunnableId) {
    var resources = {spies: [], customEqualityTesters: [], customMatchers: {}};

    if(this.runnableResources[parentRunnableId]){
      resources.customEqualityTesters = snd_Spoke.util
          .clone(this.runnableResources[parentRunnableId].customEqualityTesters);
      resources.customMatchers = snd_Spoke.util
          .clone(this.runnableResources[parentRunnableId].customMatchers);
    }

    this.runnableResources[id] = resources;
  },

  clearResourcesForRunnable: function (id) {
    //this.spyRegistry.clearSpies();
    delete this.runnableResources[id];
  },

  beforeAndAfterFns: function (suite) {
    return function() {
      var befores = [],
        afters = [];

      while (suite) {
        befores = befores.concat(suite.beforeFns);
        afters = afters.concat(suite.afterFns);

        suite = suite.parentSuite;
      }

      return {
        befores: befores.reverse(),
        afters: afters
      };
    };
  },

  catchException: function (e) {
    return snd_Spoke.Spec.isPendingSpecException(e) || this.$catchExceptions;
  },

  catchExceptions: function (value) {
    this.$catchExceptions = !!value;
    return this.$catchExceptions;
  },

  catchingExceptions: function () {
    return this.$catchExceptions;
  },

  // This function seems to be pretty useless in the ServiceNow environment.
  // It looks like it relies on using setTimeout to counter the fact it could
  // have an insane depth.
  // The fn that is passed in is the onComplete runner for the next queueableFn,
  // which means it just dives down deeper and deeper as each queueableFn calls
  // the next from within itself. Presumably this is only an issue in ServiceNow.
  // I've edited the QueueRunner so it no longer uses the attemptAsync function.
  clearStack: function (fn) {
    this.currentSpecCallbackDepth++;
    if (this.currentSpecCallbackDepth >= this.maximumSpecCallbackDepth) {
      this.currentSpecCallbackDepth = 0;
      //realSetTimeout(fn, 0); // no setTimeout function in ServiceNow
      fn();
    } else {
      fn();
    }
  },

  throwOnExpectationFailure: function(value) {
    this.$throwOnExpectationFailure = !!value;
  },

  throwingExpectationFailures: function() {
    return this.$throwOnExpectationFailure;
  },

  execute: function (runnablesToRun) {
    var self = this;

    if (!runnablesToRun) {
      runnablesToRun = [this.topSuite.id];
    }

    var processor = new snd_Spoke.TreeProcessor({
      tree: this.topSuite,
      runnableIds: runnablesToRun,
      queueRunnerFactory: snd_Spoke._bind(this, this.queueRunnerFactory),
      nodeStart: function (suite) {
        self.currentlyExecutingSuites.push(suite);
        self.defaultResourcesForRunnable(suite.id, suite.parentSuite.id);
        self.reporter.suiteStarted(suite.result);
      },
      nodeComplete: function (suite, result) {
        if (!suite.disabled) {
          self.clearResourcesForRunnable(suite.id);
        }
        self.currentlyExecutingSuites.pop();
        self.reporter.suiteDone(result);
      }
    });

    if (!processor.processTree().valid) {
      throw new Error('Invalid order: would cause a beforeAll or afterAll to be run multiple times');
    }

    this.reporter.start({
      totalSpecsDefined: this.totalSpecsDefined
    });

    processor.execute(function () {
      self.reporter.done.apply(self.reporter, arguments);
    });

    return this.reporter;
  },

  getNextSuiteId: function () {
    return 'suite' + this.nextSuiteId++;
  },

  getNextSpecId:  function () {
    return 'spec' + this.nextSpecId++;
  },

  addSpecsToSuite: function (suite, spec_definitions) {
    var parentSuite = this.currentDeclarationSuite;
    parentSuite.addChild(suite);
    this.currentDeclarationSuite = suite;

    var declaration_error = null;
    try {
      if (spec_definitions) {
        spec_definitions.call(suite);
      }
    } catch (e) {
      declaration_error = e;
    }

    if (declaration_error !== null) {
      this.it('encountered a declaration exception', function () {
        throw declaration_error;
      });
    }

    this.currentDeclarationSuite = parentSuite;
  },

  updateEnv: function (env) {
    var self = this;
    env.describe = function () {
      return self.describe.apply(self, arguments);
    };
    env.xdescribe = function () {
      return self.xdescribe.apply(self, arguments);
    };
    env.it = function () {
      return self.it.apply(self, arguments);
    };
    env.xit = function () {
      return self.xit.apply(self, arguments);
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

  describe: function (description, specDefinitions) {
    var suite = this.suiteFactory(description);
    this.addSpecsToSuite(suite, specDefinitions);
    return suite;
  },

  xdescribe: function (description, specDefinitions) {
    var suite = this.describe(description, specDefinitions);
    suite.disable();
    return suite;
  },

  it: function (description, fn, timeout) {
    var spec = this.specFactory(description, fn, this.currentDeclarationSuite, timeout);
    this.currentDeclarationSuite.addChild(spec);
    return spec;
  },

  xit: function () {
    var spec = this.it.apply(this, arguments);
    spec.pend();
    return spec;
  },

  expect: function (actual) {
    var runnable = this.currentRunnable();
    if (!runnable) {
      throw new Error('\'expect\' was used when there was no current spec');
    }
    return this.currentRunnable().expect(actual);
  },

  beforeEach: function (beforeEachFunction, timeout) {
    this.currentDeclarationSuite.beforeEach({
      fn: beforeEachFunction,
      timeout: function() { return timeout || snd_Spoke.DEFAULT_TIMEOUT_INTERVAL; }
    });
  },

  beforeAll: function (beforeAllFunction, timeout) {
    this.currentDeclarationSuite.beforeAll({
      fn: beforeAllFunction,
      timeout: function() { return timeout || snd_Spoke.DEFAULT_TIMEOUT_INTERVAL; }
    });
  },

  afterEach: function (afterEachFunction, timeout) {
    this.currentDeclarationSuite.afterEach({
      fn: afterEachFunction,
      timeout: function() { return timeout || snd_Spoke.DEFAULT_TIMEOUT_INTERVAL; }
    });
  },

  afterAll: function (afterAllFunction, timeout) {
    this.currentDeclarationSuite.afterAll({
      fn: afterAllFunction,
      timeout: function() { return timeout || snd_Spoke.DEFAULT_TIMEOUT_INTERVAL; }
    });
  },

  pending: function (message) {
    var fullMessage = snd_Spoke.Spec.pendingSpecExceptionMessage;
    if(message) {
      fullMessage += message;
    }
    throw fullMessage;
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

  //============================================================================
  // Factories
  //============================================================================

  suiteFactory: function (description) {
    var suite = new snd_Spoke.Suite({
      env: this,
      id: this.getNextSuiteId(),
      description: description,
      parentSuite: this.currentDeclarationSuite,
      expectationFactory: snd_Spoke._bind(this, this.expectationFactory),
      expectationResultFactory: snd_Spoke._bind(this, this.expectationResultFactory),
      throwOnExpectationFailure: this.$throwOnExpectationFailure
    });

    this.runnableLookupTable[suite.id] = suite;
    return suite;
  },

  specFactory: function (description, fn, suite, timeout) {
    var self = this;
    this.totalSpecsDefined++;
    var spec = new snd_Spoke.Spec({
      id: this.getNextSpecId(),
      beforeAndAfterFns: this.beforeAndAfterFns(suite),
      expectationFactory: snd_Spoke._bind(this, this.expectationFactory),
      resultCallback: specResultCallback,
      getSpecName: function (spec) {
        return snd_Spoke.getSpecName(spec, suite);
      },
      onStart: specStarted,
      description: description,
      expectationResultFactory: snd_Spoke._bind(this, this.expectationResultFactory),
      queueRunnerFactory: snd_Spoke._bind(this, this.queueRunnerFactory),
      userContext: function () { return suite.clonedSharedUserContext(); },
      queueableFn: {
        fn: fn,
        timeout: function () { return timeout || snd_Spoke.DEFAULT_TIMEOUT_INTERVAL; }
      },
      throwOnExpectationFailure: this.$throwOnExpectationFailure
    });

    this.runnableLookupTable[spec.id] = spec;

    if (!this.specFilter(spec)) {
      spec.disable();
    }

    return spec;

    function specStarted(spec) {
      self.currentSpec = spec;
      self.defaultResourcesForRunnable(spec.id, suite.id);
      self.reporter.specStarted(spec.result);
    }

    function specResultCallback(result) {
      self.clearResourcesForRunnable(spec.id);
      self.currentSpec = null;
      self.reporter.specDone(result);
    }
  },

  expectationFactory: function (actual, spec) {
    var cet = this.runnableResources[spec.id].customEqualityTesters;
    var cm = this.runnableResources[spec.id].customMatchers;
    return snd_Spoke.Expectation.Factory({
      util: snd_Spoke.matchersUtil,
      customEqualityTesters: cet,
      customMatchers: cm,
      actual: actual,
      addExpectationResult: addExpectationResult
    });

    function addExpectationResult(passed, result) {
      return spec.addExpectationResult(passed, result);
    }
  },

  expectationResultFactory: function (attrs) {
    attrs.messageFormatter = this.exceptionFormatter.formatMessage;
    attrs.stackFormatter = this.exceptionFormatter.formatStack;

    return snd_Spoke.buildExpectationResult(attrs);
  },

  queueRunnerFactory: function (options) {
    options.catchException = snd_Spoke._bind(this, this.catchException);
    options.clearStack = options.clearStack || snd_Spoke._bind(this, this.clearStack);

    // ServiceNow does not support setTimeout or clearTimeout functions.
    //options.timeout = {setTimeout: realSetTimeout, clearTimeout: realClearTimeout};

    options.fail = this.fail;

    new snd_Spoke.QueueRunner(options).execute();
  }

};

//==============================================================================
// Built-in utilities
//==============================================================================

snd_Spoke.getSpecName = function (spec, suite) {
  return suite.getFullName() + ' ' + spec.description;
};

snd_Spoke.buildExpectationResult = function (options) {
  var messageFormatter = options.messageFormatter || function () {},
      stackFormatter = options.stackFormatter || function () {};

  var result = {
    matcherName: options.matcherName,
    message: message(),
    stack: stack(),
    passed: options.passed
  };

  if(!result.passed) {
    result.expected = options.expected;
    result.actual = options.actual;
  }

  return result;

  function message() {
    if (options.passed) {
      return 'Passed.';
    } else if (options.message) {
      return options.message;
    } else if (options.error) {
      return messageFormatter(options.error);
    }
    return '';
  }

  function stack() {
    if (options.passed) {
      return '';
    }

    var error = options.error;
    if (!error) {
      try {
        throw new Error(message());
      } catch (e) {
        error = e;
      }
    }
    return stackFormatter(error);
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

// Function bind polyfill.
// https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_objects/Function/bind
snd_Spoke._bind = function (oThis, fn) {
  return function () {
    return fn.apply(oThis, arguments);
  };
};

//==============================================================================
// Suite
//==============================================================================

snd_Spoke.Suite = function (attrs) {

  //this.env = attrs.env;
  this.id = attrs.id;
  this.parentSuite = attrs.parentSuite;
  this.description = attrs.description;
  this.expectationFactory = attrs.expectationFactory;
  this.expectationResultFactory = attrs.expectationResultFactory;
  this.throwOnExpectationFailure = !!attrs.throwOnExpectationFailure;

  this.beforeFns = [];
  this.afterFns = [];
  this.beforeAllFns = [];
  this.afterAllFns = [];
  this.disabled = !!attrs.disabled; //false;

  this.children = [];

  this.result = {
    id: this.id,
    description: this.description,
    fullName: this.getFullName(),
    failedExpectations: []
  };

};
snd_Spoke.Suite.prototype = {
  type: 'snd_Spoke.Suite',

  expect: function (actual) {
    return this.expectationFactory(actual, this);
  },

  getFullName: function () {
    var fullName = this.description;
    for (var parentSuite = this.parentSuite; parentSuite; parentSuite = parentSuite.parentSuite) {
      if (parentSuite.parentSuite) {
        fullName = parentSuite.description + ' ' + fullName;
      }
    }
    return fullName;
  },

  disable: function () {
    this.disabled = true;
  },

  beforeEach: function (fn) {
    this.beforeFns.unshift(fn);
  },

  beforeAll: function (fn) {
    this.beforeAllFns.push(fn);
  },

  afterEach: function (fn) {
    this.afterFns.unshift(fn);
  },

  afterAll: function (fn) {
    this.afterAllFns.push(fn);
  },

  addChild: function (child) {
    this.children.push(child);
  },

  status: function () {
    if (this.disabled) {
      return 'disabled';
    }
    return this.result.failedExpectations.length > 0 ? 'failed' : 'finished';
  },

  isExecutable: function () {
    return !this.disabled;
  },

  canBeReentered: function() {
    return this.beforeAllFns.length === 0 && this.afterAllFns.length === 0;
  },

  getResult: function () {
    this.result.status = this.status();
    return this.result;
  },

  sharedUserContext: function() {
    if (!this.sharedContext) {
      this.sharedContext = this.parentSuite ? this._clone(this.parentSuite.sharedUserContext()) : {};
    }
    return this.sharedContext;
  },

  clonedSharedUserContext: function() {
    return this._clone(this.sharedUserContext());
  },

  onException: function (error) {
    if (error instanceof snd_Spoke.errors.ExpectationFailed) {
      return;
    }

    if(this._isAfterAll(this.children)) {
      var data = {
        matcherName: '',
        passed: false,
        expected: '',
        actual: '',
        error: error
      };
      this.result.failedExpectations.push(this.expectationResultFactory(data));
    } else {
      for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i];
        child.onException.apply(child, arguments);
      }
    }
  },

  addExpectationResult: function (passed, data, isError) {
    if(this._isAfterAll(this.children) && this._isFailure(arguments)){
      this.result.failedExpectations.push(this.expectationResultFactory(data));
      if(this.throwOnExpectationFailure) {
        throw new snd_Spoke.errors.ExpectationFailed();
      }
    } else {
      for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i];
        try {
          child.addExpectationResult.apply(child, arguments);
        } catch(e) {
          // keep going
        }
      }
    }
  },

  _isAfterAll: function (children) {
    return children && children[0].result.status;
  },

  _isFailure: function (args) {
    return !args[0];
  },

  _clone: function (obj) {
    var clonedObj = {};
    for (var prop in obj) {
      if (obj.hasOwnProperty(prop)) {
        clonedObj[prop] = obj[prop];
      }
    }
    return clonedObj;
  }

};

//==============================================================================
// Specification
//==============================================================================

snd_Spoke.Spec = function (attrs) {
  this.expectationFactory = attrs.expectationFactory;
  this.resultCallback = attrs.resultCallback || function() {};
  this.id = attrs.id;
  this.description = attrs.description || '';
  this.queueableFn = attrs.queueableFn;
  this.beforeAndAfterFns = attrs.beforeAndAfterFns || function() { return {befores: [], afters: []}; };
  this.userContext = attrs.userContext || function() { return {}; };
  this.onStart = attrs.onStart || function() {};
  this.getSpecName = attrs.getSpecName || function() { return ''; };
  this.expectationResultFactory = attrs.expectationResultFactory || function() { };
  this.queueRunnerFactory = attrs.queueRunnerFactory || function() {};
  this.catchingExceptions = attrs.catchingExceptions || function() { return true; };
  this.throwOnExpectationFailure = !!attrs.throwOnExpectationFailure;

  if (!this.queueableFn.fn) {
    this.pend();
  }

  this.result = {
    id: this.id,
    description: this.description,
    fullName: this.getFullName(),
    failedExpectations: [],
    passedExpectations: [],
    pendingReason: ''
  };

};

snd_Spoke.Spec.pendingSpecExceptionMessage = '=> marked Pending';

snd_Spoke.Spec.prototype = {
  type: 'snd_Spoke.Spec',

  addExpectationResult: function (passed, data, isError) {
    var expectationResult = this.expectationResultFactory(data);
    if (passed) {
      this.result.passedExpectations.push(expectationResult);
    } else {
      this.result.failedExpectations.push(expectationResult);

      if (this.throwOnExpectationFailure && !isError) {
        throw new snd_Spoke.errors.ExpectationFailed();
      }
    }
  },

  expect: function (actual) {
    return this.expectationFactory(actual, this);
  },

  execute: function (onComplete, enabled) {

    function complete(enabledAgain) {
      self.result.status = self.status(enabledAgain);
      self.resultCallback(self.result);

      if (onComplete) {
        onComplete();
      }
    }

    var self = this;

    this.onStart(this);

    if (!this.isExecutable() || this.markedPending || enabled === false) {
      complete(enabled);
      return;
    }

    var fns = this.beforeAndAfterFns();
    var allFns = fns.befores.concat(this.queueableFn).concat(fns.afters);

    this.queueRunnerFactory({
      queueableFns: allFns,
      onException: function () { self.onException.apply(self, arguments); },
      onComplete: complete,
      userContext: this.userContext()
    });
  },

  onException: function onException(e) {
    if (snd_Spoke.Spec.isPendingSpecException(e)) {
      this.pend(snd_Spoke.Spec.extractCustomPendingMessage(e));
      return;
    }

    if (e instanceof snd_Spoke.errors.ExpectationFailed) {
      return;
    }

    this.addExpectationResult(false, {
      matcherName: '',
      passed: false,
      expected: '',
      actual: '',
      error: e
    }, true);
  },

  disable: function () {
    this.disabled = true;
  },

  pend: function (message) {
    this.markedPending = true;
    if (message) {
      this.result.pendingReason = message;
    }
  },

  getResult: function() {
    this.result.status = this.status();
    return this.result;
  },

  status: function (enabled) {
    if (this.disabled || enabled === false) {
      return 'disabled';
    }
    if (this.markedPending) {
      return 'pending';
    }
    if (this.result.failedExpectations.length > 0) {
      return 'failed';
    }
    return 'passed';
  },

  isExecutable: function () {
    return !this.disabled;
  },

  getFullName: function () {
    return this.getSpecName(this);
  }

};

snd_Spoke.Spec.extractCustomPendingMessage = function (e) {
  var fullMessage = e.toString(),
      boilerplateStart = fullMessage.indexOf(snd_Spoke.Spec.pendingSpecExceptionMessage),
      boilerplateEnd = boilerplateStart + snd_Spoke.Spec.pendingSpecExceptionMessage.length;

  return fullMessage.substr(boilerplateEnd);
};

snd_Spoke.Spec.isPendingSpecException = function (e) {
  return !!(e && e.toString !== void(0) && e.toString().indexOf(snd_Spoke.Spec.pendingSpecExceptionMessage) !== -1);
};

//==============================================================================
// Expectation
//==============================================================================

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
snd_Spoke.Expectation.prototype.type = 'snd_Spoke.Expectation';
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
      compare: function (actual, expected) {
        return {
          pass: actual === expected
        };
      }
    };
  },
  toBeCloseTo: function () {
    return {
      compare: function (actual, expected, precision) {
        if (precision !== 0) {
          precision = precision || 2;
        }
        return {
          pass: Math.abs(expected - actual) < (Math.pow(10, -precision) / 2)
        };
      }
    };
  },
  toBeDefined: function () {
    return {
      compare: function (actual) {
        return {
          pass: (void 0 !== actual)
        };
      }
    };
  },
  toBeFalsy: function () {
    return {
      compare: function (actual) {
        return {
          pass: !!!actual
        };
      }
    };
  },
  toBeGreaterThan: function () {
    return {
      compare: function (actual, expected) {
        return {
          pass: actual > expected
        };
      }
    };
  },
  toBeLessThan: function () {
    return {
      compare: function (actual, expected) {
        return {
          pass: actual < expected
        };
      }
    };
  },
  toBeLike: function () {
    return {
      compare: function (actual, expected) {
        return {
          pass: actual == expected
        };
      }
    };
  },
  toBeNaN: function () {
    return {
      compare: function (actual) {
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
  toBeNull: function () {
    return {
      compare: function(actual) {
        return {
          pass: actual === null
        };
      }
    };
  },
  toBeTruthy: function () {
    return {
      compare: function(actual) {
        return {
          pass: !!actual
        };
      }
    };
  },
  toBeUndefined: function () {
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
  toMatch: function () {
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

//==============================================================================
// Pretty printer
//==============================================================================

/*snd_Spoke.PrettyPrinter = function () {};
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
      } else if (type == '[object Function]') {
        return 'Function';
      } else if (type == '[object String]' || type == '[object Number]') {
        return '' + value;
      } else if (type == '[object Array]') {
        return 'Array';
      } else if (value.toString) {
        return '"' + value + '"';
      } else {
        return type;
      }
    } catch (e) {
      return '<$error: ' + e + '>';
    }
  }
};*/
snd_Spoke.PrettyPrinter = function () {
  this.is_browser = typeof window !== 'undefined';
  this.global = this.is_browser ? window : global;
  this.scope =  (function () { return this; })();
  this.not_str_regex = /^\[[a-zA-Z0-9_. ]+\]$|^[a-zA-Z0-9.]+@[a-z0-9]+$/;
};
snd_Spoke.PrettyPrinter.prototype.toString = function () {
  return '[object ' + this.type + ']';
};
snd_Spoke.PrettyPrinter.prototype = {

  type: 'snd_Spoke.PrettyPrinter',

  getType: function (obj) {
    return Object.prototype.toString.call(obj).slice(8, -1);
  },

  'String': function (obj) {
    obj = obj + '';

    // handle object types and memory references
    if (obj.match(this.not_str_regex)) {
      return obj;
    }

    return '"' + obj + '"';
  },

  'Boolean': function (obj) {
    return obj ? 'true' : 'false';
  },

  'Function': function (obj) {
    return '' + obj;
  },

  'Number': function (obj) {
    return '' + obj;
  },

  'Array': function (obj) {
    var str = [];
    for (var i = 0; i < obj.length; i++) {
      str.push(this.format(obj[i]));
    }
    return '[' + str.join(', ') + ']';
  },

  'SNRegExp': function (obj) {
    return obj.toString();
  },

  'GlideRecord': function (obj) {
    var type = this.getType(obj);
    var str = type + '(' + obj.getTableName();
    if (!obj.sys_id.nil()) {
      str += ':' + obj.sys_id;
      str += ':' + obj.getDisplayValue();
    }
    str += ')';
    return str;
  },

  format: function (obj) {
    var type = this.getType(obj);

    if (obj === null || obj === void 0) return '' + obj;

    if (this.is_browser) {
      return type in this ? this[type](obj) : '' + obj;
    }

    if (obj === this.global || type == 'global') {
      return '[global scope]';
    }

    if (obj === this.scope) {
      return '[' + type + ' scope]';
    }

    // handle native JavaScript objects which we know have a toString
    if (obj instanceof Function ||
        obj instanceof Object ||
        obj instanceof Array ||
        type == 'Number' ||
        type == 'Boolean' ||
        type == 'String' ||
        obj instanceof RegExp) {
      return type in this ? this[type](obj) : this.String(obj);
    }

    // Java objects can have the same type but break when calling toString
    // We would only get here if their instanceof did not match.
    if (type === 'Function' || type === 'Object') {
      return '';
    }

    // catch all
    try {
      return this.String(obj);
    } catch (e) {
      return '[object ' + type + ']';
    }
  }

};
snd_Spoke.prettyPrint = (function () {
  var pp = new snd_Spoke.PrettyPrinter();
  return function (value) { return pp.format(value); };
})();

//==============================================================================
// Matcher utility
//==============================================================================

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

//==============================================================================
// Utilities
//==============================================================================

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
    // TODO: deep recursive equality check
    return actual === expected;
  }
};

//==============================================================================
// Errors
//==============================================================================

snd_Spoke.errors = (function () {
  function ExpectationFailed() {}
  ExpectationFailed.prototype = new Error();
  ExpectationFailed.prototype.constructor = ExpectationFailed;

  return {
    ExpectationFailed: ExpectationFailed
  };
})();

//==============================================================================
// exceptionFormatter
//==============================================================================

snd_Spoke.exceptionFormatter = {};
snd_Spoke.exceptionFormatter.formatMessage = function(error) {
  var message = '';

  if (error.name && error.message) {
    message += error.name + ': ' + error.message;
  } else {
    message += error + ' thrown';
  }

  message += snd_Spoke.exceptionFormatter.getSource(error);

  return message;
};

snd_Spoke.exceptionFormatter.stack = function(error) {
  return error ? error.stack : null;
};

snd_Spoke.exceptionFormatter.getSource = function (error) {
  var result = '',
      test_line,
      found,
      match,
      line,
      gr;

  if (!error) { return ''; }

  // handle ServiceNow error
  if (error.sourceName) {
    match = error.sourceName.toString().match(/([a-z_]+)\.([0-9a-f]{32})/);
    if (match) {
      gr = new GlideRecord(match[1]);
      if (gr.isValid()) {
        gr.addQuery('sys_id', '=', match[2]);
        gr.setLimit(1);
        gr.query();
        if (gr.next()) {
          found = true;
          result = ' in ' + gr.getLabel() + ' ' + gr.getDisplayValue() + ' [' + match[1] + '.do?sys_id=' + match[2] + ']';
        }
      }
    }
  }

  // handle all other errors
  if (!found && (error.sourceName || error.fileName || error.sourceURL)) {
    result += ' in ' + (error.sourceName || error.fileName || error.sourceURL);
  }

  // get the line number - adjusting for Spoke running a compiled script with EXECUTE_LINE
  line = error.line || error.lineNumber;
  if (line) {
    test_line = found ? line : line - snd_Spoke.EXECUTE_LINE;
    result += ' (line ' + test_line;
    if (line != test_line) result += ' [' + line + ']';
    result += ')';
  }

  return result;
};

//==============================================================================
// Queue Runner
//==============================================================================

snd_Spoke.QueueRunner = function (attrs) {
  this.queueableFns = attrs.queueableFns || [];
  this.onComplete = attrs.onComplete || function () {};
  this.clearStack = attrs.clearStack || function (fn) {fn();};
  this.onException = attrs.onException || function () {};
  this.catchException = attrs.catchException || function () { return true; };
  this.userContext = attrs.userContext || {};

  // ServiceNow does not support timeout functions - so default them for now
  //this.timeout = attrs.timeout || {setTimeout: setTimeout, clearTimeout: clearTimeout};
  this.timeout = attrs.timeout = {setTimeout: function (fn) { fn(); }, clearTimeout: function () {}};

  this.fail = attrs.fail || function () {};
};

snd_Spoke.QueueRunner.prototype = {

  type: 'snd_Spoke.QueueRunner',

  execute: function () {
    this.run(this.queueableFns, 0);
  },

  run: function (queueableFns, recursiveIndex) {
    var length = queueableFns.length,
        iterativeIndex;

    for (iterativeIndex = recursiveIndex; iterativeIndex < length; iterativeIndex++) {
      var queueableFn = queueableFns[iterativeIndex];
      if (queueableFn.fn.length > 0) {
        //this.attemptAsync(queueableFns, queueableFn, iterativeIndex + 1);

        // we can't run async stuff in ServiceNow, but we do have to run all the children
        this.attemptSync(queueableFn);
        this.run(queueableFns, iterativeIndex + 1);
        return;
      } else {
        this.attemptSync(queueableFn);
      }
    }

    var runnerDone = iterativeIndex >= length;

    if (runnerDone) {
      this.clearStack(this.onComplete);
    }
  },

  attemptAsync: function (queueableFns, queueableFn, recursiveIndex) {
    var /*clearTimeout = function () {
        Function.prototype.apply.apply(self.timeout.clearTimeout, [j$.getGlobal(), [timeoutId]]);
      },*/
      self = this,
      next = this._once(function () {
        //clearTimeout(timeoutId);
        self.run(queueableFns, recursiveIndex);
      }),
      timeoutId;

    next.fail = function() {
      self.fail.apply(null, arguments);
      next();
    };

    /*if (queueableFn.timeout) {
      timeoutId = Function.prototype.apply.apply(self.timeout.setTimeout, [j$.getGlobal(), [function() {
        var error = new Error('Timeout - Async callback was not invoked within timeout specified by jasmine.DEFAULT_TIMEOUT_INTERVAL.');
        onException(error, queueableFn);
        next();
      }, queueableFn.timeout()]]);
    }*/

    try {
      queueableFn.fn.call(this.userContext, next);
    } catch (e) {
      this.handleException(e, queueableFn);
      next();
    }
  },

  attemptSync: function (queueableFn) {
    try {
      queueableFn.fn.call(this.userContext);
    } catch (e) {
      this.handleException(e, queueableFn);
    }
  },

  onException: function (e, queueableFn) {
    this.onException(e);
  },

  handleException: function (e, queueableFn) {
    this.onException(e, queueableFn);
    if (!this.catchException(e)) {
      //TODO: set a var when we catch an exception and
      //use a finally block to close the loop in a nice way..
      throw e;
    }
  },

  _once: function (fn) {
    var called = false;
    return function() {
      if (!called) {
        called = true;
        fn();
      }
    };
  }
};

//==============================================================================
// Tree Processor
//==============================================================================

snd_Spoke.TreeProcessor = function TreeProcessor(attrs) {
  this.tree = attrs.tree;
  this.runnableIds = attrs.runnableIds;
  this.queueRunnerFactory = attrs.queueRunnerFactory;
  this.nodeStart = attrs.nodeStart || function() {};
  this.nodeComplete = attrs.nodeComplete || function() {};
  this.stats = { valid: true };
  this.processed = false;
  this.defaultMin = Infinity;
  this.defaultMax = 1 - Infinity;
};

snd_Spoke.TreeProcessor.prototype = {

  type: 'snd_Spoke.TreeProcessor',

  processTree: function () {
    this.processNode(this.tree, false);
    this.processed = true;
    return this.stats;
  },

  execute: function (done) {
    if (!this.processed) {
      this.processTree();
    }

    if (!this.stats.valid) {
      throw 'invalid order';
    }

    var childFns = this.wrapChildren(this.tree, 0);
    var self =  this;
    this.queueRunnerFactory({
      queueableFns: childFns,
      userContext: this.tree.sharedUserContext(),
      onException: function() {
        self.tree.onException.apply(self.tree, arguments);
      },
      onComplete: done
    });
  },

  runnableIndex: function (id) {
    for (var i = 0; i < this.runnableIds.length; i++) {
      if (this.runnableIds[i] === id) {
        return i;
      }
    }
  },

  processNode: function (node, parentEnabled) {
    var executableIndex = this.runnableIndex(node.id);

    if (executableIndex !== undefined) {
      parentEnabled = true;
    }

    parentEnabled = parentEnabled && node.isExecutable();

    if (!node.children) {
      this.stats[node.id] = {
        executable: parentEnabled && node.isExecutable(),
        segments: [{
          index: 0,
          owner: node,
          nodes: [node],
          min: this.startingMin(executableIndex),
          max: this.startingMax(executableIndex)
        }]
      };
    } else {
      var hasExecutableChild = false;

      for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];

        this.processNode(child, parentEnabled);

        if (!this.stats.valid) {
          return;
        }

        var childStats = this.stats[child.id];

        hasExecutableChild = hasExecutableChild || childStats.executable;
      }

      this.stats[node.id] = {
        executable: hasExecutableChild
      };

      this.segmentChildren(node, this.stats[node.id], executableIndex);

      if (!node.canBeReentered() && this.stats[node.id].segments.length > 1) {
        this.stats = { valid: false };
      }
    }
  },

  startingMin: function (executableIndex) {
    return executableIndex === undefined ? this.defaultMin : executableIndex;
  },

  startingMax: function (executableIndex) {
    return executableIndex === undefined ? this.defaultMax : executableIndex;
  },

  segmentChildren: function (node, nodeStats, executableIndex) {
    var currentSegment = {
          index: 0,
          owner: node,
          nodes: [],
          min: this.startingMin(executableIndex),
          max: this.startingMax(executableIndex)
        },
        result = [currentSegment],
        lastMax = this.defaultMax,
        orderedChildSegments = this.orderChildSegments(node.children),
        defaultMin = this.defaultMin,
        defaultMax = this.defaultMax;

    function isSegmentBoundary(minIndex) {
      return lastMax !== defaultMax && minIndex !== defaultMin && lastMax < minIndex - 1;
    }

    for (var i = 0; i < orderedChildSegments.length; i++) {
      var childSegment = orderedChildSegments[i],
        maxIndex = childSegment.max,
        minIndex = childSegment.min;

      if (isSegmentBoundary(minIndex)) {
        currentSegment = {index: result.length, owner: node, nodes: [], min: defaultMin, max: defaultMax};
        result.push(currentSegment);
      }

      currentSegment.nodes.push(childSegment);
      currentSegment.min = Math.min(currentSegment.min, minIndex);
      currentSegment.max = Math.max(currentSegment.max, maxIndex);
      lastMax = maxIndex;
    }

    nodeStats.segments = result;
  },

  orderChildSegments: function (children) {
    var specifiedOrder = [],
        unspecifiedOrder = [];

    for (var i = 0; i < children.length; i++) {
      var child = children[i],
          segments = this.stats[child.id].segments;

      for (var j = 0; j < segments.length; j++) {
        var seg = segments[j];

        if (seg.min === this.defaultMin) {
          unspecifiedOrder.push(seg);
        } else {
          specifiedOrder.push(seg);
        }
      }
    }

    specifiedOrder.sort(function(a, b) {
      return a.min - b.min;
    });

    return specifiedOrder.concat(unspecifiedOrder);
  },

  executeNode: function (node, segmentNumber) {
    var self = this;
    if (node.children) {
      return {
        fn: function (done) {

          self.nodeStart(node);

          self.queueRunnerFactory({
            onComplete: function() {
              self.nodeComplete(node, node.getResult());

              // Normally, done should be called to kick off the next function.
              // This is a run once scenario that in a multi-thread environment like a
              // browser, you could call once an async call has been completed.
              // As we don't have async, we don't care.
              if (done) done();

            },
            queueableFns: self.wrapChildren(node, segmentNumber),
            userContext: node.sharedUserContext(),
            onException: function() {
              node.onException.apply(node, arguments);
            }
          });
        }
      };
    } else {
      return {
        fn: function (done) { node.execute(done, self.stats[node.id].executable); }
      };
    }
  },

  wrapChildren: function (node, segmentNumber) {
    var result = [],
        segmentChildren = this.stats[node.id].segments[segmentNumber].nodes;

    for (var i = 0; i < segmentChildren.length; i++) {
      result.push(this.executeNode(segmentChildren[i].owner, segmentChildren[i].index));
    }

    if (!this.stats[node.id].executable) {
      return result;
    }

    return node.beforeAllFns.concat(result).concat(node.afterAllFns);
  }

};

//==============================================================================
// Reporter
//==============================================================================

snd_Spoke.Reporter = function () {
  this.result_log = [];
  this.parent = null;
  this.parent_hash = {};
  this.total_specs = 0;
  this.failed_specs = 0;
  this.status = 'loaded';
  this.details = [];
  this.start_time = null;
  this.execution_time = null;

  this.tree = this.current = this.addNode('suite', {
    id: 'root',
    description: 'Root Suite'
  });

};

snd_Spoke.Reporter.prototype = {

  type: 'snd_Spoke.Reporter',

  _now: function () { return new Date().getTime(); },

  addNode: function (type, result) {

    var n = {
      type: type,
      id: result.id || '',
      description: result.description || '',
      status: result.status || '',
      start_time: this._now(),
      execution_time: null
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
  },

  addFailedExpectations: function (result) {
    if (!result.failedExpectations || !result.failedExpectations.length) return;

    if (!this.current.hasOwnProperty('failed_expectations')) {
      this.current.failed_expectations = [];
    }
    for(var i = 0; i < result.failedExpectations.length; i++) {
      this.current.failed_expectations.push(result.failedExpectations[i].message);
    }

    if (!result.pendingReason) this.failed_specs += result.failedExpectations.length;
  },

  // we do ,his because storing the parent on the node along with the children
  // causes a Stack Overflow
  getParent: function (node) {
    return this.parent_hash[node.id];
  },

  exitNode: function (result) {

    this.current.status = result.status;
    this.current.execution_time = this._now() - this.current.start_time;

    if (result.pendingReason) {
      this.current.pendingReason = result.pendingReason;
    }

    this.addFailedExpectations(result);

    this.current = this.parent;
    this.parent = this.getParent(this.current);
  },

  start: function (suiteInfo) {
    this.start_time = this._now();
    this.result_log.push('Running suite with ' + suiteInfo.totalSpecsDefined + ' specs.');
    this.started = true;
    this.status = 'started';
    this.total_specs = suiteInfo.totalSpecsDefined;
  },

  done: function () {
    this.result_log.push('Finished suite.');
    this.finished = true;
    this.status = 'finished';
    this.execution_time = this._now() - this.start_time;
  },

  suiteStarted: function (result) {
    this.result_log.push('Suite started: ' + result.description);
    this.addNode('suite', result);
  },

  suiteDone: function (result) {
    this.result_log.push('Suite: ' + result.description + ' was ' + result.status + '.');
    this.exitNode(result);
  },

  specStarted: function (result) {
    this.result_log.push('Spec started: ' + result.description);
    this.addNode('spec', result);
  },

  specDone: function (result) {
    this.result_log.push('Spec done: ' + result.description + ' ' +
        (!result.failedExpectations.length ? 'passed' : 'failed'));
    this.exitNode(result);
  },

  storeDetails: function (details) {
    this.details.push(details);
  },

  executionTime: function () {
    return this.execution_time;
  }

};

//==============================================================================
// Execute from scripts
//==============================================================================

// use this for giving accurate lineNumber info
snd_Spoke.EXECUTE_LINE = 0;
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

  var script = 'try {\n' +
      'var $ = new global.snd_Spoke();\n' +
      '$.updateEnv(this);\n\n';

  if (glide_record.hasNext()) {
    while (glide_record.next()) {
      script += '$.reporter.storeDetails({' +
                  '$display: "' + glide_record.getDisplayValue() + '", ' +
                  'api_name: "' + glide_record.getValue('api_name') + '", ' +
                  'sys_updated_on: "' + glide_record.getValue('sys_updated_on') + '", ' +
                  'sys_id: "' + glide_record.getValue('sys_id') + '" ' +
                '});\n';
      script += 'global.snd_Spoke.EXECUTE_LINE = ' + script.split('\n').length + ' + 1;\n';
      script += 'describe("' + glide_record.getDisplayValue() + '", function () { \n';
      script += 'try {';
      script += glide_record.getValue(script_field) + '\n\n';
      script += '} catch (e) { fail(global.snd_Spoke.exceptionFormatter.formatMessage(e)); }';
      script += '});\n';
    }
    script += '$.execute();';
  } else {
    script += '$.execute();';
    script += "$.reporter.status = 'ignored';";
  }

  script += '} catch (ex) {\n';
  script +=   '$.reporter.status = "exception";';
  script +=   "$.reporter.error = ex.toString();\n";
  script += '}';
  script += '$.reporter'; // so the reporter is returned

  var test = new GlideRecord('sys_script_include');
  test.sys_scope = getCurrentScope(glide_record);
  test.script = script;

  gse = new GlideScopedEvaluator();
  return gse.evaluateScript(test, 'script');
};