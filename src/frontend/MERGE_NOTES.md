# Corpus store

store/search/corpus.ts verdwenen in SPA
Verplaatst naar store/corpus.ts?
Ook wat veranderd met tagset loading
Is nu deel van CorpusChange event


# URL decoding

Edit luceneparser.ts to also return AST, so url-state-parser-search doesn't need to do double work


# Customjs/customcss
Don't forget to add the attributes defined on the elements in search.xml to the inserted css/js blocks. (see old footer.vm)


# UI module

test moveMetadataFieldToGroup / moveAnnotationToGroup since we changed reactivity 

# Document page
- Iets met suppressed errors in content en metadata die zijn toegevoegd in dev, maar in de spa versie straks niet meer gerenderd worden?
- article.scss staat nu in ArticlePageStatistics? rare plaats

