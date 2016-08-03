var $ = new snd_Spoke();
$.updateEnv(this);

// Internal non Jasmine test
describe('A broken spec', function () {
  describe('will use a pretty printer', function () {
    it('can handle strings and numbers', function () {
      expect('A string').toBe(9);
    });
    it('can handle objects and arrays', function () {
      expect([1,2,3]).toBe({foo: 'bar'});
    });
    it('can handle null and undefined', function () {
      expect(void 0).toBe(null);
    });
    it('can also handle GlideRecords and GlideElements', function () {
      var gr = new GlideRecord('incident');
      gr.addNotNullQuery('assigned_to');
      gr.setLimit(1);
      gr.query();
      expect(gr.next()).toBe(true);
      expect(gr).toBe(gr.assigned_to);
    });
  });
});

$.execute();
$.reporter.tree;