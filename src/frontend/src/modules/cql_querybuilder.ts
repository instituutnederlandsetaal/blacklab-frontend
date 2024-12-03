import 'jquery-extendext';
import 'jquery-ui';
import 'jquery-ui/ui/widgets/sortable';

import $ from 'jquery';
import * as Mustache from 'mustache';

import {parseBcql, BinaryOp as CQLBinaryOp, Attribute as CQLAttribute, Result} from '@/utils/bcql-json-interpreter';
import {debugLog} from '@/utils/debug';

import {RecursivePartial} from '@/types/helpers';

import '@/modules/cql_querybuilder.scss';
import { escapeRegex } from '@/utils';

/**
 * The querybuilder is a visual editor for CQL queries (see http://inl.github.io/BlackLab/corpus-query-language.html#supported-features for an introduction to CQL)
 * The querybuilder is a hierarchy of nested objects, where every object is represented by its own isolated container in the DOM.
 *
 * At the top is the QueryBuilder itself, it contains/manages Tokens
 * Every token representes a '[]' block within CQL, and contains one or more (potentially nested) AttributeGroups.
 * An AttributeGroup is a nesting structure containing a mix of other AttributeGroups and Attributes.
 *  It essentially represents a pair of brackets '()' in which Attributes are combined using OR/AND (though this is configurable)
 *  It also contains a few buttons for adding/removing Attributes within the group.
 * The Attribute is the real meat, it configures the requirements a single Token needs to meet to be matched by the query.
 *  It contains a selector (usually for Part of Speech/Lemma/Word, though this is configurable), a comparator (like equals/not equals/starts with/ends with, also configurable)
 *  and a value to compare it to.
 *
 * Mustache.js is used to generate the DOM elements for the components, the templates are based on bootstrap.
 * Every component attaches a reference to itself to the DOM element through $.data.
 *
 * Every object defines the functions _createElement() and _prepareElement(), these are used to generate the dom structure and attach event handlers respectively.
 * Also present is a getCql() function that recurses into all child elements, calls getCql on them, and
 * combines their parts of the query to gradually build up the complete query.
 *
 *
 * When genering a CQL query, the state of the builder is read from the DOM, so simply removing an element from the DOM removes it from the query.
 */

/**
 * These are the mustache.js templates.
 * They are grouped at the top by the component type: token, attributeGroup, attribute, operatorLabel (the OR/AND labels in between attributes)
 * When rendering the component, 3 parts are required, the "template", "partials", and the "view", the template is the entry point for rendering.
 * It can render sub elements defined in the "partials" object using {{>key_in_partial_object}}.
 * Finally dynamic values can be inserted from the "view" object using {{key_in_view_object}}.
 * Some partials and view data is used in several different components, rather than copying it, these shared
 * partials and view data are defined in the "shared" key in the templates and view objects here,
 * and are merged into the element-specific partials and views in the _createElement function for the element in question.
 *
 * Since the view is dynamic data (labels, supported operators, supported word attributes etc.),
 * it can be overridden externally.
 * To support this, a custom settings object can be passed when initially creating the querybuilder instance.
 * This object must follow the structure of "DEFAULTS", the custom settings object will override properties with the same name in DEFAULTS, including the mustache view data object.
 */
const templates = {

	queryBuilder: {
		template: `
			<div class="bl-token-container">
				{{>createTokenButton}}
			</div>
			{{>withinSelect}}
			{{>modalEditor}}
		`,

		partials: {
			createTokenButton: `
				<button type="button" class="btn btn-primary bl-token-create bl-prevent-sort" title="{{i18n:createTokenButton_label}}"><span class="glyphicon glyphicon-plus"></span></button>
			`,

			modalEditor: `
				<div class="bl-modal-editor modal fade" tabindex="-1" role="dialog">
					<div class="modal-dialog" role="document">
						<div class="modal-content">
							<div class="modal-header">
								<button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
								<h4 class="modal-title">{{i18n:modalEditor_title}}</h4>
							</div>
							<div class="modal-body">
								<textarea class="form-control" rows="10" style="width:100%;overflow:auto;resize:none;white-space:pre;"></textarea>
							</div>
							<div class="modal-footer">
								<button type="button" class="btn btn-primary pull-left" data-dismiss="modal" data-discard-value>{{i18n:modalEditor_clear}}</button>
								<button type="button" class="btn btn-default" data-dismiss="modal">{{i18n:modalEditor_cancel}}</button>
								<button type="button" class="btn btn-primary" data-dismiss="modal" data-save-edits>{{i18n:modalEditor_save}}</button>
							</div>
						</div>
					</div>
				</div>
			`,

			withinSelect: `
				{{#withinSelectOptions.0}}
				<label>{{i18n:withinSelect_label}}</label>
				<div class="btn-group bl-within-select clearfix" data-toggle="buttons" style="display:block;">
				{{/withinSelectOptions.0}}
					{{#withinSelectOptions}}
						<label class="btn btn-default">
							<input type="radio" autocomplete="off" name="within" value="{{value}}">{{label}}
						</label>
					{{/withinSelectOptions}}
				{{#withinSelectOptions.0}}
				</div>
				{{/withinSelectOptions.0}}
			`,
		},
	},

	token: {
		template: `
			<div class="panel panel-primary bl-token" id="{{currentId}}">
				{{>head_root}}
				{{>body_root}}
			</div>
		`,

		partials: {
			head_root: `
				<div class="panel-heading clearfix">
					{{>head_handle}}
					{{>head_deleteButton}}
					{{>head_cqlPreview}}
				</div>
			`,
			head_handle: `
				<span class="glyphicon glyphicon-resize-horizontal bl-sort-handle" style="margin-right:5px;" title="{{i18n:token_head_handle_title}}"></span>
			`,
			head_deleteButton: `
				<button type="button" class="close" area-label="delete" title="{{i18n:token_head_deleteButton_title}}"><span aria-hidden="true">&times;</span></button>
			`,

			head_cqlPreview: `
				<span id="{{currentId}}_cql_preview">Generated cql will appear here.</span>
			`,

			body_root: `
				<div class="panel-body" id="{{currentId}}_panel_body">
					{{>body_tab_header}}
					{{>body_tab_container}}
				</div>
			`,

			body_tab_header: `
				<ul class="nav nav-tabs">
					<li class="active"><a data-toggle="tab" href="#{{currentId}}_tab_attributes">{{i18n:body_tab_header_search}}</a></li>
					<li><a data-toggle="tab" href="#{{currentId}}_tab_properties">{{i18n:body_tab_header_properties}}</a></li>
				</ul>
			`,
			body_tab_container: `
				<div class="tab-content">
					{{>body_tab_attributes}}
					{{>body_tab_properties}}
				</div>
			`,

			body_tab_attributes: `
				<div id="{{currentId}}_tab_attributes" class="tab-pane active" style="padding: 25px 15px;">
				</div>
			`,

			body_tab_properties: `
				<div id="{{currentId}}_tab_properties" class="tab-pane" style="padding: 10px 15px 25px 15px;">
					<div class="checkbox">
						<label title="{{i18n:body_tab_properties_optional_title}}"><input type="checkbox" id="{{currentId}}_property_optional">{{i18n:body_tab_properties_optional}}</label>
					</div>
					<div class="checkbox">
						<label title="{{i18n:body_tab_properties_beginOfSentence_title}}"><input type="checkbox" id="{{currentId}}_property_sentence_start">{{i18n:body_tab_properties_beginOfSentence}}</label>
					</div>
					<div class="checkbox">
						<label title="{{i18n:body_tab_properties_endOfSentence_title}}"><input type="checkbox" id="{{currentId}}_property_sentence_end">{{i18n:body_tab_properties_endOfSentence}}</label>
					</div>
					<div class="input-group" style="width:318px;">
						<span class="input-group-addon">{{i18n:body_tab_properties_repeats_label}}</span>
						<input type="text" class="form-control" value="1" id="{{currentId}}_property_repeats_min">
						<span class="input-group-addon" style="border-left-width:0px; border-right-width:0px;">{{i18n:body_tab_properties_repeats_to}}</span>
						<input type="text" class="form-control" value="1" id="{{currentId}}_property_repeats_max">
						<span class="input-group-addon">{{i18n:body_tab_properties_repeats_times}}</span>
					</div>
				</div>
			`,
		}
	},

	attributeGroup: {
		template: `
			<div class="well bl-token-attribute-group" id="{{currentId}}">
				{{>create_attribute_dropdown}}
			</div>
		`,
		partials: {}
	},

	attribute: {
		template: `
			<div class="bl-token-attribute" id="{{currentId}}">
				<div class="bl-token-attribute-main">
					{{>delete_attribute_button}}
					<select data-attribute-role="type" class="selectpicker" data-width="75px" data-container="body" data-style="btn btn-sm btn-default bl-no-border-radius-right">
						{{#attributes}}
						{{#groupname}}
							<optgroup label="{{groupname}}">
							{{#options}}
								<option value="{{attribute}}">{{label}}</option>
							{{/options}}
							</optgroup>
						{{/groupname}}
						{{^groupname}}
							<option value="{{attribute}}">{{label}}</option>
						{{/groupname}}
						{{/attributes}}
					</select>
					<select data-attribute-role="operator" class="selectpicker" data-width="50px"; data-container="body" data-style="btn btn-sm btn-primary bl-selectpicker-hide-caret bl-no-border-radius">
						{{#comparators}}
						<optgroup>
							{{#.}}
							<option value="{{value}}">{{label}}</option>
							{{/.}}
						</optgroup>
						{{/comparators}}
					</select>
					{{>main_input}}
					{{>create_attribute_dropdown}}
				</div>
				{{#attributes}}{{#caseSensitive}}
				<div data-attribute-type="{{attribute}}" style="display:none;">
					<div class="checkbox">
						<label>
							<input data-attribute-role="case" type="checkbox">
							{{i18n:attribute_caseAndDiacriticsSensitive}}
						</label>
					</div>
				</div>
				{{/caseSensitive}}{{/attributes}}
			</div>
		`,

		partials: {
			delete_attribute_button: `
				<span data-attribute-role="delete" class="glyphicon glyphicon-remove text-primary" style="flex-grow:0;cursor:pointer;" title="{{i18n:attribute_delete_attribute_button_title}}"></span>
			`,

			main_input: `
				<div class="bl-has-file-hidden bl-token-attribute-main-input-container">
					{{#attributes}}
					{{#groupname}}{{#options}}{{>main_input_value}}{{/options}}{{/groupname}}
					{{^groupname}}{{>main_input_value}}{{/groupname}}
					{{/attributes}}
				</div>
				{{>main_input_file_controls}}
			`,

			main_input_value: `
				<div class="bl-token-attribute-main-input" data-attribute-type="{{attribute}}">
					{{#values.0}}
						{{>main_input_select}}
					{{/values.0}}
					{{^values.0}}
						{{>main_input_original}}
					{{/values.0}}
				</div>
			`,

			main_input_file_controls: `
				<label class="bl-has-file-hidden btn btn-sm btn-default bl-no-border-radius bl-input-upload-button" title="{{i18n:attribute_file_upload_button_title}}">
					<input data-attribute-role="file" type="file" accept="text/*" class="bl-input-upload" title="{{i18n:attribute_file_upload_button_title}}">
					<span class="glyphicon glyphicon-open"></span>
				</label>

				<button data-attribute-role="edit"  type="button" class="bl-has-file-shown btn btn-sm btn-default bl-no-border-radius" title="{{i18n:attribute_file_upload_edit_button_title}}" style="background-color:#ffa;">loading...</button>
				<button data-attribute-role="clear" type="button" class="bl-has-file-shown btn btn-sm btn-default bl-no-border-radius" title="{{i18n:attribute_file_upload_clear_button_title}}" style="border-left:none;"><span class="fa fa-times"></span></button>
			`,

			main_input_original: `
				<input
					data-attribute-role="value"
					type="text"
					class="form-control input-sm bl-no-border-radius bl-has-file-hidden"
					style="min-width:110px; width:0;"
					{{#textDirection}}dir="{{textDirection}}"{{/textDirection}}
				>
			`,

			// TODO rtl not supported for Bootstrap-Select (https://github.com/snapappointments/bootstrap-select/issues/862)
			main_input_select: `
				<select data-attribute-role="value" multiple class="selectpicker" data-style="btn btn-default btn-sm bl-no-border-radius" data-container="body" data-live-search="true">
					{{#values}}
					<option value="{{value}}">{{label}}</option>
					{{/values}}
				</select>
			`,
		}
	},

	operatorLabel: {
		template: `
			<div class="bl-token-attribute-group-label">
				{{label}}
			</div>
		`,

		partials: {}
	},

	shared: {
		partials: {
			create_attribute_dropdown: `
				<div class="dropup bl-create-attribute-dropdown">
					<button type="button" class="btn btn-sm btn-default dropdown-toggle" data-toggle="dropdown" title="{{i18n:attribute_create_button_title}}"><span class="glyphicon glyphicon-plus"></span>&#8203;</button>
					<ul class="dropdown-menu">
						{{#operators}}
						<li><a href="#" onclick="$(this).trigger('cql:attribute:create', { operator: '{{operator}}', operatorLabel: '{{label}}' }); return false;">
							<span class="glyphicon glyphicon-plus-sign text-success"></span> {{label}}</a></li>
						{{/operators}}
					</ul>
				</div>
			`,
		}
	}
};

export type AttributeDef = {
	attribute: string;
	label: string;
	caseSensitive: boolean;
	textDirection: undefined|'ltr'|'rtl';
	values: undefined|Array<{
		value: string;
		label?: string;
	}>;
};

const DEFAULTS = {

	queryBuilder: {
		view: {
			// The first option is automatically selected on init
			// Empty value will omit the "within" tag from the query, essentially serving as a default option
			// Syntax to transform the value into <value/> is inserted when the query is generated
			withinSelectOptions: [
				{value:'',  label:'document'},
				{value:'p', label:'paragraph'},
				{value:'s', label:'sentence'},
			]
		}
	},

	attribute: {
		view: {
			comparators: [
				[
					{value:'=', 	label:'='},
					{value:'!=', 	label:'≠'}
				],
				[
					{value:'starts with', 	label: 'starts with'},
					{value:'ends with', 	label: 'ends with'}
				]
			],
			attributes: [
				{
					attribute: 'word',
					label: 'word',
					caseSensitive: true,
					textDirection: undefined,
					values: undefined
				},
				{
					attribute: 'lemma',
					label: 'lemma',
					caseSensitive: true,
					textDirection: undefined,
					values: undefined
				},
				{
					attribute: 'pos',
					label: 'Part of speech',
					caseSensitive: false,
					textDirection: undefined,
					values: undefined
				}
			] as Array<AttributeDef | { groupname: string; options: AttributeDef[]}>,

			defaultAttribute: 'word'
		},

		getCql (attribute: string, comparator: string, caseSensitive: boolean, values: string[]) {
			switch (comparator) {
			case 'starts with':
				comparator = '=';
				values = $.map(values, function(elem/*, index*/) {
					return elem + '.*';
				});
				break;
			case 'ends with':
				comparator = '=';
				values = $.map(values, function(elem/*, index*/) {
					return '.*' + elem;
				});
				break;
			default:
				break;
			}

			return attribute + ' ' + comparator + ' "' + (caseSensitive ? '(?-i)' : '') + values.join('|') + '"';
		}
	},

	token: {
		view: {},
		rootOperator: { operator: '&', label: 'AND' }
	},

	attributeGroup: {
		view: {}
	},

	shared: {
		view: {
			operators: [
				{operator: '&', label: 'AND'},
				{operator: '|', label: 'OR'}
			]
		},
	}
};

export type QueryBuilderOptions = RecursivePartial<typeof DEFAULTS>;

// -------------------
// Class Querybuilder
// -------------------

function renderI18n(template: string, view: any, partials: any, i18n: Vue) {
	const i18nView = new Proxy(view, {
		get(target, prop) {
			if (typeof prop === 'string' && prop.startsWith('i18n:')) {
				// dots are hardcoded to be separators in mustache, so use underscores in the i18n keys
				const key = prop.slice(5);
				return i18n.$t(`search.advanced.queryBuilder.${key}`).toString();
			}
			return target[prop];
		}
	})

	return Mustache.render(template, i18nView, partials);
}


export class QueryBuilder {
	public settings: typeof DEFAULTS;
	public element: JQuery<HTMLElement>; // TODO private and expose update function
	private createTokenButton: JQuery<HTMLElement>;
	public modalEditor: JQuery<HTMLElement>;
	private withinSelect: JQuery<HTMLElement>;
	public i18n: Vue;

	constructor($rootElement: JQuery<HTMLElement>, options: QueryBuilderOptions, i18n: Vue) {
		this.i18n = i18n;
		// Use extendext so arrays in the defaults are replaced instead of merged with those in options
		this.settings = $.extendext(true, 'replace', {}, DEFAULTS, options);
		this._prepareElement($rootElement);

		this.element = $rootElement;
		this.createTokenButton = $rootElement.find('.bl-token-create');
		this.modalEditor = this.element.find('.bl-modal-editor');
		this.withinSelect = this.element.find('.bl-within-select');

		this.createTokenButton.click();
	}

	private _prepareElement($element: JQuery<HTMLElement>) {
		$element
			.html(renderI18n(templates.queryBuilder.template, this.settings.queryBuilder.view, templates.queryBuilder.partials, this.i18n))
			.data('builder', this)
			.addClass('bl-querybuilder-root');

		// Enable sorting tokens within the container
		($element.find('.bl-token-container') as any).sortable({
			items: '>*:not(.bl-prevent-sort)',
			handle: '.bl-sort-handle',
			placeholder: 'bl-sort-placeholder-token',
			forcePlaceholderSize: true,

			cursor: 'move',
			tolerance: 'pointer',

			start (e: JQuery.Event, ui: any) {
				ui.placeholder.height(ui.helper.outerHeight());
				ui.placeholder.width(ui.helper.outerWidth());
			},
			update () {
				$element.trigger('cql:modified');
			}
		});

		$element.find('.bl-token-create').on('click', this.createToken.bind(this));
		$element.find('.bl-within-select')
			.on('change', function() { $element.trigger('cql:modified'); })
			.find('input').first().attr('checked', 'checked')
			.parent().addClass('active');

		this.element = $element;
		this.createTokenButton = $element.find('.bl-token-create');
		this.modalEditor = this.element.find('.bl-modal-editor');
		this.withinSelect = this.element.find('.bl-within-select');

		return $element;
	}

	// create a new token and insert it in the root container
	public createToken() {
		const token = new Token(this);

		token.element.insertBefore(this.createTokenButton);
		this.element.trigger('cql:modified');

		return token;
	}

	public getTokens(): Token[] {
		return this.element.children('.bl-token-container').children('.bl-token').map(function(i, elem) {
			return $(elem).data('token');
		}).get();
	}

	public getCql() {
		const cqlParts: string[] = [];

		this.element.find('.bl-token').each(function(index, element) {
			cqlParts.push($(element).data('token').getCql());
		});

		const within = this.withinSelect.find('input:checked').first().val() as string;
		if (within) { // ignore empty and null
			cqlParts.push('within', '<'+ within+'/>');
		}

		return cqlParts.join(' ') || null;
	}

	// When setting 'within', val should only be the name, without surrounding </>
	public set(controlName: 'within', val: string) {
		switch (controlName) {
		case 'within': {
			// Parent because bootstrap is expects us to call .button on the wrapper label...
			this.withinSelect.find('input[value="'+val+'"]').parent().button('toggle');
			break;
		}
		default:
			break;
		}
	}

	public reset() {
		this.element.find('.bl-token').remove();
		this.createToken();
		this.withinSelect.find('input').first().parent().button('toggle');
	}

	/** Rerender this querybuilder, for example when selected locale has changed. */
	public refresh(settings?: QueryBuilderOptions) {
		const cur = this.getCql();
		const newRoot = $('<div></div>');
		const currentClasses = this.element[0].classList;
		currentClasses.forEach(c => newRoot[0].classList.add(c));
		this.element.replaceWith(newRoot);
		this.settings = $.extendext(true, 'replace', {}, this.settings, settings);

		this._prepareElement(newRoot);
		this.parse(cur);
	}

	public async parse(cql: string|null): Promise<boolean> {
		if (cql === null) {
			this.reset();
			return true;
		} else if (!cql) {
			return false;
		}

		try {
			const parallelQueries = (await parseBcql(INDEX_ID, cql, this.settings.attribute.view.defaultAttribute));
			if (parallelQueries.length !== 1) {
				debugLog('Cql parser could not decode query pattern', cql);
				return false;
			}
			return populateQueryBuilder(this, parallelQueries[0]);
		} catch (e) {
			// couldn't decode query
			debugLog('Cql parser could not decode query pattern', e, cql);
			return false;
		}
	}
}

// ----------
// Class Token
// ----------

export class Token {
	public readonly id = generateId('token');
	private readonly idSelector = '#' + this.id;
	public readonly element;
	private readonly $controls;
	public readonly rootAttributeGroup;

	constructor(private readonly builder: QueryBuilder) {
		this.element = this._createElement();
		this.$controls =  {
			optional: this.element.find(this.idSelector + '_property_optional'),
			minRepeats: this.element.find(this.idSelector + '_property_repeats_min'),
			maxRepeats: this.element.find(this.idSelector + '_property_repeats_max'),
			beginOfSentence: this.element.find(this.idSelector + '_property_sentence_start'),
			endOfSentence: this.element.find(this.idSelector + '_property_sentence_end')
		};
		this.rootAttributeGroup = this._createRootAttributeGroup();
		this.rootAttributeGroup.createAttribute();
	}

	private _createElement() {
		const view = $.extend({}, this.builder.settings.token.view, { currentId: this.id });
		const $element = $(renderI18n(templates.token.template, view, templates.token.partials, this.builder.i18n));

		$element.data('token', this);
		$element.find('input, textarea').on('change', function() {
			$element.trigger('cql:modified');
		});

		const self = this;
		$element.find('.close').on('click', function() {
			$element.remove();
			self.builder.element.trigger('cql:modified');
		});

		$element.on('cql:modified', this._updateCql.bind(this));
		return $element;
	}

	private _createRootAttributeGroup() {
		const group = new AttributeGroup(this.builder, this.builder.settings.token.rootOperator.operator, this.builder.settings.token.rootOperator.label);
		group.element.removeClass('well');
		group.element.appendTo(this.element.find(this.idSelector + '_tab_attributes'));
		group.isRoot = true;

		return group;
	}

	private _updateCql() {
		const $cqlPreviewElement = this.element.find(this.idSelector + '_cql_preview');
		const $tokenPanelHeading = this.element.find('.panel-heading');
		const $tokenPanelBody = this.element.find('.panel-body');

		let cqlString = this.getCql();
		if (cqlString.length > 250) {
			cqlString = cqlString.slice(0, 245) + '…';
		}
		$cqlPreviewElement.text(cqlString);

		// Set an explicit max-width to our header (containing the CQL preview string)
		// Why? because otherwise text won't wrap and the token could become very wide for long queries.
		// We want the token body to control the width of the entire token, and the token head to expand and contract together with the token body.
		// There is no way to do this cleanly in pure css currently.
		// We also need to take care to set a default when this code runs while the element isn't visible, or isn't attached to the DOM.
		// When this happens, jquery doesn't return a sensible outerWidth value for our body.
		// we can't know if the token body is wider than this default (currently 348px), so it will be wrong if the token body is wider than a usual empty token, but this is rare.
		const width = $tokenPanelBody.outerWidth() || 0;
		$tokenPanelHeading.css({
			'width': '100%',
			'max-width': Math.max(width, 348) + 'px'
		});
	}

	public set(controlName: keyof Token['$controls'], val: string|boolean|number|null|undefined) {
		if (this.$controls[controlName]) {
			setValue(this.$controls[controlName], val);
		}
	}

	public getCql() {
		const optional = this.$controls.optional.prop('checked');
		let minRepeats = parseInt(this.$controls.minRepeats.val() as string, 10);
		let maxRepeats = parseInt(this.$controls.maxRepeats.val() as string, 10);
		const beginOfSentence = this.$controls.beginOfSentence.prop('checked');
		const endOfSentence = this.$controls.endOfSentence.prop('checked');

		const outputParts = [] as string[];

		if (beginOfSentence) {
			outputParts.push('<s> ');
		}

		outputParts.push('[');
		outputParts.push(this.rootAttributeGroup.getCql());
		outputParts.push(']');

		if (!isNaN(minRepeats) || !isNaN(maxRepeats)) { // Only output when at least one of them is entered
			minRepeats = minRepeats || 0;			// Set some default values in case of omitted field
			maxRepeats = maxRepeats || Infinity;

			if (minRepeats < maxRepeats) {
				if (maxRepeats !== Infinity) { // infinite is empty field instead of max value
					if (minRepeats === 0 && maxRepeats === 1) {
						outputParts.push('?');
					} else {
						outputParts.push('{'+minRepeats+','+maxRepeats+'}');
					}
				} else {
					if (minRepeats === 0) {
						outputParts.push('*');
					} else if (minRepeats === 1) {
						outputParts.push('+');
					} else {
						outputParts.push('{'+minRepeats+',}');
					}
				}
			} else if (minRepeats === maxRepeats && minRepeats !== 1) { // 1 is the default so if min == max == 1 then we don't need to do anything
				outputParts.push('{'+minRepeats+'}');
			}
		}

		if (optional && minRepeats !== 0) {
			outputParts.push('?');
		}

		if (endOfSentence) {
			outputParts.push(' </s>');
		}

		return outputParts.join('');
	}
}

// ---------------------
// Class AttributeGroup
// ---------------------

export class AttributeGroup {
	private readonly builder: QueryBuilder;
	private readonly id = generateId('attribute_group');
	private readonly idSelector = '#' + this.id;

	public operator: string; // todo type according to passed in settings
	public operatorLabel: string;
	public element: JQuery<HTMLElement>;
	public isRoot: boolean = false; // set from parent

	constructor(parentBuilder: QueryBuilder, operator: string, operatorLabel: string) {
		this.builder = parentBuilder;
		const id = generateId('attribute_group');
		this.operator = operator;
		this.operatorLabel = operatorLabel;
		this.element =  this._createElement(id);
	}

	private _createElement(id: string) {
		const view = $.extend({}, this.builder.settings.shared.view, this.builder.settings.attributeGroup.view, { currentId: id });
		const partials = $.extend({}, templates.shared.partials, templates.attributeGroup.partials);

		const $element = $(renderI18n(templates.attributeGroup.template, view, partials, this.builder.i18n));
		this._prepareElement($element);
		return $element;
	}

	private _prepareElement($element: JQuery<HTMLElement>) {
		$element.data('attributeGroup', this);
		$element.on('cql:modified', this._updateLabels.bind(this));
		$element.on('cql:attribute:create', this._createAttribute.bind(this));
	}

	private _createAttribute(attributeCreateEvent: JQuery.TriggeredEvent, data: {operator: string, operatorLabel: string}) {
		// The attribute for which the create button was clicked (if null, the button was our own button)
		const originAttribute: Attribute|undefined = $(attributeCreateEvent.target).parents('.bl-token-attribute').data('attribute');

		const newAttribute = new Attribute(this.builder);
		let newGroup: AttributeGroup|undefined;

		/*
		* If the new attribute was created at the bottom of the group, wrap all existing attributes inside a new group
		* then swap this group's operator to the new operator, and append the new attribute
		*/

		// we can just swap the operator if this contains only 1 attribute
		if (this.element.children('.bl-token-attribute, .bl-token-attribute-group').length <= 1) {
			this.operator = data.operator;
			this.operatorLabel = data.operatorLabel;
		}

		// Construct a new group and put the new operator in there together with the one that triggered the creation (if any)
		if (data.operator !== this.operator) {
			newGroup = new AttributeGroup(this.builder, data.operator, data.operatorLabel);
			if (originAttribute) {
				// Create a new group with the original attribute, and the new attribute
				// at the position of the original attribute
				this.addAttributeOrGroup(newGroup, originAttribute);
				newGroup.addAttributeOrGroup(newAttribute);
				newGroup.addAttributeOrGroup(originAttribute);
			} else {
				// Create a new group, put in everything inside this group
				// Then swap our operator and add the new attribute
				$(this.element.children('.bl-token-attribute, .bl-token-attribute-group').get().reverse()).each(function(index, element) {
					const instance: Attribute|AttributeGroup = $(element).data('attribute') || $(element).data('attributeGroup');
					newGroup!.addAttributeOrGroup(instance);
				});

				this.addAttributeOrGroup(newGroup);
				this.addAttributeOrGroup(newAttribute, newGroup);
				newGroup.operator = this.operator;
				newGroup.operatorLabel = this.operatorLabel;
				this.operator = data.operator;
				this.operatorLabel = data.operatorLabel;
			}
		} else {
			if (originAttribute) { // Insert below existing attribute
				this.addAttributeOrGroup(newAttribute, originAttribute);
			} else { // Append at end of this group
				const $lastChild = this.element.children('.bl-token-attribute, .bl-token-attribute-group').last();
				const lastChildData = $lastChild.data('attributeGroup') || $lastChild.data('attribute');

				this.addAttributeOrGroup(newAttribute, lastChildData);
			}
		}

		this._updateLabels();
		if (newGroup) {
			newGroup._updateLabels();
		}

		this.element.trigger('cql:modified');
		return false;
	}

	public _removeIfEmpty() {
		const $children = this.element.children('.bl-token-attribute, .bl-token-attribute-group');
		const parentGroup: AttributeGroup = this.element.parent().data('attributeGroup');
		const self = this;

		if (this.isRoot) {
			// Never hide root group, should be able to contain 0 members to indicate "[]", or any word
			return;
		}

		if ($children.length <= 1) {
			// Move children before removing this, so we can give them the correct index based on this
			$children.each(function(index, element) {
				const instance: Attribute|AttributeGroup = $(element).data('attributeGroup') || $(element).data('attribute');
				parentGroup.addAttributeOrGroup(instance, self);
			});

			this.element.remove();
			parentGroup._updateLabels();
			parentGroup.element.trigger('cql:modified');
		}
	}

	private _updateLabels() {
		this.element.children('.bl-token-attribute-group-label').remove();

		const self = this;
		this.element.children('.bl-token-attribute, .bl-token-attribute-group').each(function(index, element) {
			const $newLabel = $(renderI18n(templates.operatorLabel.template, {label: self.operatorLabel}, templates.operatorLabel.partials, self.builder.i18n));
			$newLabel.insertAfter(element);
		});
		this.element.children('.bl-token-attribute-group-label').last().remove();
	}

	public createAttribute() {
		const attribute = new Attribute(this.builder);
		this.addAttributeOrGroup(attribute);
		return attribute;
	}

	public createAttributeGroup(operator: string, operatorLabel: string) {
		const attributeGroup = new AttributeGroup(this.builder, operator, operatorLabel);
		this.addAttributeOrGroup(attributeGroup);
		return attributeGroup;
	}

	// if no preceding attribute, insertion will be at the front of this group
	public addAttributeOrGroup(attributeOrGroup: Attribute|AttributeGroup, precedingAttributeOrGroup?: AttributeGroup|Attribute) {
		if (precedingAttributeOrGroup && precedingAttributeOrGroup.element.parent()[0] !== this.element[0]) {
			throw new Error('AttributeGroup.addAttributeOrGroup: precedingAttributeOrGroup is not a child of this group');
		}

		const oldParentGroup = attributeOrGroup.element.parent().data('attributeGroup');

		if (precedingAttributeOrGroup) {
			attributeOrGroup.element.insertAfter(precedingAttributeOrGroup.element);
		} else  {
			attributeOrGroup.element.prependTo(this.element);
		}

		this.element.trigger('cql:modified');
		if (oldParentGroup) {
			oldParentGroup.element.trigger('cql:modified');
		}
	}

	/* Get the object instances for all direct child attributes */
	public getAttributes(): Attribute[] {
		return this.element.children('.bl-token-attribute').map(function(i, el) {
			return $(el).data('attribute');
		}).get();
	}

	/* Get the object instances for all direct child attribute groups */
	public getAttributeGroups(): AttributeGroup[] {
		return this.element.children('.bl-token-attribute-group').map(function(i, el) {
			return $(el).data('attributeGroup');
		}).get();
	}

	public getCql() {
		const cqlStrings = [] as string[];

		this.element.children('.bl-token-attribute, .bl-token-attribute-group').each(function(index, element) {
			const instance = $(element).data('attributeGroup') || $(element).data('attribute');
			if (!instance)
				console.error('AttributeGroup.getCql: element has no data-attributeGroup or data-attribute', element);
			const elemCql = instance.getCql();

			if (elemCql && elemCql !== '') { // Do not push null, undefined or empty strings
				cqlStrings.push(elemCql);
			}
		});

		const joinedCql = cqlStrings.join(' ' + this.operator + ' ');
		if (this.isRoot) {
			return joinedCql;
		} else {
			return '(' + joinedCql  + ')';
		}
	}
}

// ----------------
// Class Attribute
// ----------------

export class Attribute {
	private readonly builder: QueryBuilder;
	private readonly id = generateId('attribute');
	private readonly idSelector = '#' + this.id;
	public readonly element: JQuery<HTMLElement>;
	private readonly $controls: {
		type: JQuery<HTMLSelectElement>;
		operator: JQuery<HTMLSelectElement>;
	};

	private uploadedValue = null as string|null;

	constructor(builder: QueryBuilder) {
		this.builder = builder;
		this.element = this._createElement();

		this.$controls = {
			type: this.element.find('[data-attribute-role="type"]') as JQuery<HTMLSelectElement>,
			operator: this.element.find('[data-attribute-role="operator"]') as JQuery<HTMLSelectElement>,
			// value_simple: this.element.find(this.idSelector + '_value_simple') as JQuery<HTMLInputElement>,
			// value_file: this.element.find(this.idSelector + '_value_file') as JQuery<HTMLInputElement>,
		};

		this._updateShownOptions(this.builder.settings.attribute.view.defaultAttribute);
	}

	private _createElement() {
		const view = $.extend({}, this.builder.settings.shared.view, this.builder.settings.attribute.view, { currentId: this.id });
		const partials = $.extend({}, templates.shared.partials, templates.attribute.partials);

		const $element = $(renderI18n(templates.attribute.template, view, partials, this.builder.i18n));
		this._prepareElement($element);
		return $element;
	}

	private _prepareElement($element: JQuery<HTMLElement>) {
		const self = this;
		$element.data('attribute', this);

		$element.on('click', '[data-attribute-role="delete"]', function() {
			const parentGroup = self.element.parent().data('attributeGroup') as AttributeGroup;
			// Remove the selectpickers first so they can gracefully tear down, prevents unclosable menu when deleting attribute with a dropdown open
			self.element.find('.selectpicker').each(function() { $(this).selectpicker('destroy'); });
			self.element.detach();
			parentGroup._removeIfEmpty();
			parentGroup.element.trigger('cql:modified');
		});

		// Show/hide elements for the selected attribute type
		// Such as case-sensitivity checkbox or comboboxes for when there is a predefined set of valid values
		$element.on('change', '[data-attribute-role="type"]', function() {
			const selectedValue = $(this).val() as string;
			self._updateShownOptions(selectedValue);
		});

		$element.on('change', '[data-attribute-role="file"]', this._onUploadChanged.bind(this));
		$element.on('click', '[data-attribute-role="edit"]', this._showModalEditor.bind(this));
		$element.on('click', '[data-attribute-role="clear"]', () => {
			$element.find('[data-attribute-role="file"]').val('').trigger('change');
		});

		$element.find('[data-attribute-role="type"]').val(self.builder.settings.attribute.view.defaultAttribute); // no need to trigger change yet, still initializing

		// Bind this last, so other handlers can perform the appropriate updates before we notify parents.
		$element.on('change', '[data-attribute-role="value"], [data-attribute-role="type"], [data-attribute-role="operator"], [data-attribute-role="case"]', () => $element.trigger('cql:modified'));

		$element.find('.selectpicker').selectpicker();
	}

	private _showModalEditor(event: JQuery.Event) {
		const self = this;

		// copy out current text to modal
		const $modalTextArea = this.builder.modalEditor.find('textarea').val(this.uploadedValue || '');

		this.builder.modalEditor.modal(); // show modal
		this.builder.modalEditor.one('hide.bs.modal', function() { // copy out changes once closed
			// A little dirty, to determine how the modal was closed, get the currently focused element
			// If the modal was closed through a button click, the responsible button will have focus
			// Only save the data if the clicked button as the data-save-edits attribute/property
			if ($(document.activeElement!).is('[data-save-edits]')) {
				self.uploadedValue = $modalTextArea.val() as string;
				self.element.trigger('cql:modified');
			} else if ($(document.activeElement!).is('[data-discard-value]')) {
				self.element.find('[data-attribute-role="file"]').val('').trigger('change');
			}
		});
	}

	private _onUploadChanged(event: JQuery.TriggeredEvent<HTMLInputElement>) {
		const self = this;
		const $fileEditButton = self.element.find('[data-attribute-role="edit"]');

		const file = event.target.files && event.target.files[0];
		self.element.attr('data-has-file', file != null ? '' : null);

		if (file == null) {
			$fileEditButton.text('No file selected...');
			self.uploadedValue = null;
			self.element.trigger('cql:modified');
		} else {
			const fr = new FileReader();
			fr.onload = function() {
				$fileEditButton.text(file.name);
				self.uploadedValue = fr.result as string;
				self.element.trigger('cql:modified');
			};
			fr.readAsText(file);
		}
	}

	private _updateShownOptions(selectedValue: string) {
		// First hide everything with a data-attribute-type value
		// Then unhide the one for our new selectedValue
		this.element.find('[data-attribute-type]').hide().filter('[data-attribute-type="' + selectedValue + '"]').show();
	}
	public set(controlName: 'operator', val: 'starts with'|'ends with'|'='|'!='): void;
	public set(controlName: 'case', val: boolean, attributeName: string): void;
	public set(controlName: 'val', val: string|string[], attributeName: string): void;
	public set(controlName: 'type', val: string): void;
	public set(controlName: keyof Attribute['$controls']|'case'|'val', val: string|boolean|string[], attributeName?: string) {
		if (controlName === 'case') {
			setValue(this.element.find('[data-attribute-type="' + attributeName + '"] [data-attribute-role="case"]'), val);
		} else if (controlName === 'val') {
			// correct value casing (if applicable)
			const ourSettings = this.builder.settings.attribute.view.attributes
				.flatMap<AttributeDef>((a: any) => a.options ? a.options : a)
				.find(a => a.attribute === attributeName);

			if (ourSettings && !ourSettings.caseSensitive && ourSettings.values && ourSettings.values.length) {
				const caseMap = ourSettings.values.reduce<{[k: string]: string}>((acc, v) => {
					acc[v.value.toLowerCase()] = v.value;
					return acc;
				}, {});

				val = [val]
					.flat()
					.filter((v): v is string => typeof v === 'string')
					.map(v => caseMap[v.toLowerCase()] || v);
			}

			// FIXME: dirty
			const $input = this.element.find('[data-attribute-type="' + attributeName + '"] [data-attribute-role="value"]');
			if ($input.is('select')) {
				let unescapedVal = unescapeMultiSelectValue(val as string[]);
				if (unescapedVal.every(v => v.indexOf('.*') === 0)) {
					unescapedVal = unescapedVal.map(v => v.substr(2));
					this.set('operator', 'starts with');
				} else if (unescapedVal.every(v => v.indexOf('.*') === v.length -2)) {
					unescapedVal = unescapedVal.map(v => v.substr(0, v.length - 2));
					this.set('operator', 'ends with');
				}

				val = unescapedVal;
			}

			setValue(this.element.find('[data-attribute-type="' + attributeName + '"] [data-attribute-role="value"]'), val);
		} else if (this.$controls[controlName]) {
			setValue(this.$controls[controlName], val);
		}
	}

	public getCql() {
		const type = this.$controls.type.val() as string;
		const operator = this.$controls.operator.val() as string;

		const $optionsContainer = this.element.find('[data-attribute-type="' + type + '"]');
		const caseSensitive = $optionsContainer.find('[data-attribute-role="case"]').is(':checked') || false;

		let values: string[];
		if (this.uploadedValue != null) {
			values = this.uploadedValue.trim().split(/\s+/g); // split on whitespace, across line breaks
		} else {
			const $input = $optionsContainer.find('[data-attribute-role="value"]');
			const rawValue = [$input.val() as string|string[]].flat(2); // transform to array if it isn't
			// if we're a dropdown we need to regex-escape, since they're exact values, but are interpreted as if they're regex
			values = $input.is('select') ? rawValue.map(v => escapeRegex(v)) : rawValue;
		}

		const callback = this.builder.settings.attribute.getCql;
		return callback(type, operator, caseSensitive, values);
	}
}

// ------------------
// Utility functions
// ------------------

const generateId = function() {
	let nextId = 0;
	return function(prefix: string) {
		return prefix + '_' + nextId++;
	};
}();

const unescapeMultiSelectValue = (s: string[]): string[] => {
	// We need to decode the value in the same manner we encoded it.
	// for the encoding step we did the following:
	// 1. full regex-escaping of the individual values
	// 2. OR-ing them together using | (regex OR)

	// so to do the opposite:
	// 1. invert step 2: split on pipes (but only non-escaped pipes, because the individual values can also contain pipes, which were escaped by step 1 above during query generation/encoding)
	// 2. invert step 1, unescape the regex.

	// value a|\ --> a\|\\
	// value b --> b
	// a+b === a\|\\|b
	// so now matching | not preceded by \ doesn't work
	// walk through, check what the active escapers are, and split if not preceded by an active escaper
	// so into [a\|\\, b]

	return s.flatMap(v => {
		const r: string[] = [];
		let cur = '';
		let isEscaped = false;
		for (const c of v) { // each char
			if (isEscaped) {
				isEscaped = false;
				cur += c;
				continue;
			}
			if (c === '\\') {
				isEscaped = true;
				cur += c;
				continue;
			}
			if (c === '|' && cur.length) { // not escaped - we checked above -- split!
				r.push(cur);
				cur = '';
				continue; // don't push - erase the pipe
			}

			cur += c; // regular character, not escaped, push
		}
		if (cur) { r.push(cur); }
		return r;
	})

	// now we have the still escaped regexes with only the pipes removed
	// so now remove all escaping slashes to return them to the intended value
	// NOTE: if a string comes in that contains "a\b", that's illegal and it came from a weird place
	// because the we (the querybuilder) cannot ever output the string "a\b" unless it's from a text field - which is not what we're parsing back in to
	// if there was every a value "a\b" in the select, it would have been output as "a\\b"
	// so erasing all lone backslashes is perfectly valid
	// (it's also not possible to )
	.map(v => {
		let r = '';
		let isEscaped = false;
		for (const c of v) {
			if (isEscaped) {
				isEscaped = false;
				r += c;
				continue;
			}
			if (c === '\\') { // not escaped
				isEscaped = true;
				// and remove the backslash since it's an escape
				continue;
			}
			r += c;
		}
		return r;
	});
};

/**
 * Set values on input/select elements uniformly
 * @param $element
 * @param val
 */
const setValue = function($element: JQuery<HTMLElement>, val: any) {
	if (val != null) {
		if (val.constructor !== Array) {
			val = [val];
		}
	} else {
		val = [null];
	}

	if ($element.is(':checkbox')) {
		$element.prop('checked', val[0]).trigger('change');
	} else if ($element.is('select')) {
		if ($element.hasClass('selectpicker')) {
			$element.selectpicker('val', val).trigger('change');

			const actualValues = ([] as string[]).concat($element.selectpicker('val')); // might not always be array
			if (val.filter((v: any) => v!=null && !actualValues.includes(v)).length) {
				throw new Error('Could not set value(s) ' + val.join() + ' on selectpicker - list contains invalid values (use null to clear)');
			}
		} else {
			// deal with selects that don't have the "multiple" property
			const multiSelect = $element.prop('multiple');
			let hasSelected = false;
			$element.find('option').each(function(i, option) {
				const canSelect = !hasSelected || multiSelect;

				const select = canSelect && ($.inArray($(option).val(), val) !== -1);

				$(option).prop('selected', select);
				hasSelected = hasSelected || select;
			});
			$element.trigger('change');
		}
	} else if ($element.is(':input')) {
		// We know we're dealing with cql regex here, just pipe them together.
		$element.val(val).trigger('change');
	}
};

function hasAttribute(builder: QueryBuilder, attributeId: string) {
	const attributes = builder.settings.attribute.view.attributes.flatMap<AttributeDef, any>((a: any) => a.options ? a.options : a);
	return attributes.find(att => att.attribute === attributeId) != null;
}

function getOperatorLabel(builder: QueryBuilder, operator: string) {
	const found = builder.settings.shared.view.operators.find(op => op.operator === operator);
	return found ? found.label : operator;
}

/**
 * Parse the query pattern and update the query builders to match it.
 *
 * @param {string} queryBuilders - array of query builders
 * @param {string} pattern - parsed queries (only one unless it is a parallel query)
 * @returns True or false indicating success or failure respectively
 */
function populateQueryBuilders(queryBuilders: QueryBuilder[], parallelQueries: Result[]): boolean {
	let success = true;
	parallelQueries.forEach((parsedCql, i) => {
		const queryBuilder = queryBuilders[i];
		success = populateQueryBuilder(queryBuilder, parsedCql) && success;
	});

	return success;
}

/**
 * Attempt to parse the query pattern and update the state of the query builder
 * to match it as much as possible.
 *
 * @param {QueryBuilder} queryBuilder - query builder to populate
 * @param {string} parsedCql - parsed BCQL query
 * @returns True or false indicating success or failure respectively
 */
function populateQueryBuilder(queryBuilder: QueryBuilder, parsedCql: Result): boolean {
	try {
		const tokens = parsedCql.tokens;
		const within = parsedCql.within;
		if (tokens === undefined) {
			return false;
		}

		queryBuilder.reset();
		if (tokens.length > 0) {
			// only clear the querybuilder when we're putting something back in
			queryBuilder.getTokens().forEach(token => token.element.remove());
		}
		if (within) {
			queryBuilder.set('within', within);
		}

		tokens.forEach(token => {
			const tokenInstance = queryBuilder.createToken();

			// clean the root group of all contents
			tokenInstance.rootAttributeGroup.getAttributes().forEach(attribute => attribute.element.remove());
			tokenInstance.rootAttributeGroup.getAttributeGroups().forEach(group => group.element.remove());

			tokenInstance.set('beginOfSentence', !!token.leadingXmlTag && token.leadingXmlTag.name === 's');
			tokenInstance.set('endOfSentence', !!token.trailingXmlTag && token.trailingXmlTag.name === 's');
			tokenInstance.set('optional', token.optional || false);

			if (token.repeats) {
				tokenInstance.set('minRepeats', token.repeats.min);
				tokenInstance.set('maxRepeats', token.repeats.max);
			}

			function doOp(op: undefined|CQLAttribute|CQLBinaryOp, parentAttributeGroup: AttributeGroup, level: number) {
				if (op == null) {
					return;
				}

				if (op.type === 'binaryOp') {
					const label = op.operator === '&' ? 'AND' : 'OR'; // TODO get label internally in builder
					if (op.operator !== parentAttributeGroup.operator) {

						if (level === 0) {
							parentAttributeGroup.operator = op.operator;
							parentAttributeGroup.operatorLabel = getOperatorLabel(queryBuilder, op.operator);
						} else if (parentAttributeGroup.operator !== op.operator) {
							parentAttributeGroup = parentAttributeGroup.createAttributeGroup(op.operator, label);
						}
					}

					// inverse order, since new elements are inserted at top..
					doOp(op.right, parentAttributeGroup, level + 1);
					doOp(op.left, parentAttributeGroup, level + 1);
				} else if (op.type === 'attribute') {
					if (!hasAttribute(queryBuilder, op.name)) {
						return;
					}

					const attributeInstance = parentAttributeGroup.createAttribute();

					// case flag is always at the front, so check for that before checking
					// for starts with/ends with flags
					if (op.value.indexOf('(?-i)') === 0) {
						attributeInstance.set('case', true, op.name);
						op.value = op.value.substr(5);
					} else if (op.value.indexOf('(?c)') === 0) {
						attributeInstance.set('case', true, op.name);
						op.value = op.value.substr(4);
					}

					if (op.operator === '=' && op.value.length >= 2 && op.value.indexOf('|') === -1) {
						if (op.value.indexOf('.*') === 0) {
							(op.operator as string) = 'ends with';
							op.value = op.value.substr(2);
						} else if (op.value.indexOf('.*') === op.value.length -2) {
							(op.operator as string) = 'starts with';
							op.value = op.value.substr(0, op.value.length-2);
						}
					}

					attributeInstance.set('operator', op.operator);
					attributeInstance.set('type', op.name);
					attributeInstance.set('val', op.value, op.name);
				}
			}

			doOp(token.expression, tokenInstance.rootAttributeGroup, 0);
			tokenInstance.element.trigger('cql:modified');
		});
	} catch (e) {
		// couldn't decode query
		debugLog('Cql parser could not decode query pattern', e, parsedCql);

		return false;
	}

	return true;
}
