snd_console.DEBUG_TRACE = true;

// trace in order - leaving the container class until last.
snd_Spoke.Suite = snd_console.trace(snd_Spoke.Suite);
snd_Spoke.Spec = snd_console.trace(snd_Spoke.Spec);
snd_Spoke.Expectation = snd_console.trace(snd_Spoke.Expectation);
snd_Spoke.PrettyPrinter = snd_console.trace(snd_Spoke.PrettyPrinter);
snd_Spoke.matchersUtil = snd_console.trace(snd_Spoke.matchersUtil);
snd_Spoke.util = snd_console.trace(snd_Spoke.util);
snd_Spoke.errors.ExpectationFailed = snd_console.trace(snd_Spoke.errors.ExpectationFailed);
snd_Spoke.ExceptionFormatter = snd_console.trace(snd_Spoke.ExceptionFormatter);
snd_Spoke.QueueRunner = snd_console.trace(snd_Spoke.QueueRunner);
snd_Spoke.TreeProcessor = snd_console.trace(snd_Spoke.TreeProcessor);
snd_Spoke.Reporter = snd_console.trace(snd_Spoke.Reporter);
snd_Spoke = snd_console.trace(snd_Spoke);

var $ = new snd_Spoke();
$.updateEnv(this);

describe("A spec", function() {
  it("is just a function, so it can contain any code", function() {
    var foo = 0;
    foo += 1;

    expect(foo).toEqual(1);
  });

  it("can have more than one expectation", function() {
    var foo = 0;
    foo += 1;

    expect(foo).toEqual(1);
    expect(true).toEqual(true);
  });
});

$.execute();

// save this to an html file
snd_console.getHtml();