# Base image of BlackLab to use. Should match major version of Frontend.
ARG BLACKLAB_IMAGE_VERSION=4

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
FROM instituutnederlandsetaal/blacklab-proxy:${BLACKLAB_IMAGE_VERSION}

# What the name of the Tomcat app (and therefore the URL should be). Can be overridden.
ARG TOMCAT_APP_NAME=blacklab-frontend

# Copy the WAR file
COPY --from=builder /app/target/blacklab-frontend-*.war /usr/local/tomcat/webapps/${TOMCAT_APP_NAME}.war