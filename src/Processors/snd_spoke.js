/*!
  Processor for generating the user interface and handling AJAX calls.
*/
(function () {

  snd_console = typeof snd_console === 'object' ? snd_console : {};

  // The scope of our application. Prepended to UI Macro's, etc.
  // Prevents misuse of this processor.
  var APP_SCOPE = gs.getCurrentScopeName() != 'rhino.global' ?
              gs.getCurrentScopeName() : 'global';

  var USER_SCOPE = '' + (g_request.getParameter('sys_scope') || APP_SCOPE);

  // the initial UI file to serve
  var UI_MAIN = (APP_SCOPE !== 'global' ? APP_SCOPE + '_' : '')  + 'snd_spoke_ui';

  // The name of the macro to render when access is denied.
  var UI_403 = '403.html';

  // Variables to inject into UI Macros
  var MACRO_VARS = {

    // The doctype to prepend to the UI file
    'DOCTYPE': '<!doctype html>',

    // required for attachments to work with glide.security.use_csrf_token on
    'SYSPARM_CK': APP_SCOPE !== 'global' ? gs.getSession().getSessionToken() : gs.getSessionToken(),

    // The maximum attachment size that a user can upload
    'MAX_ATTACH_SIZE': (function () {
      var max = gs.getProperty('com.glide.attachment.max_size');
      if (!max) max = 1000;
      else max = parseInt(max, 10);
      if (isNaN(max)) { max = 20; }
      return max + 'MB';
    })(),

    'AMP': '&'
  };

  var NO_CSRF_CHECK = ['executeTests', 'getAvailableSpecs'];

  // populate the application detail variables
  (function () {
    var gr = new GlideRecord('sys_scope');
    if (USER_SCOPE !== 'global') {
      gr.addQuery('scope', '=', USER_SCOPE);
      gr.setLimit(1);
      gr.query();
      gr.next();
    } else {
      gr.name = 'Global';
      gr.short_description = 'The global scope.';
      gr.version = 'N/A';
    }

    MACRO_VARS.APP_NAME = gr.getValue('name');
    MACRO_VARS.APP_DESC = gr.getValue('short_description');
    MACRO_VARS.APP_VERSION = gr.getValue('version');
  })();

  var json = new global.JSON();

  // Makes the parameters passed to the request easily av
  var params = (function () {
    var names = g_request.getParameterNames(),
        params = {},
        name,
        i;

    if (APP_SCOPE !== 'global') {
      for (i = 0; i < names.length; i++) {
        name = names[i];
        params[name] = '' + g_request.getParameter(name);
      }
    } else {
      while (names.hasMoreElements()) {
        name = names.nextElement();
        params[name] = '' + g_request.getParameter(name);
      }
    }
    if (params.data) {
      params.data = json.decode(params.data);
    }
    return params;
  })();

  function hasAccess() {
    return gs.hasRole('admin');
  }

  function isValidRequest(action) {
    // prevent CSRF
    var i;
    if (params.sysparm_ck) {
      return params.sysparm_ck == MACRO_VARS.SYSPARM_CK;
    }
    for (i = 0; i < NO_CSRF_CHECK.length; i++) {
      if (NO_CSRF_CHECK[i] == action) return true;
    }
    return false;
  }

  function executeTests(params) {
    var reporter,
        data,
        gr;

    gr = new GlideRecord('sys_script_include');

    if (params.script) {
      gr.addQuery('api_name', '=', params.script);
    } else {
      gr.addQuery('api_name', 'STARTSWITH', USER_SCOPE + '.');
      gr.addQuery('api_name', 'ENDSWITH', '_spec');
    }
    gr.addQuery('active', '=', true);
    gr.orderBy('name');
    gr.query();

    reporter = snd_Spoke.executeFromScripts(gr, 'script');

    if (!reporter) {
      throw 'Execution failed. Could be a scope issue?';
    }

    data = {};
    data.details = reporter.details;
    data.failed_specs = reporter.failed_specs;
    data.suites = reporter.tree.children;
    data.total_specs = reporter.total_specs;
    data.status = reporter.status;
    if (reporter.error) data.error = reporter.error;

    return data;
  }

  function getAvailableSpecs(params) {
    var gr,
        result;
    gr = new GlideRecord('sys_script_include');
    gr.addQuery('api_name', 'STARTSWITH', USER_SCOPE + '.');
    gr.addQuery('api_name', 'ENDSWITH', gs.getProperty('snd.spoke.spec.filter', '_spec'));
    gr.addQuery('active', '=', true);
    gr.orderBy('name');
    gr.query();

    result = [];
    while (gr.next()) {
      result.push({
        name: gr.getValue('name'),
        api_name: gr.getValue('api_name'),
        updated: gr.sys_updated_on.getDisplayValue(),
        sys_id: gr.getValue('sys_id')
      });
    }

    return result;
  }

  /**
    summary:
      A simple request handler that takes an action and data object.
    param: action [String]
      A keyword that can be used to determine the request.
    param: data [mixed]
      Arbitrary data object for use with processing.
  **/
  function processAction(params) {
    var result = {},
        name = params.action,
        start_time,
        errors,
        data,
        exf = new snd_Spoke.ExceptionFormatter();

    start_time = new Date().getTime();

    result.$success = true;

    try {
      switch (name) {
        case 'executeTests':
          result.results = executeTests(params);
          break;
        case 'getAvailableSpecs':
          result.specs = getAvailableSpecs(params);
          break;
        default:
          result.$success = false;
          result.$error = 'Invalid action name: \'' + name + '\'';
      }

      errors = snd_console.get ? snd_console.get({type: 'error'}) : [];
      if (errors.length) {
        result.$success = false;
        result.$error = errors.pop();
      }

    } catch (e) {
      result.$success = false;
      result.$error = exf.message(e);
      result.$stack = exf.stack(e);
    }

    result.$time = (new Date().getTime()) - start_time;

    if ((snd_console.DEBUG || 'debug_mode' in params) && snd_console.getStrings) {
      result.$snd_console = snd_console.getStrings();
    }

    return result;
  }

  /**
    summary:
      Process a template from a UI Macro and return the output.
    param: name [String]
      The name of the UI Macro to use.
    param: vars [Object] Optional
      An object of variables to pass to replace in the macro.
      Variables should be in the format `${variable_name}`
    returns: String
  **/
  function processTemplate(name, vars) {

    /**
      summary:
        Simple wrapper to get a single GlideRecord object
      param: table [String]
      param: query [String]
      returns: GlideRecord
    **/
    function getRecord(table, query) {
      var gr = new GlideRecord(table);
      gr.addEncodedQuery(query);
      gr.setLimit(1);
      gr.query();
      return gr.next() ? gr : false;
    }

    /**
      summary:
        Replaces ${variable} formatted variables in a string with the variable
        value.
      param: str [String]
      param: vars [Object] Optional
      returns: String
    **/
    function replaceVars(str, vars) {
      if (typeof vars == 'object') {
        str = str.replace(/\$\{\s*(\w+)\s*\}/g, function (m, word) {
          return vars.hasOwnProperty(word) ? vars[word] || '' : m;
        });
      }
      return str;
    }

    /**
      summary:
        Automagically set the versions on database Style Sheets and UI Scripts
      description:
        Searchs for links matching the cssdbx or jsdbx format.
        Stylesheets can be referenced by their name (normally sys_id).
        Replaces links with cache aware versions.
      param: html [String]
        The HTML template to work with.
      returns: String
        The modified HTML.
    **/
    function setScriptVersions(html) {

      function substrReplace(str, i, what, len) {
        return str.substr(0, i) + what + str.substr(i + (len || what.length));
      }

      function appendTime(html, match, map) {
        var gr, updated;

        gr = getRecord(map.table, map.key + '=' + match[1]);
        if (gr) {
          updated = new GlideDateTime(gr.sys_updated_on).getNumericValue();
          html = substrReplace(
              html,
              match.index,
              gr[map.val] + '.' + match[2] + '?v=' + updated,
              match[0].length);
        }

        return html;
      }

      var regexp = /([a-zA-Z0-9_.\-]*)\.(cssdbx|jsdbx)/g,
          key_map = {
            'jsdbx':  {table: 'sys_ui_script', key: 'name', val: 'name'},
            'cssdbx': {table: 'content_css',   key: 'name', val: 'sys_id'}
          },
          map,
          match;

      while ((m = regexp.exec(html))) {
        if (key_map.hasOwnProperty(m[2])) {
          html = appendTime(html, m, key_map[m[2]]);
        }
      }

      return html;
    }

    var field = APP_SCOPE === 'global' ? 'name' : 'scoped_name',
        macro = getRecord('sys_ui_macro', field + '=' + name),
        output = '';
    if (macro) {
      output = replaceVars(macro.xml.toString(), vars);
      output = setScriptVersions(output);
    } else {
      output = 'Macro ' + name + ' does not exist.';
    }
    return output;
  }

  var response;

  // check the user has the role to access
  if (!hasAccess()) {
    g_response.setStatus(403); // forbidden
    response = processTemplate(UI_403, MACRO_VARS);
    if (response) {
      g_processor.writeOutput('text/html', response);
    } else {
      g_processor.writeOutput('text/plain', 'Error: access restricted.');
    }
  }

  // prevent CSRF - all requests have valid sysparm_ck
  else if (params.action && !isValidRequest(params.action)) {
    g_response.setStatus(401);
    g_processor.writeOutput('text/plain', 'Authentication is not valid.');
  }

  // process the action that has been requested by the browser
  else if (params.action) {
    response = processAction(params);
    g_processor.writeOutput('application/json', json.encode(response));
  }

  // ensure requested template is valid for this scope
  else if (params.hasOwnProperty('template') && (APP_SCOPE === 'global' || params.template.indexOf(APP_SCOPE) !== 0)) {
    g_processor.writeOutput('text/plain', 'Invalid template requested; ' +
        'not in application scope: ' + params.template);
  }

  // send the requested template or the main interface
  else {
    response = processTemplate(params.template || UI_MAIN, MACRO_VARS);
    g_processor.writeOutput('text/html', response);
  }

})();