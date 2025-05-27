---
description: Manual installation instructions for BlackLab Frontend
order: 1
---

# Manual Installation

## Requirements

- Java 11 (Jdk up to 15 will work, 16+ might cause some reflection errors, we'll fix these once BlackLab migrates to `jakarta`)
- A java servlet container such as [Apache Tomcat](https://tomcat.apache.org/).  
   - Tomcat 7 version `7.0.76` or newer 
   - Tomcat 8 version `8.0.42` or newer.
   - Tomcat 9 any version should work, latest is recommended.
   - Tomcat 10 is **not supported**  
   This because the Frontend has not yet migrated from `javax`->`jakarta`.  
   We will likely perform this migration in version `4.1`.

   Using older versions of `Tomcat` will cause some [warnings from dependencies](https://bz.apache.org/bugzilla/show_bug.cgi?id=60688). 
- An instance of [BlackLab Server](https://github.com/instituutnederlandsetaal/BlackLab/).  
   While we do our best to make the frontend work with older versions of BlackLab, use a matching version of BlackLab (so `blacklab-frontend v2.0` with `blacklab-server v2.0`).

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
