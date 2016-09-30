/**
 * Generate a script template to test each function of a script.
 *
 * @param  {String} api_name The ServiceNow api_name of the script include.
 * @return {String}
 */
function snd_Spoke_generateTest(api_name) {

  function getSource(api_name) {
    var gr = new GlideRecord('sys_script_include');
    gr.addQuery('api_name', '=', api_name);
    gr.setLimit(1);
    gr.query();
    return gr.next() ? '' + gr.script : '';
  }

  function getMethods(obj) {
    var methods = [];
    for (var method in obj) {
      if (obj.hasOwnProperty(method) && typeof obj[method] == 'function') {
        methods.push(method);
      }
    }
    methods.sort();
    return methods;
  }

  function describe(name, indent, content) {
    content = content ? '  ' + content.replace(/\n/g, '\n  ' + indent) + '\n' : '  \n';
    return indent + 'describe("' + name + '", function () {\n' +
           indent + content +
           indent + '});';
  }

  function toSentence(method, no_cap) {
    var newSentence = true;
    return method.replace(/[A-Z]{2,}|^[a-z]|[A-Z._]/g, function(v, i) {
      if (v.length > 1) return v;
      if (newSentence) {
        newSentence = false;
        return (i === 0 && no_cap) ? v : v.toUpperCase();
      }
      if (v === '.') {
        newSentence = true;
        return ' ';
      }
      return " " + (v === '_' ? '' : v.toLowerCase());
    });
  }

  function getObject(api_name) {
    var obj = (function () { return this;})(),
        path = api_name.split('.'),
        i;
    for (i = 0; i < path.length; i++) {
      obj = obj[path[i]];
    }
    return obj;
  }

  function explain(source, method, is_proto) {
    var end = 0,
        search = (is_proto ? 'prototype.' : '') + method,
        alt_end,
        result,
        match,
        start;

    do {
      result = '';
      start = source.indexOf(search, end);
      if (start < 0) break;
      end = source.indexOf('{', start);
      alt_end = source.indexOf(';', start);
      if (alt_end > 0 && alt_end < end) {
        end = alt_end;
      }
      if (end < 0) break;
      result = source.substr(start, end - start).trim();
    } while (result.indexOf('function') < 0);

    if (!result) {
      match = source.match(new SNRegExp('(?!prototype\\s*=\\s*{.+?)' + method + ':\\s*[^)]+\\)'));
      if (match) result = match[0];
    }

    return result || (search + ' function not defined in source code');
  }

  var source = getSource(api_name),
      obj = getObject(api_name),
      content = '\n',
      comment,
      methods,
      is_private,
      type,
      i;

  if (typeof obj === 'function') {
    type = obj.prototype.type || api_name;
    type += obj.prototype.type ? ' class' : ' object';
    methods = getMethods(obj.prototype);
    for (i = 0; i < methods.length; i++) {
      is_private = methods[i].indexOf('_') == 0 ? ' private' : '';
      comment = '// test ' + explain(source, methods[i], true);
      content += describe(toSentence(methods[i] + is_private + ' method', true), '', comment) + '\n\n';
    }
  } else {
    type = api_name + ' object';
  }

  if (type.indexOf('x_') === 0) {
    type = type.substr(type.indexOf('.'));
  }

  methods = getMethods(obj);
  for (i = 0; i < methods.length; i++) {
    is_private = methods[i].indexOf('_') == 0 ? ' private' : '';
    comment = '// test ' + explain(source, methods[i]);
    content += describe(toSentence(methods[i] + is_private + ' function', true), '', comment) + '\n';
    if (i + 1 < methods.length) content += '\n'; // prevent double newline at end
  }

  if (type.match('^[a-z]')) type = ' ' + type;
  return describe(toSentence('The' + type), '', content);
}