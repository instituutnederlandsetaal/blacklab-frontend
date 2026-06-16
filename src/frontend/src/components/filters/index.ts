import type { ObjectPlugin } from 'vue';

import FilterAutocomplete from './FilterAutocomplete.vue';
import FilterCheckbox from './FilterCheckbox.vue';
import FilterDate from './FilterDate.vue';
import FilterRadio from './FilterRadio.vue';
import FilterRange from './FilterRange.vue';
import FilterRangeMultipleFields from './FilterRangeMultipleFields.vue';
import FilterSelect from './FilterSelect.vue';
import FilterText from './FilterText.vue';

const filterPlugin: ObjectPlugin<{}> = {
	install(app) {
		app.component('filter-autocomplete', FilterAutocomplete);
		app.component('filter-checkbox', FilterCheckbox);
		app.component('filter-radio', FilterRadio);
		app.component('filter-range', FilterRange);
		app.component('filter-select', FilterSelect);
		app.component('filter-text', FilterText);
		app.component('filter-range-multiple-fields', FilterRangeMultipleFields);
		app.component('filter-date', FilterDate);
	},
};

export default filterPlugin;
