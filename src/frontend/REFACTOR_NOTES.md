# URL decoding

Edit luceneparser.ts to also return AST, so url-state-parser-search doesn't need to do double work

# Customjs/customcss

- Check that the freeform attributes defined on link elements/customjs elements in search.xml are correctly applied to the inserted css/js blocks. (see old footer.vm)

# UI module

test moveMetadataFieldToGroup / moveAnnotationToGroup since we changed reactivity

# Form system

- Restore raw override field locking in the new render preparation path. The removed node-render helper used to disable fields whose controllers affected an active raw override parameter; that logic should move into FormBuilder.renderableNode().

# Document page

- Iets met suppressed errors in content en metadata die zijn toegevoegd in dev, maar in de spa versie straks niet meer gerenderd worden?
- article.scss staat nu in ArticlePageStatistics? rare plaats

# General nitpicks

- Footer version number is no longer in sync with the git version number. Need to re-apply the changes from dev branch
- Gap store is redundant, should be somewhere in pattern store. Should be restored from URL on initial load, and should be shared with article view.
- useBlackLabApi()/useFrontendApi() is used all over the place, should only ever be used from within components, and be passed as parameter elsewhere.
- FilterAutocomplete is dirty, needs to have the getter for autocomplete provided through props, which is okay, but makes it so that the store has to know the API suddenly because that's where initial registration + prop initialization takes place.

# REMOVED (check if all references really gone)

- split batch
