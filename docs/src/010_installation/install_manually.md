---
description: Manual installation instructions for BlackLab Frontend
order: 2
---

# Manual Installation

## Requirements

- Java 17 or higher for BlackLab Frontend.
- A Jakarta Servlet 6.0 container such as [Apache Tomcat 10.1](https://tomcat.apache.org/).
- An instance of [BlackLab Server](https://blacklab.ivdnt.org/server/). Use BlackLab Server `dev` with the experimental frontend, as in the published Docker image.

## Steps

1. **Obtain a Release**
   - [Build from source](/development/build_from_source) on the `experimental` branch to obtain the preview WAR. Stable WARs are available from [GitHub Releases](https://github.com/instituutnederlandsetaal/blacklab-frontend/releases).

2. **Place the WAR file**
   - Copy the release WAR from GitHub Releases or the Maven build to `webapps/blacklab-frontend.war`. Tomcat uses that filename for the `/blacklab-frontend/` URL.

3. [**Configuration**](/configuration/global_settings)  
   Configuration is described in more detail in the [Configuration section](/configuration/global_settings).
   Basic steps are: create an environment variable `BLACKLAB_CONFIG_DIR` pointing to a directory containing a `blacklab-frontend.properties` file.
   Use this file to configure the frontend server component.

4. **Access the Application**
   - Navigate to `http://localhost:8080/blacklab-frontend/` and you should be presented with a set of available corpora in BlackLab.

For further development and debugging help, see the **Development section**.
