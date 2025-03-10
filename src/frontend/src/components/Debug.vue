<script lang="ts">
import Vue from 'vue';

import debug from '@/utils/debug';

export default Vue.extend({
	functional: true,
	render(v, c): any {
		return debug.debug ? c.children : undefined;
	}
});
</script>