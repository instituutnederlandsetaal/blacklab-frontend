let next = 0;

// NOTE: this is no longer a mixin, because it breaks typescript
// Somehow a component using mixins is polluted with vue 3 types
// And any undefined property becomes 'any'
// So this.kljsdfkhsdkfhs becomes any, and it's not a good thing

/** Generate the next UID */
export default function() { return (next++).toString(); }

