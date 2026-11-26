# Use the development image for local builds.
# The Docker Hub pre_build hook extracts the major version from the release tag for automated builds.
# Meaning a build of Frontend 5.4.32 will replace `dev` with the extracted `5`
# Don't change the name of this argument without also updating the pre_build hook
ARG BLACKLAB_IMAGE_VERSION=dev

# Stage "builder": build the WAR file
#--------------------------------------
FROM maven:3.9-eclipse-temurin-17 AS builder

# Copy source
WORKDIR /app
COPY . .

# Build the WAR.
RUN --mount=type=cache,target=/root/.m2  \
    --mount=type=cache,target=/app/src/frontend/node \
    --mount=type=cache,target=/app/src/frontend/node_modules \
    mvn --no-transfer-progress clean package


# Tomcat container with the WAR file
#--------------------------------------
FROM instituutnederlandsetaal/blacklab:$BLACKLAB_IMAGE_VERSION

# What the name of the Tomcat app (and therefore the URL should be). Can be overridden.
ARG TOMCAT_APP_NAME=blacklab-frontend

# Copy the WAR file
COPY --from=builder /app/target/blacklab-frontend-*.war /usr/local/tomcat/webapps/${TOMCAT_APP_NAME}.war
