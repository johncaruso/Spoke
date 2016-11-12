var url_params={};window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi,function(str,key,value){url_params[key] = value;});

function togglePanel(forTitle) {
  $(forTitle).parent().next('.panel-body').toggle();
}

var spoke_client = (function () {

  var $result_title = $('#result_title');
  var $result_body = $('#result_body');

  function renderNode(node) {
    var p, li, ul, i, fails, class_name, icon, html;

    if (node.type == 'spec') {
      switch (node.status) {
        case 'passed':
          class_name = 'text-success';
          icon = 'ok-circle';
          break;
        case 'disabled':
        case 'pending':
          class_name = 'text-warning';
          icon = 'ban-circle';
          if (node.pendingReason) {
            node.description += ' PENDING WITH MESSAGE: ' + node.pendingReason;
          }
          break;
        case 'failed':
          class_name = 'text-danger';
          icon = 'remove-circle';
          break;
      }
    } else {
      class_name = '';
      icon = 'list';
    }

    icon = '<span class="small glyphicon glyphicon-' + icon + '"></span> ';

    li = $('<li></li>');
    li.append('<p class="' + class_name + '">' + icon + escapeHtml(node.description) + ' <small class="pull-right">(' + node.execution_time + 'ms)</small></p>');

    if (node.status != 'pending') {
      if (node.hasOwnProperty('failed_expectations')) {
        if (node.failed_expectations.length) {
          fails = $('<table class="table table-striped table-bordered small"></table>');
          for (i = 0; node.failed_expectations.length > i; i++) {
            html = escapeHtml(node.failed_expectations[i]);
            fails.append('<tr class="warning"><td>' + html + '</td></tr>');
          }
          li.append(fails);
        }
      }
    }

    if (node.hasOwnProperty('children')) {
      if (node.children.length) {
        ul = $('<ul></ul>');
        for (i = 0; node.children.length > i; i++) {
          ul.append(renderNode(node.children[i]));
        }
        li.append(ul);
      }
    }

    return li;
  }

  function renderResults(results) {
    var ul, i, j, suite,
        $panel_title,
        $panel_body,
        details,
        api_name,
        errors = [];

    $result_title.text('Testing ' + results.status + '. ' +
      results.total_specs + ' spec' + (results.total_specs == 1 ? '' : 's') +
      ', ' + results.failed_specs + ' failed expectations.');

    if (results.failed_specs > 0) {
      $result_title.removeClass('text-success text-warning').addClass('text-danger');
    } else if (results.status == 'ignored') {
      $result_title.removeClass('text-success text-danger').addClass('text-warning');
    } else {
      $result_title.removeClass('text-warning text-danger').addClass('text-success');
    }

    if (!results.suites) return;
    for (i = 0; results.suites.length > i; i++) {
      suite = results.suites[i];
      details = results.details[i];
      api_name = results.details[i].api_name;

      if (suite.hasOwnProperty('failed_expectations')) {
        errors = errors.concat(suite.failed_expectations);
      }

      $panel =
          $('<div class="panel"><div class="panel-heading">' +
              '<a href="' + api.getExecuteLink(api_name) + '" onclick="spoke_client.executeTests(\'' + api_name + '\'); return false" title="Execute" class="btn btn-link btn-open">' +
                '<span class="glyphicon glyphicon-play"></span> <span class="sr-only">Execute</span></a>' +
              '<a href="/sys_script_include.do?sys_id=' + details.sys_id + '" onclick="$.Event(event).stopPropagation();" target="' + details.sys_id + '" title="Edit" class="btn btn-link btn-open">' +
                '<span class="glyphicon glyphicon-edit"></span> <span class="sr-only">Edit</span></a>' +
              '<span class="btn btn-link panel-title" onclick="togglePanel(this);">' + escapeHtml(suite.description) + '</span>' +
              '<small class="pull-right">(' + suite.execution_time + 'ms)</small>' +
              '<div class="clearfix"></div>' +
            '</div></div>');
      $panel_body = $('<div class="panel-body"></div>');

      if (suite.hasOwnProperty('children')) {
        ul = $('<ul></ul>');
        for (j = 0; suite.children.length > j; j++) {
          ul.append(renderNode(suite.children[j]));
        }
        $panel_body.append(ul);
      }

      if ($panel_body.find('.text-danger').length) {
        $panel.addClass('panel-danger');
      } else {
        $panel.addClass('panel-success');
        if (results.suites.length > 1) $panel_body.hide();
      }

      $panel.append($panel_body);
      $result_body.append($panel);
    }

    if (errors.length) {
      api.formatError({
        $error: '<ol><li>' + errors.join('</li><li>') + '</li></ol>'
      });
    }

  }

  function renderSpecs(specs) {
    var $list_group,
        $panel,
        spec,
        i;

    $result_title.text('Found ' + specs.length + ' spec' + (specs.length == 1 ? '' : 's'));
    if (specs.length) {
      $result_title.removeClass('text-warning text-danger').addClass('text-success');
    } else {
      $result_title.removeClass('text-success text-danger').addClass('text-warning');
      return;
    }

    $list_group = $('<div class="list-group"></div>');
    for (i = 0; specs.length > i; i++) {
      spec = specs[i];
      $item =
          '<div class="list-group-item list-group-item-warning">' +
            spec.name +
            '<div class="pull-right">' +
              '<a class="btn btn-link" href="/sys_script_include.do?sys_id=' + spec.sys_id + '" target="' + spec.sys_id + '">' +
                '<span class="glyphicon glyphicon-edit"></span> Edit</a>' +
              '<a class="btn btn-success" onclick="spoke_client.executeTests(\'' + spec.api_name + '\'); return false" href="' + api.getExecuteLink(spec.api_name) + '">' +
                '<span class="glyphicon glyphicon-play"></span> Execute</a>' +
            '</div>' +
            '<div class="small">Updated: ' + spec.updated + '</div>' +
          '</div>';
      $list_group.append($item);
    }
    $result_body.append($list_group);
  }

  var _charMap = {
    '>': '&gt;',
    '<': '&lt;',
    '&': '&amp;',
    "'": '&#39;',
    '"': '&#34;'
  };
  function escapeHtml(text) {
    return text.replace(/[><&'"]/g, function (c) {
      return c in _charMap ? _charMap[c] : c;
    });
  }

  var api = {};

  api.current_script = url_params.script;

  api.getAvailableSpecs = function () {
    var url = ['?action=getAvailableSpecs'];
    if ('sys_scope' in url_params) url.push('sys_scope=' + url_params.sys_scope);
    api.current_script = '';
    return api.run(url.join('&'), function (data) {
      if (data.$success) {
        renderSpecs(data.specs);
        $result_title.show();
        $result_body.show();
      }
    });
  };

  api.formatError = function (data) {
    if (data.$error) {
      var message = data.$error.message ? data.$error.message : data.$error;
      var html = '<div class="alert alert-danger">' +
          '<h4><span class="glyphicon glyphicon-remove-circle"></span> Process Error</h4>' +
          '<p><samp>' + message + '</samp></p>';

        if (data.$error.scope_stack) {
          html += '<p><samp>in ' + data.$error.scope_stack.join('<br /> in ') + '</samp></p>';
        }

        html += '</div>';
        $result_body.prepend(html);
        $result_body.show();
    }
  };

  api.getExecuteLink = function (script) {
    var url = ['?action=executeTests'];
    if ('sys_scope' in url_params) url.push('sys_scope=' + url_params.sys_scope);
    if (script) url.push('script=' + script);
    return url.join('&');
  };

  api.executeTests = function (script) {
    if (arguments.length > 0) api.current_script = script;
    return api.run(api.getExecuteLink(api.current_script), function (data) {
      if (data.$success) {
        renderResults(data.results);
        $result_title.show();
        $result_body.show();
      }
    });
  };

  api.run = function (url, callback) {

    $result_title.removeClass().addClass('text-primary').text('Running...');

    url += '&sysparm_ck=' + SYSPARM_CK;

    $('#run_btn').prop('disabled', true);
    $('#get_btn').prop('disabled', true);

    $result_body.empty();


    return $.ajax({
      url: url,
      dataType: 'json',
      statusCode: {
        401: function () {
          window.location.reload();
        }
      }
    }).then(function (data) {
      api.formatError(data);
      callback(data);
    }, function (xhr) {
      alert('Failed to execute AJAX request to run tests.');
    }).then(function () {
      $('#run_btn').prop('disabled', false);
      $('#run_btn_text').text(spoke_client.current_script ? 'Execute' : 'Execute All');
      $('#get_btn').prop('disabled', false);
    });
  };

  return api;
})();

$('#run_btn').click(function () {
  $('#run_btn_text').text('Running...');
  spoke_client.executeTests();
});

// execute when Ctrl + Enter is used
$(document).keydown(function (event) {
  if (event.ctrlKey) {
    if (event.keyCode == 10 || event.keyCode == 13) {
      event.preventDefault();
      $('#run_btn_text').text('Running...');
      spoke_client.executeTests();
    }
  }
});

$('#get_btn').click(function () {
  spoke_client.getAvailableSpecs();
});

// if no script has been requested then show the available specs
if (!url_params.script) {
  spoke_client.getAvailableSpecs();
}