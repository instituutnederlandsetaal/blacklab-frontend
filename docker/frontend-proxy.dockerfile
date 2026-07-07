# Base image of BlackLab to use. Should match major version of Frontend.
# NOTE: DO NOT CHANGE THE NAME OF THIS ARGUMENT!!
# This variable is dynamically updated during dockerhub cloud builds! see the pre_build hook, 
# DO NOT change manually and expect this to work in the cloud.
ARG BLACKLAB_IMAGE_VERSION=dev

# Stage "builder": build the WAR file
#--------------------------------------
FROM maven:3.9-eclipse-temurin-17 AS builder
RUN --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# Copy source
WORKDIR /app
COPY . .

# Build the WAR.
RUN --mount=type=cache,target=/root/.m2  \
    --mount=type=cache,target=/app/src/frontend/node \
    --mount=type=cache,target=/app/src/frontend/node_modules \
    mvn --no-transfer-progress clean package

RUN javac -Xlint:-options --release 8 -d /tmp /app/docker/RelaxTomcatQueryChars.java


# Tomcat container with the WAR file
#--------------------------------------
FROM instituutnederlandsetaal/blacklab-proxy:${BLACKLAB_IMAGE_VERSION}

# What the name of the Tomcat app (and therefore the URL should be). Can be overridden.
ARG TOMCAT_APP_NAME=blacklab-frontend

# Firefox may resubmit percent-encoded square brackets from the address bar as
# raw query characters; allow those in Tomcat so shared URLs keep working.
COPY --from=builder /tmp/RelaxTomcatQueryChars.class /tmp/RelaxTomcatQueryChars.class
RUN java -cp /tmp RelaxTomcatQueryChars /usr/local/tomcat/conf/server.xml \
    && rm /tmp/RelaxTomcatQueryChars.class

# Copy the WAR file
COPY --from=builder /app/target/blacklab-frontend-*.war /usr/local/tomcat/webapps/${TOMCAT_APP_NAME}.war
