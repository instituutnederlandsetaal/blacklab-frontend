/**
 * Make typescript pretend that a .vue file always default exports a Vue component
 * This is required because otherwise the compiler complains it can't find the module (because it doesn't/can't parse the file)
 */
declare module 'vue' {
    import type { CompatVue } from '@vue/runtime-dom'
    const Vue: CompatVue
    export default Vue
    export * from '@vue/runtime-dom'
    const configureCompat: typeof Vue.configureCompat
    export { configureCompat }
}