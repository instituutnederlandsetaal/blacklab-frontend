---
title: Global Settings
description: Configuring the server setup [blacklab-frontend.properties]
order: 0
---

# Global Settings

BlackLab Frontend is configured through a file **`blacklab-frontend.properties`** _(as long as you don't deploy the BlackLab Frontend under a different path/name, see below)_.  
If you don't provide a configuration file, the application will use default values for all settings, detailed below.

## Name and Location

You can place the file in any of the following locations, listed here in order of precedence.
This largely mirrors the options available for the BlackLab server.

1. **`BLACKLAB_CONFIG_DIR` environment variable** 
2. `$HOME/.blacklab` or `%USERDIR%/.blacklab` (Linux/Windows)
3. `/etc/blacklab` (Linux only)
4. The directory where the BlackLab Frontend `.war` file is located 
::: details Legacy locations (deprecated)
In order of precedence, the following locations are also checked, but are deprecated and will be removed in a future version:
- `CORPUS_FRONTEND_CONFIG_DIR` environment variable 
- `AUTOSEARCH_CONFIG_DIR` environment variable 
- `$HOME` or `%USERDIR%` (Linux/Windows)
- `/etc/${context path}` (Linux only)
:::

::: warning :warning: Beware of Name / Base-URL / Context Path Changes  
The **file name and relative location** of the `blacklab-frontend.properties` is actually taken from the **`context path` of the application**.  
That is, the path under which the Frontend is deployed in the servlet container.  

This typically matches the name of the `.war` file, but not always, some servlet containers allow you to change the context path without renaming the `.war` file.  
Adding extra segments to the context path (e.g. `/corpora/frontend/`, instead of `/blacklab-frontend/`) will also add those segments to the file path.
For the above example, the config should now be located in `${BLACKLAB_CONFIG_DIR}/corpora/frontend.properties` (note the `/corpora/frontend` in the path).
:::



::: details Examples
| `.war`                | Context Path (optional) | Proxy (optional)                             | Browser URL             | Config Location (relative to base dir)  |
|-----------------------|-------------------------|--------------------------------------------- |-------------------------|-----------------------------------------|
| `blacklab-frontend.war` | —                       | —                                            | `/blacklab-frontend`      | `blacklab-frontend.properties`            |
| `my-frontend.war`     | —                       | —                                            | `/my-frontend`          | `my-frontend.properties`                |
| any                   | `/test/blacklab-frontend` | —                                            | `/test/blacklab-frontend` | `test/blacklab-frontend.properties`       |
| any                   | `/text/blacklab-frontend` | `/frisian-corpora` → `/TEST/blacklab-frontend` | `/frisian-corpora`      | `test/blacklab-frontend.properties`       |

**Note:**  
- The config location is relative to the chosen config directory (see above).
- When using a proxy, the context path is determined by the servlet container, not the browser URL.
:::

## Example file and default values

  :::: tip The file is reloaded automatically
  Changes to the configuration file are applied automatically. The application will detect and use the updated settings without requiring a restart.  

  ::: warning
  :warning: **This does not work when the config is mounted inside a docker container from a Windows host (due to how file system events work).** 
  In that case, editing the config from within the container should work, or restarting the container will also pick up the changes.
  :::
::::

You can leave out any setting, and the BlackLab Frontend will just use the default value for that setting.  
The default values are shown in the example file below, which you can use as a template for your own configuration. Some defaults are a little _smart_ and will try to guess the right value based on the context path of the servlet.

<<< @/020_configuration/default_blacklab_frontend.properties
