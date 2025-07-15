Too much to list! But let's try anyway...

Features: 
- Brand new docs site!
- Support for parallel corpora
- Support for dependency trees and relation querying
- Support for highlighting of capture groups, and grouping on those captures
- Improved groupBy
- Internationalization (currently natively supported: Dutch, English, Chinese - but you can add your own)
- Support for mixed-direction text corpora

Improvements: 
- Better hit highlighting
- Simplified handling of authentication
- Autocomplete and documentation when creating a custom import format
- Support ENV vars for configuration (docker users rejoice!)
- Support live reload for central .properties configuration
- Improved logging and error handling in the backend, particularly around xslt transformations and configs
- Much less error prone pagination in documents
- More uniform handling results when grouping, can now click open individual hits and docs within a group

Fixes: 
- Navbar layout is much better on smaller screens (still not perfect)
- Wide view now always works properly and saves between sessions
- Fix some cases of broken regex and wildcard escaping in simple and advanced search
- Fix UI customizations not being validated properly, making it easy to break the page

Misc:
- Add explicit licence file (Same Apache 2.0)
- Project renamed from Corpus Frontend to BlackLab Frontend
- Update Java dependencies, target Java 17 for parity with BlackLab
- /config endpoint now shows the current version, commit ID, message and blacklab server URL
