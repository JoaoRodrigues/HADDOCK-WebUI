"use strict";

$(function(){
	var formHasChanged     = false;
	var formLevelTooHigh   = false;
	var components         = formComponents;
	var componentCount     = 0;
	var componentsRendered = 0;
	var renderingDone      = false;


	/**
	 * Change the form level.
	 *
	 * @param name the level name to switch
	 * @param force show/hide components even if we are already on the specified level
	 */
	function setLevel(name, force){
		if(
				$('.levelchooser li.selected')[0] === $('.levelchooser li.level-'+name)[0]
				&& force !== true
			){
			// We are already at the right level
			return;
		}

		if(!formLevelTooHigh && formLevels.indexOf(name) < formLevelIndex && formHasChanged){
			// Because lower form levels hide certain fields, the user may lose
			// filled in data by switching to a lower form level.
			// Although we do not reset input fields, we should warn the user
			// that some parameters may not be saved.
			// Of course, we filter submitted fields based on access level on the server side as well.
			if(!confirm(
					'You may lose filled in parameters by switching to a lower form level.'
					+ "\nAre you sure you want to switch to the " + name + ' form?'
				)){
				return;
			}
		}

		$('.levelchooser li.selected').removeClass('selected');
		$('.levelchooser li.level-'+name).addClass('selected');

		formLevelIndex = formLevels.indexOf(name);

		var rowsToHide = $('#haddockform .row:not([class~="level-' + name + '"])');
		var rowsToShow = $('#haddockform .row.level-' + name);

		if(Config.hideDisabledComponents){
			rowsToHide.hide();
			rowsToShow.show();
		}

		// FIXME: Select elements are not disabled
		//        (Though this is not really a problem, as they _are_ hidden
		//        and we do server-side checks as well)
		rowsToHide.find('> .value input').prop('disabled', true);
		rowsToShow.find('> .value input').prop('disabled', false);

		if(formLevelIndex > userLevel){
			formLevelTooHigh = true;

			$('.levelwarning').html(
				'<p>'
				+ ' <i class="fa fa-warning"></i>'
				+ ' Warning: Because your current access level is not high enough for the ' + name + ' interface,'
				+ ' you will be unable to submit this form.'
				+ ' Please <a href="mailto:/dev/null">request a higher access level</a> or choose a different form level above.'
				+ '</p>'
			);
			$('.levelwarning').slideDown(80);
			$('#haddockform input[type="submit"]').prop('disabled', true);
		}else{
			formLevelTooHigh = false;

			$('.levelwarning').slideUp(80);
			$('#haddockform input[type="submit"]').prop('disabled', false);
		}
	}

	/**
	 * Fold or unfold a section.
	 *
	 * @param section
	 * @param batch if true, do not attempt to animate folding
	 */
	function toggleSection(section, batch){
		var toggleButton = $(section).find('header > .togglebutton')[0];

		if($(section).hasClass('folded')){
			$(toggleButton).removeClass('fa-angle-double-up');
			$(toggleButton).addClass('fa-angle-double-down');
			$(section).removeClass('folded');
			if(batch === true)
				$($(section).find('.content')[0]).show();
			else
				$($(section).find('.content')[0]).slideDown(80);
		}else{
			$(toggleButton).removeClass('fa-angle-double-down');
			$(toggleButton).addClass('fa-angle-double-up');
			$(section).addClass('folded');
			if(batch === true)
				$($(section).find('.content')[0]).hide();
			else
				$($(section).find('.content')[0]).slideUp(80);
		}
	}

	/**
	 * Get the amount of components in a component tree by looping through sections recursively.
	 *
	 * @param componentList an array of components
	 * @param callback called with (err, count)
	 */
	function getComponentCount(componentList, callback){
		var count = 0;

		// Loop asynchronously
		async.each(componentList, function(item, f_callback){
			if(item.type === 'section'){
				count++;
				getComponentCount(item.children, function(err, childrenCount){
					count += childrenCount;
					f_callback();
				});
			}else{
				count++;
				f_callback();
			}
		}, function(err){
			callback(err, count);
		});
	};

	/**
	 * Update the loading progressbar with a fraction.
	 *
	 * @param fraction a floating point number (0.0 - 1.0) indicating progress
	 */
	function setProgress(fraction){
		if(fraction > 1)
			fraction = 100;
		else if(fraction < 0)
			fraction = 0;

		var progressbar = $('#progressbar');
		progressbar.removeClass('indeterminate');
		progressbar.css('width', (fraction * 100) + '%');
	}

	/**
	 * Resets an input, select or checkbox group to its default value.
	 *
	 * @param input the element to reset
	 */
	function resetInput(input){
		var buttonSet = $('.buttonset[data-for="'+ $(input).attr('id') +'"]');
		//var row = $(input).parents('.row');
		//input.val(row.attr('data-default'));
		input.val(input.attr('data-default'));

		if(input.is('input[type="text"]')){
			input.val(input.attr('data-default'));
		}else if(input.is('select')){
			input.val(input.attr('data-default'));
		}else if(input.is('.checkgroup')){
			// Now let's just hope the default value doesn't contain double quotes...
			input.find('input[type="radio"][value="' + input.attr('data-default') + '"]').prop('checked', true);
		}

		$(buttonSet).find('i.reset').addClass('invisible');
	}

	/**
	 * Event handler for reset buttons.
	 *
	 * @param e a click event
	 */
	function onResetButton(e){
		var buttonSet = $(this).parent('.buttonset');
		var input = $('#'+buttonSet.data('for'));
		resetInput(input);

		e.preventDefault();
		e.stopPropagation();
	}


	// HTML generators, templates {{{

	// NOTE: Using $('<el>') to create elements and el.attr() to assign
	//       attributes would be a lot more readable, but unfortunately this
	//       is a lot slower than generating HTML strings ourselves.
	//       This also means that we need to attach event handlers separately.

	/**
	 * Render repeat label and reset, add, remove buttons for a form component.
	 *
	 * @param component a section or parameter form component
	 * @param repeatIndex an index number if this is not the first element of a repeated component
	 *
	 * @return a buttonSet div
	 */
	function makeButtonSet(component, repeatIndex){
		if(typeof(repeatIndex) === 'undefined')
			repeatIndex = 0

		var buttonSet = '<div class="buttonset ' + component.type + '-buttons'
			+ (component.type === 'parameter' ? ' table-cell shrink' : ' float-right') + '"'
			+ ' data-for="f_' + component.name + (component.repeat ? '_' + repeatIndex : '') + '">';

		if(component.type === 'parameter'){
			buttonSet += '<i title="Reset to default value (' + component.default
				+ ')" class="reset fa fa-fw fa-undo invisible"></i>';
		}

		buttonSet += '<i title="Remove this ' + (component.type === 'section' ? 'block' : 'value') + '" '
			+ 'class="minus fa fa-fw fa-minus invisible"></i>';
		buttonSet += '<i title="Add a ' + (component.type === 'section' ? 'block' : 'value') + '" '
			+ 'class="plus fa fa-fw fa-plus'
			+ (!component.repeat || component.repeat_max <= repeatIndex ? ' invisible' : '') + '"></i>';

		return buttonSet;
	}

	/**
	 * Create a section component.
	 *
	 * @param the section component to build
	 *
	 * @return a section element
	 */
	function makeSection(component){
		var section = '<section>'
			+ '<header>'
			+ '<i class="togglebutton fa fa-fw fa-lg fa-angle-double-down"></i>'
			+ '<span class="header-text">' + component.label + '</span>'
			+ makeButtonSet(component)
			+ '</header>'
			+ '<div class="content"></div>'
			+ '</section>';

		return section;
	}

	/**
	 * Create a value (input, select, checkbox group) for a parameter component.
	 *
	 * @param component the parameter component
	 * @param repeatIndex an optional index number for repeated parameters
	 *
	 * @return a value element
	 */
	function makeValue(component, repeatIndex){
		var name = component.name;
		if(typeof(repeatIndex) !== 'undefined'){
			name += '_' + repeatIndex;
		}
		var id = 'f_' + name;

		if(component.datatype === 'choice' && component.options.length > 999){
			// Special case for radio buttons
			// TODO
			var input = '<div class="checkgroup table-cell" id="' + id + '" data-default="' + component.default + '">';

			// List all the options
			optLen = component.options.length;
			for(var i=0; i<optLen; i++){
				var checkbox = '<input type="radio" class="parameter" id="' + id + '_' + i + '" '
					+ 'name="' + name + '"' + (component.default === component.options[i] ? ' checked' : '')
					+ ' />';

				var label = '<label for="' + id + '_' + i + '">' + component.options[i] + '</label>';
				input += label;
			}
		}else{
			var idNameDefaultAttrs = 'id="' + id + '" name="' + name + '" ' + 'data-default="' + component.default + '"';

			if(component.datatype === 'choice'){
				var input = '<select class="parameter table-cell" '
					+ idNameDefaultAttrs + '>';
				// Select options
				for(var i=0; i<component.options.length; i++){
					input += '<option value="' + component.options[i] + '"'
						+ (component.default === component.options[i] ? ' selected' : '') + '>'
						+ component.options[i];
				}
				input += '</select>';
			}else if(component.datatype === 'string'){
				var input = '<input type="text" ' + idNameDefaultAttrs + ' value="' + component.default + '" />';
			}else if(component.datatype === 'integer'){
				var input = '<input type="text" pattern="\d*" ' + idNameDefaultAttrs + ' value="' + component.default + '" />';
			}else if(component.datatype === 'float'){
				var input = '<input type="text" pattern="\d*(\.\d+)?" ' + idNameDefaultAttrs + ' value="' + component.default + '" />';
			}else if(component.datatype === 'file'){
				var input = '<input type="file" ' + idNameDefaultAttrs + ' />';
			}else{
				alert('Error: Unknown datatype "' + component.datatype + '"');
				return;
			}
		}

		return input;
	}

	/**
	 * Create a labeled parameter.
	 *
	 * @param component the parameter component to build
	 *
	 * @return an object containing a label and a value div
	 */
	function makeParameter(component){
		var label = '<label for="f_' + component.name + '" title="'
			+ '(' + component.datatype + ') ' + component.name + ' = ' + component.default + '">'
			+ (typeof(component.label) === 'undefined' ? component.name : component.label) + '</label>';

		var value = '<div class="value table"><div class="table-row">';

		if(component.repeat && component.repeat_min == 0){
			// Minimum amount of values is zero, do not render an input
			value += '<input type="text" class="table-cell dummy invisible" disabled />';
		}else{
			value += makeValue(component);
		}

		value += makeButtonSet(component);

		return { 'label': label, 'value': value };
	}

	/**
	 * Create a documentation / standalone paragraph.
	 *
	 * @param component the paragraph component to build
	 *
	 * @return a paragraph element
	 */
	function makeParagraph(component){
		var paragraph = '<p class="documentation">' + component.text + '</p>';

		return paragraph;
	}

	/**
	 * Asynchronously render a list of components and add them to the specified container.
	 *
	 * @param container
	 * @param componentList
	 * @param callback called when done
	 */
	function renderComponents(container, componentList, callback){
		async.eachLimit(componentList, 8, function(item, f_callback){
			var row = '<div class="row';

			if('accesslevels' in item){
				var levelCount = item.accesslevels.length;
				for(var i=0; i<levelCount; i++)
					row += ' level-' + item.accesslevels[i];
			}
			row += '">';

			if(item.type === 'section'){
				var section = $(makeSection(item));

				renderComponents(section.find('> .content'), item.children, function(err){
					window.setTimeout(f_callback, 0);
				});

				row += section[0].outerHTML + '</div>';
				container.append(row);

				componentsRendered++;
				if(!(componentsRendered & 0x0f) || componentsRendered === componentCount){
					setProgress(componentsRendered / componentCount);
					$('#components-loaded').html(componentsRendered);
				}

				return;

			}else if(item.type === 'parameter'){
				var parameter = makeParameter(item);
				row += parameter.label + parameter.value;
			}else if(item.type === 'paragraph'){
				var paragraph = makeParagraph(item);
				row += paragraph;
			}else{
				alert('Unknown component type "' + component.type + '"');
			}

			row += '</div>';

			container.append(row);

			componentsRendered++;
			if(!(componentsRendered & 0x0f) || componentsRendered === componentCount){
				setProgress(componentsRendered / componentCount);
				$('#components-loaded').html(componentsRendered);
			}

			window.setTimeout(f_callback, 0);
		}, function(err){
			callback(err);
		});
	}

	// }}}

	/**
	 * Attach event handlers.
	 * Basically, adds everything to the form that can't be saved in a cache.
	 *
	 * @param c_callback called on completion
	 */
	function finalizeForm(c_callback){
		async.series([
			function(callback){
				// Attach all event handlers here
				// TODO: Put event handlers in separate functions

				$('#haddockform header').click(function(e){
					toggleSection($(this).parent('section'));
				});

				$('#haddockform input[type="text"]').focus(function(e){
					// Automatically select input element contents on focus
					$(this).one('mouseup', function(){
						$(this).select();
						return false;
					})
					$(this).select();
				});

				$('#haddockform input, #haddockform select').change(function(e){
					formHasChanged = true;

					if($(this).is('input') || $(this).is('select')){
						var buttonSet = $('.buttonset[data-for="'+ $(this).attr('id') +'"]');
						if($(this).val() == $(this).attr('data-default')){
							buttonSet.find('.reset').addClass('invisible');
						}else{
							buttonSet.find('.reset').removeClass('invisible');
						}
					}else if($(this).is('.buttongroup')){
						//buttonSet.find('.reset').removeClass('invisible');
					}
				});

				$('#haddockform .buttonset i.reset').click(onResetButton);

				window.setTimeout(callback, 0);
			},
			function(callback){
				renderingDone = true;
				// Fold all sections
				$('#haddockform section').each(function(){ toggleSection(this, true); });
				// Set form level
				setLevel(formLevel, true);
				// Show the form
				$('.loading').addClass('hidden');
				$('#haddockform').removeClass('hidden');
				window.setTimeout(callback, 0);
			}
		], c_callback);
	}

	/**
	 * Build a form with the specified list of components.
	 *
	 * @param components
	 * @param c_callback called on completion
	 */
	function buildForm(components, c_callback){
		console.log('buildForm start');

		$('html').css('cursor', 'progress');

		var formContainer = $('<div>');

		async.series([
			function(callback){
				window.setTimeout(callback, 0);
			},
			function(callback){
				getComponentCount(components, function(err, count){
					componentCount = count;
					$('#components-total').html(componentCount);
					$('#progress-activity').html('Loading form components');
					$('#component-progress, .progress-container').removeClass('hidden');
					setProgress(0);
					window.setTimeout(callback, 0);
				});
			},
			function(callback){
				renderComponents(formContainer, components, function(){
					window.setTimeout(callback, 0);
				});
			},
		], function(){
			$('html').css('cursor', '');
			console.log('buildForm end');
			window.setTimeout(function(){ c_callback(formContainer); }, 0);
		});
	}

	function storeForm(html){
		simpleStorage.deleteKey('haddock_form_version');
		simpleStorage.deleteKey('haddock_form');

		console.log('storing form version: ' + modelVersionTag);
		simpleStorage.set('haddock_form_version', modelVersionTag);
		simpleStorage.set('haddock_form', html);
	}

	function loadForm(forceRenew){
		var storedVersion = simpleStorage.get('haddock_form_version');
		if(typeof(forceRenew) !== 'undefined' && forceRenew){
			console.log('force-refreshing form, dropping html cache');
		}else if(storedVersion === modelVersionTag){
			console.log('stored form html version ' + storedVersion + ' is up to date');
			var form = simpleStorage.get('haddock_form');
		}else if(typeof(storedVersion) !== 'undefined'
				&& storedVersion !== null
				&& storedVersion !== false
				&& storedVersion.length){
			// If only there were a cross-browser method of checking whether a localStorage key exists
			console.log('stored form html version ' + storedVersion + ' is out of date, generating new version '
				+ modelVersionTag);
		}else{
			console.log('no valid form cache found, generating new form version ' + modelVersionTag);
		}

		if(typeof(form) === 'undefined' || form === null || form === false || !form.length){
			async.waterfall([
				function(callback){
					buildForm(formComponents, function(result){ callback(null, result); });
				},
				function(result, callback){
					$('#haddockform > .content').html(result);
					storeForm(result.html());
					finalizeForm();
				}
			]);
		}else{
			$('#haddockform > .content').html(form);
			finalizeForm();
		}
	}

	$('.levelchooser li').click(function(e){
		// TODO: Enable after form loading
		setLevel($(this).data('name'));
	});

	/*

	$('.buttonset i.plus').click(function(e){
		// TODO

		// Stop click events from reaching the header and folding this section
		e.preventDefault();
		e.stopPropagation();
	});

	$('.buttonset i.minus').click(function(e){
		// TODO

		e.preventDefault();
		e.stopPropagation();
	});*/

	setTimeout(function(){
		// Don't load from localStorage cache if the query string contains "nocache".
		// Note: Doing an indexOf on the entire query string is a bit hacky,
		//       but we do not have any other parameters, so it's OK for now.
		if(window.location.search.indexOf('nocache') === -1)
			loadForm();
		else
			loadForm(true);
	}, 0);
});
