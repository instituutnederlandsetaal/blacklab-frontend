<template>
	<div ref="navbarElement" class="navbar-inverse navbar-fixed-top" :class="{ 'navbar-has-logo': hasLogo, 'navbar-scrolled': hasLogo && isScrolled }">
		<div class="navbar-alert container" v-if="showBanner">
			<div class="navbar-brand" v-html="config.bannerMessage"></div>
			<button type="button" class="btn btn-navbar" title="Hide banner for one week" @click="hideBanner"><span class="fa fa-times"></span></button>
		</div>

		<div class="navbar-main container">
			<div class="navbar-logo-container">
				<router-link :to="indexId ? { name: 'search', params: { corpus: indexId } } : { name: 'corpora' }">
					<div ref="logoElement" class="navbar-logo"></div>
				</router-link>
			</div>

			<div class="navbar-content-container">
				<router-link class="navbar-brand" :to="indexId ? { name: 'search', params: { corpus: indexId } } : { name: 'corpora' }">{{ displayNameInNavbar }}</router-link>

				<ul class="nav navbar-nav navbar-collapse" :class="{ visible: !collapsed }">
					<debug
						><li v-if="$route.name !== 'corpora'"><router-link :to="{ name: 'corpora' }">[Corpora]</router-link></li></debug
					>
					<li v-for="link in links" :key="link.attributes.href">
						<component :is="link.isExternal ? 'a' : 'router-link'" v-bind="link.attributes">{{ link.label }}</component>
					</li>
				</ul>

				<div class="navbar-buttons">
					<LoginButton />
					<LocaleSelector />
					<button class="btn btn-navbar navbar-toggle" type="button" @click="collapsed = !collapsed">
						<span class="fa fa-bars"></span>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useCfPageConfig, useCorpus } from '@/app/state/useCorpusContext';
import { customCssChangedEvent } from '@/interop/page-customization';
import { useCorpusId } from '@/navigation/page-context';

import { localStorageSynced } from '@/shared/utils/localstore';

import LoginButton from '@/shared/auth/LoginButton.vue';
import LocaleSelector from '@/shared/i18n/LocaleSelector.vue';

type LogoDimensions = { width: number; height: number };
type LogoStyles = {
	imageUrl?: string;
	dimensions: Partial<LogoDimensions>;
};

const router = useRouter();
const scrolledLogoMaxHeight = 40;

const collapsed = ref(true);
const hasLogo = ref(false);
const isScrolled = ref(false);
const navbarElement = ref<HTMLElement>();
const logoElement = ref<HTMLElement>();
let configurationId = 0;
let logoLoadController: AbortController | undefined;
const bannerFromLocalStorage = localStorageSynced<string>('cf/banner-hidden', '', false, 24 * 7 * 3600);
const showBanner = computed(() => !!config.value.bannerMessage && bannerFromLocalStorage.value !== config.value.bannerMessage);
const config = useCfPageConfig();
const indexId = useCorpusId();
const index = useCorpus({ IAcknowledgeItCanBeUndefined: true });
const displayNameInNavbar = computed(() => config.value.displayName || index.value?.displayName || indexId.value || 'BlackLab Frontend');
const links = computed<Array<{ label: string; attributes: Record<string, string>; isExternal: boolean }>>(() =>
	config.value.navbarLinks.map(l => {
		const parsed = new URL(l.attributes.href, window.location.origin);
		const routerBase = router.options.history.base || '/';
		const isExternal = parsed.origin !== window.location.origin || !parsed.pathname.startsWith(routerBase);
		if (isExternal) return { ...l, isExternal };
		// else we need to remove the router's base from the link, or it will double up
		// so reconstruct the link..
		// Also we need to make sure that 'href' is not in the attributes (or router-link will not add the href attribute to its <a> at all???)
		const { href, target, ...attributesWithoutHref } = l.attributes;
		return {
			isExternal,
			...l,
			attributes: {
				...attributesWithoutHref,
				to: parsed.pathname.substring(routerBase.length) + parsed.search + parsed.hash,
			},
		};
	}),
);

function hideBanner() {
	bannerFromLocalStorage.value = config.value.bannerMessage!;
}

function updateScrolledState() {
	isScrolled.value = window.scrollY > 0;
	document.body.classList.toggle('navbar-logo-is-scrolled', hasLogo.value && isScrolled.value);
}

function readPositivePixels(value: string) {
	const pixels = Number.parseFloat(value);
	return pixels > 0 ? pixels : undefined;
}

function readBackgroundImageUrl(backgroundImage: string) {
	const match = /url\((?:"([^"]*)"|'([^']*)'|([^)]*))\)/.exec(backgroundImage);
	return match?.slice(1).find(Boolean)?.trim();
}

function readBackgroundDimensions(backgroundSize: string): Partial<LogoDimensions> {
	const [width, height] = backgroundSize.split(',', 1)[0].trim().split(/\s+/, 2);
	return {
		width: width?.endsWith('px') ? readPositivePixels(width) : undefined,
		height: height?.endsWith('px') ? readPositivePixels(height) : undefined,
	};
}

function loadImage(url: string, signal: AbortSignal) {
	return new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		const cleanup = () => {
			image.removeEventListener('load', handleLoad);
			image.removeEventListener('error', handleError);
			signal.removeEventListener('abort', handleAbort);
		};
		const handleLoad = () => {
			cleanup();
			resolve(image);
		};
		const handleError = (error: Event) => {
			cleanup();
			reject(error);
		};
		const handleAbort = () => {
			cleanup();
			image.src = '';
			reject(signal.reason);
		};
		image.addEventListener('load', handleLoad);
		image.addEventListener('error', handleError);
		signal.addEventListener('abort', handleAbort, { once: true });
		if (signal.aborted) return handleAbort();
		image.src = url;
	});
}

function inferDimensions(natural: LogoDimensions, explicit: Partial<LogoDimensions>): LogoDimensions {
	if (explicit.width && explicit.height) return { width: explicit.width, height: explicit.height };
	if (explicit.width) return { width: explicit.width, height: explicit.width * (natural.height / natural.width) };
	if (explicit.height) return { width: explicit.height * (natural.width / natural.height), height: explicit.height };
	return natural;
}

function readLogoStyles(logo: HTMLElement): LogoStyles {
	const styles = getComputedStyle(logo);
	const backgroundDimensions = readBackgroundDimensions(styles.backgroundSize);
	return {
		imageUrl: readBackgroundImageUrl(styles.backgroundImage),
		dimensions: {
			width: readPositivePixels(styles.width) ?? backgroundDimensions.width,
			height: readPositivePixels(styles.height) ?? backgroundDimensions.height,
		},
	};
}

function clearLogoSizing() {
	hasLogo.value = false;
	navbarElement.value?.classList.remove('navbar-has-logo', 'navbar-scrolled');
	navbarElement.value?.style.removeProperty('--navbar-logo-effective-width');
	navbarElement.value?.style.removeProperty('--navbar-logo-effective-height');
	navbarElement.value?.style.removeProperty('--navbar-logo-scrolled-width');
	navbarElement.value?.style.removeProperty('--navbar-logo-scrolled-height');
	document.body.classList.remove('navbar-logo-is-scrolled');
	document.body.style.removeProperty('--navbar-logo-body-offset');
}

async function configureLogoSizing() {
	const id = ++configurationId;
	logoLoadController?.abort();
	logoLoadController = undefined;
	const navbar = navbarElement.value;
	const logo = logoElement.value;
	if (!navbar || !logo) return;
	clearLogoSizing();

	// Capture custom CSS before the active class normalizes the logo's layout.
	const styles = readLogoStyles(logo);
	if (!styles.imageUrl) return;

	const controller = new AbortController();
	logoLoadController = controller;
	try {
		const image = await loadImage(styles.imageUrl, controller.signal);
		if (id !== configurationId || !image.naturalWidth || !image.naturalHeight) return;

		const natural = { width: image.naturalWidth, height: image.naturalHeight };
		const dimensions = inferDimensions(natural, styles.dimensions);
		const scale = Math.min(1, scrolledLogoMaxHeight / dimensions.height);
		navbar.style.setProperty('--navbar-logo-effective-width', `${dimensions.width}px`);
		navbar.style.setProperty('--navbar-logo-effective-height', `${dimensions.height}px`);
		navbar.style.setProperty('--navbar-logo-scrolled-width', `${dimensions.width * scale}px`);
		navbar.style.setProperty('--navbar-logo-scrolled-height', `${dimensions.height * scale}px`);
		document.body.style.setProperty('--navbar-logo-body-offset', `${Math.max(60, dimensions.height + 15)}px`);
		hasLogo.value = true;
		updateScrolledState();
	} catch {
		// A missing logo should leave the normal navbar layout untouched.
	} finally {
		if (logoLoadController === controller) logoLoadController = undefined;
	}
}

onMounted(() => {
	updateScrolledState();
	window.addEventListener(customCssChangedEvent, configureLogoSizing);
	void configureLogoSizing();
	window.addEventListener('scroll', updateScrolledState, { passive: true });
});

onBeforeUnmount(() => {
	configurationId++;
	logoLoadController?.abort();
	window.removeEventListener(customCssChangedEvent, configureLogoSizing);
	window.removeEventListener('scroll', updateScrolledState);
	removeRouterAfterEach();
	clearLogoSizing();
});

const removeRouterAfterEach = router.afterEach(() => {
	collapsed.value = true;
});
</script>

<style lang="scss">
body {
	/* Leave room for a pop-out logo until the page is scrolled. */
	padding-top: var(--navbar-logo-body-offset, 60px);
	transition: padding-top 0.2s ease;

	&.navbar-logo-is-scrolled {
		// Existing themes commonly set their expanded padding with !important.
		padding-top: 70px !important;
	}
}

@media (prefers-reduced-motion: reduce) {
	body,
	.navbar-logo-container,
	.navbar-logo-container > a,
	.navbar-logo {
		transition: none;
	}
}

.btn.btn-navbar {
	border: none;
	color: #9d9d9d;
	* {
		color: inherit;
	}
	background: transparent;
	background-color: transparent;
	margin: 0;
	&:not(:disabled, .disabled) {
		&:active,
		&:focus,
		&:hover {
			color: #ddd;
			background-color: #333;
		}
	}
	&:disabled {
		opacity: 1;
	}
}
.combobox {
	vertical-align: baseline !important;
} // selectpicker
.menu-caret {
	margin: 0;
}

// clear some bootstrap float, padding and clearfix stuff
.navbar-inverse {
	&,
	* {
		float: none !important;
		&:not(.fa, .menu-value) {
			&:before,
			&:after {
				display: none !important;
				content: '';
			}
		}
	}

	> .container {
		padding: 0;
	} // padding comes from content, we only use this for margin/width

	button.btn {
		padding: 15px;
		margin: 0;
	}
}
.navbar-brand {
	height: unset;
	color: #ddd !important;
}

// own layout.
.navbar-alert {
	display: flex;
	justify-content: space-between;
	align-items: baseline;
	> .navbar-hide {
		padding: 9px 10px;
		color: #ddd;
	}
	& + .navbar-main {
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
		border-top: 1px solid #101010;
	}
}

.navbar-main {
	display: flex;
	align-items: baseline;
	flex-wrap: nowrap;

	@at-root .navbar-logo-container {
		display: none; // enabled after the background image has loaded
		flex: 0 0 auto;
		align-self: flex-start;
		height: 1px;
		overflow: visible;
		margin: 5px 15px 10px 0;
		transition:
			width 0.2s ease,
			margin 0.2s ease,
			padding 0.2s ease;

		@at-root .navbar-logo {
			background-image: var(--navbar-logo-url);
			background-position: center;
			background-repeat: no-repeat;
			background-size: contain;
			width: var(--navbar-logo-width, auto);
			height: var(--navbar-logo-height, auto);
			z-index: 9000;
			pointer-events: none;
			transition:
				width 0.2s ease,
				height 0.2s ease;
		}
	}

	@at-root .navbar-inverse.navbar-has-logo .navbar-logo-container {
		display: block;
		box-sizing: border-box;
		width: var(--navbar-logo-effective-width);
		height: 1px;
		margin: 5px 15px 10px 0;
		padding: 0;

		> a {
			display: block;
			box-sizing: border-box;
			width: 100%;
			margin: 0;
			padding: 0;
			transition: padding-top 0.2s ease;
		}
	}

	@at-root .navbar-inverse.navbar-has-logo .navbar-logo {
		box-sizing: border-box;
		background-size: contain;
		width: var(--navbar-logo-effective-width);
		height: var(--navbar-logo-effective-height);
		min-width: 0;
		max-width: none;
		min-height: 0;
		max-height: none;
		margin: 0;
		padding: 0;
		transform: none;
	}

	@at-root .navbar-inverse.navbar-has-logo.navbar-scrolled .navbar-logo-container {
		width: calc(var(--navbar-logo-scrolled-width) + 10px);
		height: 50px;
		margin: 0 10px 0 0;
		padding: 0 5px;

		> a {
			height: 50px;
			padding-top: calc((50px - var(--navbar-logo-scrolled-height)) / 2);
		}
	}

	@at-root .navbar-inverse.navbar-has-logo.navbar-scrolled .navbar-logo {
		width: var(--navbar-logo-scrolled-width);
		height: var(--navbar-logo-scrolled-height);
	}
	@at-root .navbar-content-container {
		display: flex;
		flex-wrap: wrap;
		flex-grow: 1;
		align-items: baseline;

		> .navbar-nav {
			margin: 0;
			padding: 0;
			flex-grow: 1;
		}
		> .navbar-nav > li {
			display: inline-block;
		}
		> .navbar-buttons {
			display: flex;
		}

		@media (max-width: 767px) {
			justify-content: space-between;

			.navbar-nav {
				width: 100%;
				order: 3;
				padding: 7.5px 0;

				> li {
					display: block;
				}
				&:not(.visible) {
					display: none;
				}
			}
		}
	}
}
</style>
