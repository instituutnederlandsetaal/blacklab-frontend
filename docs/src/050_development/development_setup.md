# Development Setup

This guide helps you set up a development environment for the BlackLab Frontend project, covering both the Java backend and JavaScript frontend.

## 1. Prerequisites

- **Java IDE:**  
  - [IntelliJ IDEA](https://www.jetbrains.com/idea/) (requires license for Tomcat)
  - [Eclipse](https://www.eclipse.org/) ([setup guide](https://eclipse.dev/webtools/community/education/web/t320/Configuring_an_Application_Server_in_Eclipse.pdf))
  - [Visual Studio Code](https://code.visualstudio.com/) ([Tomcat setup](https://code.visualstudio.com/docs/java/java-tomcat-jetty))
- **Node.js:**  
  - [Download Node.js](https://nodejs.org/) (latest LTS, e.g. `22.x`)
- **Frontend Editor:**  
  - [Visual Studio Code](https://code.visualstudio.com/) with the Vue extension (VSCode will prompt to install it when opening `src/frontend`)

## 2. Run BlackLab Server with Docker

### 2.1 Install Docker

- [Download Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Follow installation instructions for your OS
- Start Docker Desktop

### 2.2 Create `docker-compose.yml`

```yaml
services:
  blacklab:
    image: instituutnederlandsetaal/blacklab-server:dev
    ports:
      - 8082:8080  # Maps container port 8080 (BlackLab) to host port 8082, as 8080 will be used by Tomcat
```

- Save as `docker-compose.yml`.

### 2.3 Start BlackLab

```bash
docker-compose up -d
```

- BlackLab Server API: [http://localhost:8082/blacklab-server/](http://localhost:8082/blacklab-server/)

## 3. Configure and Run the BlackLab Frontend

### 3.1 Create `blacklab-frontend.properties`

```properties
# Point to the Vite dev server (host+port, no trailing slash)
vite=localhost:5173
# Point to the BlackLab instance running in Docker
blsUrl=http://localhost:8082/blacklab-server/ 
# Disable caching of template files and configs serverside
cache=false
```

- This config makes the frontend use the Vite dev server for JS modules and disables caching for immediate updates.

### 3.2 Run in Your IDE

- Start the BlackLab Frontend servlet from your IDE (IntelliJ, VSCode, or Eclipse).
- The frontend will be available at [http://localhost:8080/blacklab-frontend/](http://localhost:8080/blacklab-frontend/), but will not work until the frontend JavaScript is built.

## 4. Start the Vite Dev Server

Compile and watch JavaScript files using Vite.  
Run the following in `src/frontend/`:

```bash
cd src/frontend/
npm install
npm start
```

- Vite dev server: [http://localhost:5173/](http://localhost:5173/)

**Note:**  
The default Vite port is `5173`. To change it, edit the Vite server settings in [vite.config.ts](src/frontend/vite.config.ts).

**Hot Reload:**  
When you change a JS file, the page reloads automatically.

## 5. Development Workflow

- The Vite dev server auto-reloads on JS changes.
- If you see "No corpora available", add a corpus to BlackLab.
- For production, run `mvn clean package` in the project root to build and embed frontend assets in the WAR file. Remove `vite` from your config when testing the production build.

## 6. Backend Development Notes

The backend is written in Java and is mainly responsible for:
- Serving the correct JavaScript file and setting up the page skeleton (using [Apache Velocity](https://velocity.apache.org/)).
- Handling requests: `MainServlet` fetches corpus data from BlackLab, reads the relevant `search.xml`, and determines which page to serve (via `*Response` classes). This sets up the header, footer, and client-side variables (mainly URLs).
- Most of the application logic happens client-side.
- The backend also handles the `document` page, retrieving XML and metadata and converting it to HTML.

## Tips

- Install the Vue devtools ([Chrome](https://chrome.google.com/webstore/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd), [Firefox](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)).
- Using the `vite` property in `blacklab-frontend.properties` with the Vite dev server lets you sideload JavaScript for real-time compilation and hot reload.
- Example `vite` for sideloading (no trailing slash!):
  ```properties
  vite=localhost:5173
  ```