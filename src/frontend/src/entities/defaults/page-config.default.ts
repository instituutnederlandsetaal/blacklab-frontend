import type { CFPageConfig } from '@/types/apptypes';

const defaultConfig: CFPageConfig = {
	analytics: {
		google: null,
		plausible: null,
	},
	bannerMessage: null,
	customCss: {},
	customJs: {},
	displayName: null,
	faviconDir: '',
	navbarLinks: [],
	pageSize: null,
};

export default defaultConfig;
