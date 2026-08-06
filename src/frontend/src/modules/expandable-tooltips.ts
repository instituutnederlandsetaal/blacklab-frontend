import '@/modules/expandable-tooltips.scss';

import type { PopperOptions } from 'popper.js';
import Popper from 'popper.js';
import { asyncScheduler, fromEvent, merge, type Observable } from 'rxjs';
import { distinctUntilChanged, filter, map, throttleTime } from 'rxjs/operators';

import { debugLog } from '@/shared/debug/debug';

type ConfigCommon = {
	/** Class(es) to apply to the tooltip bubble. Defaults to 'tooltip-hover' */
	tooltipClass?: string;
	/** Class(es) to apply to the tooltip bubble in preview mode. Defaults to 'preview'. */
	tooltipPreviewClass?: string;
	/** Class(es) to apply to the tooltip bubble in expanded mode. Defaults to 'expanded'. */
	tooltipExpandedClass?: string;
};

/** Get the tooltip's content and preview from data- attributes */
export type ConfigAttributes = ConfigCommon & {
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
export type ConfigTitle = ConfigCommon & {
	mode: 'title';
	/** Query selector to find the elements on which to attach a tooltip (such as '[data-tooltip]') */
	tooltippableSelector: string;
	/** List of data-* attributes to ignore when gathering tooltip contents. Should NOT contain the 'data-' portion of the names. */
	excludeAttributes: string[];
};

let sharedEventListener: Observable<{ eventType: 'click' | 'mouseover'; element: HTMLElement | null }> | null = null;
function getSharedEventListener() {
	return (sharedEventListener ??= merge(fromEvent<MouseEvent>(document, 'mouseover'), fromEvent<MouseEvent>(document, 'click')).pipe(
		throttleTime(25, asyncScheduler, { leading: true, trailing: true }),
		map(e => ({
			eventType: e.type as 'click' | 'mouseover',
			element: e.target && (e.target as HTMLElement).closest ? (e.target as HTMLElement) : null,
		})),
	));
}

const ContextSymbol = Symbol('ExpandableTooltipContext');

export type TooltipContext = {
	[ContextSymbol]: true;
	/** Stop the tooltip system; destroys all tooltips in the context and stops listening for events. */
	(): void;
};

type TooltipContextPrivate = TooltipContext & {
	activeTooltip: InstanceType<typeof Popper> | null;
	explicitlyOpened: boolean;
	listeners: Array<() => void>;
};

function destroyTooltip(ctx: TooltipContextPrivate) {
	if (!ctx.activeTooltip) return;
	(ctx.activeTooltip.reference as HTMLElement).classList.remove('tooltip-open');
	ctx.activeTooltip.destroy();
	ctx.activeTooltip = null;
	ctx.explicitlyOpened = false;
}

function createContext(existingContext?: TooltipContext): TooltipContextPrivate {
	if (existingContext && (existingContext as TooltipContextPrivate)[ContextSymbol]) {
		return existingContext as TooltipContextPrivate;
	}

	debugLog('tooltip', 'Creating new tooltip context');
	const listeners: Array<() => void> = [];
	function teardown() {
		debugLog('tooltip', 'Destroying tooltip context');
		listeners.forEach(l => l());
	}
	teardown.listeners = listeners;
	teardown.activeTooltip = null;
	teardown.explicitlyOpened = false;
	teardown[ContextSymbol] = true as const;
	return teardown;
}

/**
 * Create tooltips for elements on the page, based on title attributes or data-* attributes.
 * Multiple configurations can be initialized, and can share a context, which means that only one tooltip in the context will be shown at a time.
 *
 * @param config the config for the tooltip system, either using title attributes or data-* attributes
 * @param context an optional context to share between multiple tooltip systems; if not provided, a new context is created and returned.
 * @returns the context, which also serves as the teardown function to stop the tooltip system and destroy all tooltips in the context.
 */
export default function createTooltips(config: ConfigTitle | ConfigAttributes, context?: TooltipContext): TooltipContext {
	const ctx = createContext(context);

	const tooltipClasses = (config.tooltipClass ?? 'tooltip-hover').split(/\s+/).filter(s => !!s);
	const tooltipPreviewClasses = (config.tooltipClass ?? 'preview').split(/\s+/).filter(s => !!s);
	const tooltipExpandedClasses = (config.tooltipExpandedClass ?? 'expanded').split(/\s+/).filter(s => !!s);
	const tooltipSelector = tooltipClasses.map(c => `.${c}`).join('');
	const eligibleElementSelector =
		config.mode === 'title'
			? config.tooltippableSelector
			: [config.contentAttribute, config.previewAttribute]
					.filter(s => !!s)
					.map(att => `[${CSS.escape(att!)}]`)
					.join(',');

	const popperOptions: PopperOptions = {
		removeOnDestroy: true,
		placement: 'top',
		modifiers: {
			preventOverflow: {
				boundariesElement: 'viewport',
				padding: {
					top: 100,
					bottom: 25,
					left: 25,
					right: 25,
				},
			},
		},
	};

	const activeTooltippable$ = getSharedEventListener().pipe(
		// not clicking/hovering over the tooltip itself
		filter(e => !e.element?.closest(tooltipSelector)),
		map(e => ({
			element: e.element?.closest<HTMLElement>(eligibleElementSelector),
			eventType: e.eventType,
		})),
		distinctUntilChanged((a, b) => a.element === b.element && a.eventType === b.eventType),
	);

	const unsubscribe = activeTooltippable$.subscribe(({ element, eventType }) => {
		const destroyExistingTooltip = !ctx.explicitlyOpened || (ctx.explicitlyOpened && eventType === 'click');
		if (ctx.activeTooltip) {
			if (destroyExistingTooltip) {
				destroyTooltip(ctx);
			}
			return;
		}

		if (element) {
			ctx.activeTooltip = createNewTooltip(element);
			ctx.explicitlyOpened = eventType === 'click';
			(ctx.activeTooltip?.reference as HTMLElement)?.classList.toggle('tooltip-open', true);
		}
	});

	function createNewTooltip(element: HTMLElement | null) {
		if (!element) {
			return null;
		}
		const { content, preview } = getTooltipContent(config, element);
		const tooltip = createElement(`<div">${preview}</div>`);
		let tooltipInstance: InstanceType<typeof Popper> | null = null;

		tooltipClasses.forEach(c => tooltip.classList.add(c));
		tooltipPreviewClasses.forEach(c => tooltip.classList.add(c));
		if (content) {
			const openFullTooltip = createElement<HTMLFormElement>(`
				<form class="tooltip-expand" style="display:inline-block;">
					<button type="submit" class="btn btn-sm btn-link showdetails"><em class="text-muted">(Show details)</em></button>
				</form>
			`);
			tooltip.appendChild(openFullTooltip);

			openFullTooltip.addEventListener(
				'submit',
				(submit: Event) => {
					tooltip.innerHTML = content;
					tooltipPreviewClasses.forEach(c => tooltip.classList.toggle(c, false));
					tooltipExpandedClasses.forEach(c => tooltip.classList.toggle(c, true));

					submit.preventDefault();
					submit.stopPropagation();
					tooltipInstance!.scheduleUpdate();
					ctx.explicitlyOpened = true;
				},
				{ once: true },
			);
		}
		tooltip.addEventListener('click', () => (ctx.explicitlyOpened = true), { once: true });

		document.body.appendChild(tooltip);
		tooltipInstance = new Popper(element, tooltip, popperOptions);
		return tooltipInstance;
	}

	ctx.listeners.push(() => {
		unsubscribe.unsubscribe();
		destroyTooltip(ctx);
	});
	return ctx;
}

/** Parse trusted tooltip markup and return its typed root element. */
function createElement<T extends HTMLElement = HTMLElement>(s: string) {
	const html = new DOMParser().parseFromString(s, 'text/html');
	return html.body.firstChild as T;
}

function getDataAttributes(element: Element) {
	const ret = [];

	let key: string;
	let value: string;
	for ({ name: key, value } of element.attributes) {
		if (key.startsWith('data-') && value /* && key !== 'data-toggle' */) {
			ret.push({ key: key.substring(5), value });
		}
	}
	return ret;
}

function getTooltipContent(
	config: ConfigTitle | ConfigAttributes,
	el: HTMLElement,
): {
	preview: string | undefined;
	content: string | undefined;
} {
	let preview: string | undefined;
	let content: string | undefined;
	if (config.mode === 'title') {
		const dataAttributes = getDataAttributes(el).filter(a => !(config as ConfigTitle).excludeAttributes.includes(a.key));

		preview = el.getAttribute('title') || undefined;
		if ((preview && dataAttributes.length) || dataAttributes.length > 1) {
			content = `
				<table class="table" style="table-layout:fixed;width:auto;min-width:300px; margin: 0">
				<tbody>${dataAttributes
					.map(
						a => `
					<tr>
						<td>${a.key}</td>
						<td>${a.value}</td>
					</tr>
				`,
					)
					.join('')}
				</tbody>
				</table>
			`;
		} else if (dataAttributes.length) {
			// length === 1
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
	if (preview) {
		preview = preview.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
	}
	if (content) {
		content = content.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
	}

	return { preview, content };
}
