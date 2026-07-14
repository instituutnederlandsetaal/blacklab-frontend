import type { FormValue } from '@/features/form/model/types/form-shape';

export type HeadingViewConfig = {
	title: FormValue<string>;
	description?: FormValue<string>;
};
