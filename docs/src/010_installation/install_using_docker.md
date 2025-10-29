---
description: Docker installation instructions for BlackLab Frontend
order: 1
---

# Installation using Docker

## Basic Setup

Here is an example `docker-compose.yml` file for a simple installation of BlackLab and BlackLab Frontend that will let you explore the application.


1. **Create the `docker-compose.yml` file**  
   Place the following file in a directory of your choice.
   Data will be stored in a `data` directory in the same location as the `docker-compose.yml` file.
   The compose file contains a basic configuration for BlackLab that enables a **test user**, so you can play around with the application without having to set up a proxy or authentication.

   ::: code-group
      <<< @/../../docker/docker-compose.yml
   :::


2. **Run Docker Compose**  
   This will start the service
   ```bash
   docker-compose up -d
   ```

3. **Access the Application**
   - The BlackLab Frontendis now available at http://localhost:8080/blacklab-frontend/
   - The BlackLab-Server API is now available at http://localhost:8080/blacklab-server/


4. **You should now be presented with options for uploading data.**

   Since there are no public corpora available (we didn't add any!), you will see a page with options to upload data.

   ![Page with uploads enabled](with_uploads_enabled.png)


## Production setup


For production use, there are two things you could consider:

### Without upload functionality

1. **Create a real config**   
  Copy the default [blacklab-server.yaml](https://blacklab.ivdnt.org/server/configuration.html) file from the `docker-compose` directory into a `blacklab-server.yaml` file.
   <FileTree hl=7>
   blacklab
      docker-compose.yml
      data 
         index
         user-index
         index-configs
         blacklab-server.yaml here
   </FileTree>

2. **Update `docker-compose.yml`** to mount the config you just created:

   This will disable authentication and make everyone be anonymous, and since uploads are disabled if you're not logged in, this will effectively disable uploads.
   Now you can add some public corpora, which anyone can access without needing to log in.

   ```yaml
   volumes:
      - ./data/index:/data/index
      - ./data/user-index:/data/user-index
      - ./data/index-configs:/etc/blacklab/projectconfigs
      - ./blacklab-server.yaml:/etc/blacklab/blacklab-server.yaml # [!code ++]      
   configs: # [!code --]
      - source: blacklab-server # [!code --]
        target: /etc/blacklab/blacklab-server.yaml # [!code --]
        mode: 0444 # read-only for the container [!code --]
   ```

3. **Restart the service**
   ```bash
   docker compose up -d
   ```
4. **Add some public corpora**  
  Since you just disabled uploads, users will see the following - rather boring - page:
  ![Boring page without uploads](no_corpora_available.png)


### With individual user accounts & uploads

::: warning :information_source: **BlackLab relies on external software for user registration and login.**  

*BlackLab* relies on external software such as proxies to implement user authentication, using a forwarded header or request attribute (such as `remote-user`) to know who is logged in.  
The *BlackLab Frontend* in turn relies on BlackLab, so you should only need to configure BlackLab (and your proxy).

In the first example, we forced BlackLab to use a test user, just so that you can play around with the upload functionality.
If you want to use BlackLab in a production environment, you will need to set up a proxy that can authenticate users and forward the user ID to BlackLab.

:bust_in_silhouette:  [This tutorial](/tutorials/authentication) details how to set up a proxy that can integrate with Microsoft, Google, Facebook, etc.  
For a more technical explanation, consult [the BlackLab docs](https://blacklab.ivdnt.org/server/user-corpora.html).

:::
