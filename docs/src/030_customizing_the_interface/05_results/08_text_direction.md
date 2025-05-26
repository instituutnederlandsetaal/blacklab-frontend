# Text Direction (RTL)

You can configure the text direction of your corpus interface to support right-to-left (RTL) languages such as Arabic or Hebrew. This affects many aspects of the interface, including the order of columns in result tables, the ordering of sentences in concordances, and the text direction of dropdowns.

## How to configure text direction

Text direction is set in your corpus index format configuration file (`*.blf.yaml` or `*.blf.json`). Add the following property under `corpusConfig`:

```yaml
corpusConfig:
  textDirection: "rtl"
```

- Use `"rtl"` for right-to-left languages.
- The default is left-to-right (`"ltr"`).

**Note:** This feature is not actively used by us, if you encounter an issue, please [create an issue](https://github.com/instituutnederlandsetaal/corpus-frontend/issues/new).

## What does this affect?

Setting `textDirection: "rtl"` will change:

- The order of columns in result tables (before/hit/after).
- The ordering of sentences in concordances.
- The text direction of dropdowns and other UI elements.
- Many other minor aspects of the interface to better support RTL languages.


## Additional notes

- This setting must be present in your corpus index format file before indexing data.
- If you edit the format config after indexing, you may need to manually update the `indexmetadata.yaml` or `indexmetadata.json` file and reload the corpus.
- If you encounter any issues, please report them on the [GitHub issue tracker](https://github.com/INL/corpus-frontend/issues/new).



## Mixed text direction

In order to support mixed text directions, your document metadata must include a `textDirection` field. This field should specify the text direction for each document, allowing the interface to render them correctly.
Documents that do not have this field will default to the corpus-wide text direction (`rtl` in this example).

```yaml [.blf.yaml]
corpusConfig:
  textDirection: "rtl" # Default text direction for the corpus\
metadata: 
  containerPath: "..."
  fields: 
  - name: "textDirection"
    valuePath: "my-metadata/textDirection" 
```

--------

::: info :tada:
Special thanks to [Janneke van der Zwaan](https://github.com/jvdzwaan) for initially helping us develop this feature!
:::
