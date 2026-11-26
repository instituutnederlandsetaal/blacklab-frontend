---
description: Manual installation instructions for BlackLab Frontend
order: 2
---

# Manual Installation

## Requirements

- Java 17 or higher for BlackLab Frontend.
- A Jakarta Servlet 6.0 container such as [Apache Tomcat 10.1](https://tomcat.apache.org/).
- An instance of [BlackLab Server](https://blacklab.ivdnt.org/server/). Pair BlackLab Frontend 5.0.0 with BlackLab Server 5.0.0. The frontend requests BlackLab's API v4 compatibility mode per request.

## Steps

1. **Obtain a Release**
   - Releases can be downloaded [here](https://github.com/instituutnederlandsetaal/blacklab-frontend/releases).  
   - Alternatively, [build from source](/development/build_from_source)

2. **Place the WAR file**
   - Place the `blacklab-frontend.war` file in the `webapps` directory of your servlet container (e.g., Tomcat).

3. [**Configuration**](/configuration/global_settings)  
   Configuration is described in more detail in the [Configuration section](/configuration/global_settings).
   Basic steps are: create an environment variable `BLACKLAB_CONFIG_DIR` pointing to a directory containing a `blacklab-frontend.properties` file.
   Use this file to configure the frontend server component.

4. **Access the Application**
   - Navigate to `http://localhost:8080/blacklab-frontend/` and you should be presented with a set of available corpora in BlackLab.

For further development and debugging help, see the **Development section**.
