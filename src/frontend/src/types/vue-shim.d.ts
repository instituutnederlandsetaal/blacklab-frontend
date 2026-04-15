declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
    export default component
}

declare module 'vue' {
    import type { CompatVue } from '@vue/runtime-dom'
    const Vue: CompatVue
    export default Vue
    export * from '@vue/runtime-dom'
    export { configureCompat }
    const configureCompat: typeof Vue.configureCompat
}