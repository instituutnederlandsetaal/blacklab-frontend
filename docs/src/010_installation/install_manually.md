---
description: Manual installation instructions for BlackLab Frontend
order: 2
---

# Manual Installation

## Requirements

- Java 17 or higher for BlackLab Frontend.
- A Servlet 4.0 container such as [Apache Tomcat 9](https://tomcat.apache.org/).
- An instance of [BlackLab Server](https://blacklab.ivdnt.org/server/). Use BlackLab Server 4.x with the 4.x frontend.

## Steps

1. **Obtain a Release**
   - Releases can be downloaded [here](https://github.com/instituutnederlandsetaal/blacklab-frontend/releases).  
   - Alternatively, [build from source](/development/build_from_source)

2. **Place the WAR file**
   - Copy the release WAR from GitHub Releases or the Maven build to `webapps/blacklab-frontend.war`. Tomcat uses that filename for the `/blacklab-frontend/` URL.

3. [**Configuration**](/configuration/global_settings)  
   Configuration is described in more detail in the [Configuration section](/configuration/global_settings).
   Basic steps are: create an environment variable `BLACKLAB_CONFIG_DIR` pointing to a directory containing a `blacklab-frontend.properties` file.
   Use this file to configure the frontend server component.

4. **Access the Application**
   - Navigate to `http://localhost:8080/blacklab-frontend/` and you should be presented with a set of available corpora in BlackLab.

For further development and debugging help, see the **Development section**.
