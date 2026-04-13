<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
	functional: true,
	// @ts-ignore
	render: (h, ctx) => ctx.props.vnode
});
</script>