## Legacy tab type ownership

`external/legacy.ts` still owns the private `LegacySearchFilterTab` shape, while internal consumers access `_customTabs` through the inferred `LegacyCustomizationApi` type.

Centralize this implementation type in `legacy.ts` or expose it through a typed accessor so the legacy adapter and internal API do not depend on the private object shape directly.
