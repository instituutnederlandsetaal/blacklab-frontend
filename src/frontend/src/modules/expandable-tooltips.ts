import {fromEvent, asyncScheduler, merge} from 'rxjs';
import { map, filter, distinctUntilChanged, throttleTime, elementAt } from 'rxjs/operators';
import Popper, { PopperOptions } from 'popper.js';

import '@/modules/expandable-tooltips.scss';

type ConfigCommon = {
	/** Class(es) to apply to the tooltip bubble. Defaults to 'tooltip-hover' */
	tooltipClass?: string;
	/** Class(es) to apply to the tooltip bubble in preview mode. Defaults to 'preview'. */
	tooltipPreviewClass?: string;
	/** Class(es) to apply to the tooltip bubble in expanded mode. Defaults to 'expanded'. */
	tooltipExpandedClass?: string;
};

/** Get the tooltip's content and preview from data- attributes */
type ConfigContentAttributes = {
	mode: 'attributes';
	previewAttribute?: string;
	contentAttribute: string;
};

/**
 * Get the preview tooltip from the 'title' attribute,
 * and get the full content from all other data-* attributes (if present).
 * Has one special fallback where if there is no 'title', and only one other 'data-*' attribute,
 * that attribute is used as preview.
 */
type ConfigTitle = {
	mode: 'title',
	/** Query selector to find the elements on which to attach a tooltip (such as '[data-tooltip]') */
	tooltippableSelector: string;
	/** List of data-* attributes to ignore when gathering tooltip contents. Should NOT contain the 'data-' portion of the names. */
	excludeAttributes: string[];
};

export type Config = ConfigCommon&(ConfigContentAttributes|ConfigTitle);

export default function init(_config: Config) {
	const _config2 = Object.assign({
		tooltipClass: 'tooltip-hover',
		tooltipPreviewClass: 'preview',
		tooltipExpandedClass: 'expanded'
	}, _config);

	const settings = {
		..._config2,

		// Query selector for the tooltip bubble
		tooltipSelector: '.' + _config2.tooltipClass!.split(/\s+/g).filter(c => !!c).join('.'),
		// Query selector for the element to which it is attached.
		tooltippableSelector:
			_config2.mode === 'title' ? _config2.tooltippableSelector :
			[_config2.contentAttribute, _config2.previewAttribute]
			.filter(attributeName => !!attributeName)
			.map(attributeName => `*[${attributeName}]`)
			.join(', '),

		popperOptions: {
			removeOnDestroy: true,
			placement: 'top',
			modifiers: {
				preventOverflow: {
					boundariesElement: 'viewport',
					padding: {
						top: 100,
						bottom: 25,
						left: 25,
						right: 25
					}
				}
			}
		} as PopperOptions,

		// state
		activeTooltip: null as null|InstanceType<typeof Popper>,
		explicitlyOpened: false,
	};

	const event$ = merge(fromEvent<MouseEvent>(document, 'mouseover'),fromEvent<MouseEvent>(document, 'click'));
	const activeTooltippable$ = event$.pipe(
		throttleTime(25, asyncScheduler, {leading: true, trailing: true}),
		map(e => ({
			eventType: e.type as 'click'|'mouseover',
			element: e.target && (e.target as HTMLElement).closest ? e.target as HTMLElement : null
		})),
		// not clicking/hovering over the tooltip itself
		filter(e => !(e.element && e.element.closest(settings.tooltipSelector))),
		map(e => ({
			element: e.element ? e.element.closest(settings.tooltippableSelector) as HTMLElement : null,
			eventType: e.eventType
		})),
		distinctUntilChanged((a, b) => a.element === b.element && a.eventType === b.eventType),
	);

	activeTooltippable$.subscribe(({element, eventType}) => {
		const destroyExistingTooltip = !settings.explicitlyOpened || (settings.explicitlyOpened && eventType === 'click');
		if (settings.activeTooltip && destroyExistingTooltip) {
			(settings.activeTooltip?.reference as HTMLElement)?.classList.toggle('tooltip-open', false);
			settings.activeTooltip.destroy();
			settings.activeTooltip = null;
			settings.explicitlyOpened = false;
		}

		if (settings.activeTooltip) {
			return;
		}

		settings.activeTooltip = createNewTooltip(element);
		settings.explicitlyOpened = eventType === 'click';
		(settings.activeTooltip?.reference as HTMLElement)?.classList.toggle('tooltip-open', true);
	});

	function createNewTooltip(element: HTMLElement|null) {
		if (!element) {
			return null;
		}

		const {content, preview} = getTooltipContent(settings, element);

		const tooltip = createElement(`<div class="${settings.tooltipClass} ${settings.tooltipPreviewClass}">${preview}</div>`);
		if (content) {
			const openFullTooltip = createElement<HTMLFormElement>(`
				<form class="tooltip-expand" style="display:inline-block;">
					<button type="submit" class="btn btn-sm btn-link showdetails"><em class="text-muted">(Show details)</em></button>
				</form>
			`);
			tooltip.appendChild(openFullTooltip);

			openFullTooltip.addEventListener('submit', (submit: Event) => {
				tooltip.innerHTML = content;
				[...settings.tooltipPreviewClass.split(/\s+/g), ...settings.tooltipExpandedClass.split(/\s+/g)]
					.filter(c => !!c)
					.forEach(c => tooltip.classList.toggle(c));

				submit.preventDefault();
				submit.stopPropagation();
				settings.activeTooltip!.scheduleUpdate();
				settings.explicitlyOpened = true;
			}, { once:true });
		}
		tooltip.addEventListener('click', () => settings.explicitlyOpened = true, { once: true });

		document.body.appendChild(tooltip);
		return new Popper(element, tooltip, settings.popperOptions);
	}
}

function createElement<T extends HTMLElement = HTMLElement>(s: string) {
	const html = new DOMParser().parseFromString(s, 'text/html');
	return html.body.firstChild as T;
}

function getDataAttributes(element: Element) {
	const ret = [];

	let key: string;
	let value: string;
	for ({name: key, value} of element.attributes) {
		if (key.startsWith('data-') && value /* && key !== 'data-toggle' */) {
			ret.push({key: key.substring(5), value});
		}
	}
	return ret;
}

function getTooltipContent(config: Config, el: HTMLElement): {
	preview: string|undefined;
	content: string|undefined;
} {
	let preview: string|undefined;
	let content: string|undefined;
	if (config.mode === 'title') {
		const dataAttributes = getDataAttributes(el).filter(a => !(config as ConfigTitle).excludeAttributes.includes(a.key));

		preview = el.getAttribute('title') || undefined;
		if ((preview && dataAttributes.length) || dataAttributes.length > 1) {
			content = `
				<table class="table" style="table-layout:fixed;width:auto;min-width:300px; margin: 0">
				<tbody>${dataAttributes.map(a => `
					<tr>
						<td>${a.key}</td>
						<td>${a.value}</td>
					</tr>
				`).join('')}
				</tbody>
				</table>
			`;
		} else if (dataAttributes.length) { // length === 1
			content = dataAttributes[0].value;
		}
	} else {
		preview = config.previewAttribute ? el.getAttribute(config.previewAttribute) || undefined : undefined;
		content = config.contentAttribute ? el.getAttribute(config.contentAttribute) || undefined : undefined;
	}

	if (!preview) {
		preview = content;
		content = undefined;
	}

	// Unescape tokens that must always be escaped in attributes
	if (preview) { preview = preview.replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }
	if (content) { content = content.replace(/&quot;/g, '"').replace(/&amp;/g, '&'); }

	return {preview, content};
}
