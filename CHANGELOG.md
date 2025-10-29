# Improvements: 
- Querybuilder is now a Vue component, integrated in the main app,  
  this should fix many issues with the synchronization and slowness
- Improve the sorting dropdowns in the result table columns

# Fixes: 
- Fix some edge cases in the "copy to query builder" button in the Expert view
- Only add sort=alignments to viewgroup for parallel corpora.
- Fix "within" widget not working in extended search
- Docs: fix dead links
- Fix a broken sorting option in the result table (was using left/right instead of before/after, causing wrong behavior in rtl mode)
- Fix printCustomJs when annotation/metadata contains  a quote (`'`) in the name
- Fix split batch search 
- Fix a case of the application history showing duplicating entries
- Fix footer showing old version numbers

# Misc:
- Slight improvements to the i18n system, which should no longer download unused fallback locales during startup
- Hide align by block unless a target is chosen
- Add function for moving annotation/metadata between groups through API
- Improve hidden tagset generator menu
- Update Sass version
