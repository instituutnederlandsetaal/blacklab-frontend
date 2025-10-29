package nl.inl.corpuswebsite.utils;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.nio.file.ClosedWatchServiceException;
import java.nio.file.FileSystems;
import java.nio.file.Path;
import java.nio.file.StandardWatchEventKinds;
import java.nio.file.WatchEvent;
import java.nio.file.WatchKey;
import java.nio.file.WatchService;
import java.util.Arrays;
import java.util.Date;
import java.util.Objects;
import java.util.Optional;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.stream.Stream;

import javax.servlet.ServletContext;
import javax.servlet.ServletContextEvent;
import javax.servlet.ServletContextListener;

import org.apache.commons.lang3.StringUtils;
import org.apache.commons.lang3.SystemUtils;

/**
 * <pre>
 * Class to manage our global config file (default name: blacklab-frontend.properties)
 * A default setup should *just work*, provided blacklab can be found on the same host at /blacklab-server/.
 *
 * Config files are loaded in the following order:
 * - Environment variables first (BlackLab Frontend, then blacklab as fallback).
 * - Then /etc/blacklab-frontend, then /etc/blacklab as fallback. (linux only)
 * - Then the directory containing the webapp, then the user's home directory.
 *
 * Configurations files are NOT case-sensitive.
 * Missing properties are logged and replaced with their default values.
 * Some properties may be normalized (e.g. trailing slashes are removed, or empty strings are replace by null).
 * </pre>
 */
public class GlobalConfig implements ServletContextListener {
    private static final Logger logger = Logger.getLogger(GlobalConfig.class.getName());

    private static final Properties defaultProps = new Properties();

    /** Commit hash */
    public static final String commitHash;
    /** Commit time */
    public static final String commitTime;
    /** Commit message */
    public static final String commitMessage;
    /** Maven project version */
    public static final String version;

    /**
     * Thread that polls the watchService in the background and reloads the config values on change of the file.
     * Can be null if config was not initialized from a file.
     */
    static Thread watchThread;
    /**
     * The watch service that watches the config file.
     * Can be null if config was not initialized from a file.
     */
    static WatchService watchService;

    /**
     * Created during servlet setup.
     * The values of the properties are not static by design. To allow for testing (i.e. passing a manually created instance).
     */
    private static GlobalConfig instance;

    // ===================
    // Instance properties
    // ===================

    private final Properties instanceProps;

    private static final String SETTING_ENV_KEY_PREFIX = "BF_"; 

    public enum Keys {
        // #region GlobalConfigKeysInDocs
        /**
         * Message to display at the top of the page. Note that this may contain HTML. https://github.com/instituutnederlandsetaal/blacklab-frontend/issues/247
         * NULL if not set.
         */
        BANNER_MESSAGE("bannerMessage"),
        /** Url to reach blacklab-server from this application. Never ends with a slash. */
        BLS_URL_ON_SERVER("blsUrl"),
        /** Url to reach blacklab-server from the browser. Never ends with a slash. */
        BLS_URL_ON_CLIENT("blsUrlExternal"),
        /** Where static content, custom xslt and other per-corpus data is stored. Never ends with a slash. */
        CORPUS_CONFIG_DIR("corporaInterfaceDataDir"),
        /** Name of the default fallback directory/corpus in the PROP_DATA_PATH. Never ends with a slash. */
        DEFAULT_CORPUS_CONFIG("corporaInterfaceDefault"),
        /**
         * Set the "withCredentials" option for all ajax requests made from the client to the (blacklab/frontend)-server.
         * Passes authentication cookies to blacklab-server.
         * This may be required if your server is configured to use authentication.
         * NOTE: this only works if the frontend and backend are hosted on the same domain, or when the server does not pass "*" for the Access-Control-Allow-Origin header.
         * (BlackLab does pass "*" by default, so you'll need a proxy to make this setup work).
         */
        FRONTEND_WITH_CREDENTIALS("withCredentials"),
        /** Development mode, allow script tags to load js from an external server (e.g. webpack-dev-server), defaults to ${CF_URL_ON_CLIENT}/js. Never ends in a slash. */
        JSPATH("jspath"),
        // todo remove and use a file watcher or something
        /** Development mode, disable caching of any corpus data (e.g. search.xml, article.xsl, meta.xsl etc) */
        CACHE("cache"),
        /** Enable/disable the debug info checkbox in the interface */
        SHOW_DEBUG_CHECKBOX_ON_CLIENT("debugInfo"),
        /**
         * Url to reach the blacklab-frontend servlet (i.e. this) from the browser. Usually not required, but might be necessary when server is behind a proxy,
         * defaults to the servlet context path. Never ends with a slash.
         */
        CF_URL_ON_CLIENT("cfUrlExternal"),

        /** ClientID for OpenID Connect authentication. Defaults to "blacklab-frontend" */
        OIDC_CLIENT_ID("oidc.clientId"),
        /** Authority for OpenID Connect authentication. This is usually the root of the oidc server. Ex. for Keycloak, https://login.ivdnt.org/realms/blacklab/ */
        OIDC_AUTHORITY("oidc.authority"),
        /** Metadata URL for the OpenID Connect server passed in the "oidc.authority" setting. Ex. https://login.ivdnt.org/realms/blacklab/.well-known/openid-configuration */
        OIDC_METADATA_URL("oidc.metadataUrl"),

        // various settings to copy an auth header from a client request to a blacklab request
        // (we forward/proxy various requests to BlackLab, and need to pass the auth/username along)
        /** Defaults to "Authorization" */
        AUTH_SOURCE_NAME("auth.source.name"),
        /**
         * One of "header", "cookie", "attribute" (ajp), "parameter" (query param).
         * Defaults to "header".
         */
        AUTH_SOURCE_TYPE("auth.source.type"),
        /** Defaults to "Authorization" */
        AUTH_TARGET_NAME("auth.target.name"),
        /**
         * One of "header", "cookie", "parameter" (query param). Attribute is not supported as creating an AJP request from Java is not possible.
         * Defaults to "header".
         */
        AUTH_TARGET_TYPE("auth.target.type");

        // #endregion GlobalConfigKeysInDocs

        public final String s;
        Keys(String s) {
            this.s = s;
        }
        public String toString() {
            return s;
        }

        /** Return the key for a given string, case-insensitive. Null is returned when the string does not correspond to an entry. */
        public static Keys get(String s) {
            return Arrays.stream(Keys.values()).filter(k -> k.s.equalsIgnoreCase(s)).findFirst().orElse(null);
        }
    }
    

    static {
        // Keep these in sync with what we document as defaults in README.md
        set(defaultProps, Keys.BLS_URL_ON_CLIENT,               "/blacklab-server"); // no domain to account for proxied servers
        set(defaultProps, Keys.BLS_URL_ON_SERVER,               "http://localhost:8080/blacklab-server");
        set(defaultProps, Keys.CORPUS_CONFIG_DIR,               SystemUtils.IS_OS_WINDOWS ? "C:\\etc\\blacklab\\projectconfigs" : "/etc/blacklab/projectconfigs");
        set(defaultProps, Keys.DEFAULT_CORPUS_CONFIG,           "default");
        set(defaultProps, Keys.SHOW_DEBUG_CHECKBOX_ON_CLIENT,   "false");
        set(defaultProps, Keys.FRONTEND_WITH_CREDENTIALS,       "false");
        set(defaultProps, Keys.CACHE,                           "true");
        set(defaultProps, Keys.OIDC_CLIENT_ID,                  "blacklab-frontend");

        set(defaultProps, Keys.AUTH_SOURCE_NAME,                "Authorization");
        set(defaultProps, Keys.AUTH_SOURCE_TYPE,                "header");
        set(defaultProps, Keys.AUTH_TARGET_NAME,                "Authorization");
        set(defaultProps, Keys.AUTH_TARGET_TYPE,                "header");
        // JSPATH and CF_URL_ON_CLIENT properly initialized later, because we need the servlet context path for that.
        // JSPATH is also dependent on CF_URL_ON_CLIENT, so we need to watch out for the case where the user CF_URL_ON_CLIENT but not JSPATH.
        set(defaultProps, Keys.JSPATH,                          "/blacklab-frontend/js");
        set(defaultProps, Keys.CF_URL_ON_CLIENT,                "/blacklab-frontend");

       

        // git.properties is generated by the git-commit-id-maven-plugin
        Properties props = new Properties();
        try (InputStream stream = GlobalConfig.class.getResourceAsStream("/git.properties")) {
            if (stream == null) {
                // Set it all to the current time so cache busting works properly in development mode.
                String date = new Date().toString();
                commitTime = commitMessage = version = date;
                commitHash = date.hashCode() + ""; // we use this to cache-bust resources so make it a hash without spaces etc.
            } else {
                props.load(stream);

                commitHash = props.getProperty("git.commit.id.full");
                commitTime = props.getProperty("git.commit.time");
                commitMessage = props.getProperty("git.commit.message.short");
                version = props.getProperty("git.build.version");
            }
        } catch (IOException e) {
            throw new RuntimeException("Could not load git.properties. It should have been auto-created at build time. Verify the git-commit-id-maven-plugin settings", e);
        }
    }

    public static GlobalConfig getInstance() {
        if (instance == null) throw new IllegalStateException("GlobalConfig not initialized. Should happen during servlet initialization.");
        return instance;
    }

    public static GlobalConfig getDefault() {
        // Explicitly pass an empty props object, so we can detect if settings come from ENV or not based on presence
        return new GlobalConfig(new Properties());
    }

    
    /** 
     * DO NOT USE THIS METHOD.
     * Required for reflection in the servlet container 
     * Creates a default config instance. 
     */
    public GlobalConfig() {
        this(defaultProps);
    }

    GlobalConfig(File f) {
        this(loadProperties(f));
        watchConfigFile(f);
    }

    GlobalConfig(Properties p) {
        this.instanceProps = new Properties();
        this.apply(p);
    }

    /** Separate function to allow reload of the config file to replace settings in existing config instances. */
    void apply(Properties p) {
        validate(p);
        this.instanceProps.clear();
        this.instanceProps.putAll(p);
    }

    public String get(Keys k) {
        return get(instanceProps, k);
    }

    public boolean getBool(Keys k) {
        return Boolean.parseBoolean(get(instanceProps, k));
    }

    private static String get(Properties p, Keys k) {
        return p.getProperty(k.toString());
    }

    // Keep private, the config might reload itself so setting values externally is not a good idea.
    private static void set(Properties p, Keys k, String v) {
        p.setProperty(k.toString(), v);
    }

    // Keep private, the config might reload itself so setting values externally is not a good idea.
    private void set(Keys k, String v) {
        set(instanceProps, k, v);
    }

    // For use during reloading and validation
    private void remove(Keys k) {
        remove(instanceProps, k);
    }

    // For use during reloading and validation
    private static void remove(Properties p, Keys k) {
        p.remove(k.toString());
    }

    private boolean isDefault(Keys k) {
        return isDefault(instanceProps, k);
    }

    private static boolean isDefault(Properties p, Keys k) {
        return Objects.equals(get(defaultProps, k), get(p, k));
    }

    private static boolean contains(Properties p, Keys k) {
        return p.containsKey(k.toString());
    }


    /**
     * To be called before finishing initialization.
     * Warn about missing props.
     * Replace missing props with their defaults.
     * Fix up any inconsistencies, such as trailing slashes, so the rest of the code can assume a consistent format.
     */
    private static void validate(Properties instanceProps) {
        // Before we do anything, we need to normalize the property names to prevent collisions, etc.
        for (String randomlyCaptilizedKey : instanceProps.stringPropertyNames()) {
            final String currentValue = instanceProps.getProperty(randomlyCaptilizedKey);
            Keys properlyCapitalizedKey = Keys.get(randomlyCaptilizedKey);
            if (properlyCapitalizedKey == null) continue; // property does not map to a known key, ignore it

            // replace with the properly capitalized version
            // removing while iterating is okay, stringPropertyNames() returns a copy of the keys
            instanceProps.remove(properlyCapitalizedKey);
            set(instanceProps, properlyCapitalizedKey, currentValue);
        }

        // Now, apply environment variables to the config.
        for (Keys key : Keys.values()) {
            String[] envKeysToTry = new String[] {
                SETTING_ENV_KEY_PREFIX + key.name(),                      // e.g., BF_BLS_URL_ON_CLIENT
                SETTING_ENV_KEY_PREFIX + key.toString(),                  // e.g., BF_blsUrlExternal
                SETTING_ENV_KEY_PREFIX + key.toString().toUpperCase(),    // e.g., BF_BLSURLEXTERNAL
                // camelCase to CAMEL_CASE
                SETTING_ENV_KEY_PREFIX + key.toString()                   // e.g., BF_BLS_URL_EXTERNAL
                    .replaceAll("([a-z])([A-Z]+)", "$1_$2")
                    .replaceAll("[-\\.]", "_") // also replace dashes and dots
                    .toUpperCase() 
            };
            for (String envKey : envKeysToTry) {
                String envValue = System.getenv(envKey);
                if (envValue != null) {
                    logger.fine(String.format("Setting config key '%s' from environment variable '%s' - %s", key, envKey, envValue));
                    set(instanceProps, key, envValue);
                    break; // stop after the first match
                }
            }
        }

        // If only one of the (clientside, serverside) blacklab urls is set
        // Initialize the other one to the same value.
        // We assume that if one is set, that means BlackLab is not in the expected location, so both should be changed.
        if (contains(instanceProps, Keys.BLS_URL_ON_CLIENT) != contains(instanceProps, Keys.BLS_URL_ON_SERVER)) {
            Keys presentKey = contains(instanceProps, Keys.BLS_URL_ON_CLIENT) ? Keys.BLS_URL_ON_CLIENT : Keys.BLS_URL_ON_SERVER;
            Keys missingKey = presentKey == Keys.BLS_URL_ON_CLIENT ? Keys.BLS_URL_ON_SERVER : Keys.BLS_URL_ON_CLIENT;
            set(instanceProps, missingKey, get(instanceProps, presentKey));
            logger.warning("Found changed BlackLab URL in " + presentKey + ", but not in " + missingKey + ".\n" + 
            "  Setting " + missingKey + " to the same value: " + get(instanceProps, presentKey));
        }

        // Now check for missing props, warn and set defaults
        for (String defaultPropName : defaultProps.stringPropertyNames()) {
            String defaultPropValue = defaultProps.getProperty(defaultPropName);
            if (!instanceProps.containsKey(defaultPropName) && defaultPropValue != null) {
                logger.fine(String.format("Config setting not found '%s' : using default value '%s'", defaultPropName, defaultPropValue));
                instanceProps.setProperty(defaultPropName, defaultPropValue);
            }
        }

        // perform some final checks, such as removing any trailing slash (just to be consistent)
        if (StringUtils.isBlank(get(instanceProps, Keys.BANNER_MESSAGE))) remove(instanceProps, Keys.BANNER_MESSAGE);
        set(instanceProps, Keys.BLS_URL_ON_SERVER, StringUtils.stripEnd(get(instanceProps, Keys.BLS_URL_ON_SERVER), "/\\"));
        set(instanceProps, Keys.BLS_URL_ON_CLIENT, StringUtils.stripEnd(get(instanceProps, Keys.BLS_URL_ON_CLIENT), "/\\"));
        set(instanceProps, Keys.CORPUS_CONFIG_DIR, StringUtils.stripEnd(get(instanceProps, Keys.CORPUS_CONFIG_DIR), "/\\"));
        set(instanceProps, Keys.DEFAULT_CORPUS_CONFIG, StringUtils.stripEnd(get(instanceProps, Keys.DEFAULT_CORPUS_CONFIG), "/\\"));
        set(instanceProps, Keys.JSPATH, StringUtils.stripEnd(get(instanceProps, Keys.JSPATH), "/\\"));
        set(instanceProps, Keys.CF_URL_ON_CLIENT, StringUtils.stripEnd(get(instanceProps, Keys.CF_URL_ON_CLIENT), "/\\"));
        if (isDefault(instanceProps, Keys.JSPATH) && !isDefault(instanceProps, Keys.CF_URL_ON_CLIENT)) {
            // JSPath is the default, but the CF_URL_ON_CLIENT is not. 
            // That means the js won't be found because it's not at the expected location.
            // This can happen if someone sets the CF_URL_ON_CLIENT to something other than the default, but doesn't set the JSPATH.
            // In that case our defaults set the JSPATH to /${contextPath}/js, but we need to update it to match the new CF_URL_ON_CLIENT
            set(instanceProps, Keys.JSPATH, get(instanceProps, Keys.CF_URL_ON_CLIENT) + "/js");
            logger.info(String.format("Detected modified %s but default %s, updating %s to match. New value '%s'",
                    Keys.CF_URL_ON_CLIENT, Keys.JSPATH, Keys.JSPATH, get(instanceProps, Keys.JSPATH)));
        }

        if (Stream.of("header", "cookie", "attribute", "parameter").noneMatch(get(instanceProps, Keys.AUTH_SOURCE_TYPE)::equalsIgnoreCase)) {
            logger.warning("Invalid value for " + Keys.AUTH_SOURCE_TYPE + ": " + get(instanceProps, Keys.AUTH_SOURCE_TYPE) + ". Defaulting to 'header'.");
            set(instanceProps, Keys.AUTH_SOURCE_TYPE, "header");
        }
        if (Stream.of("header", "cookie", "parameter").noneMatch(get(instanceProps, Keys.AUTH_TARGET_TYPE)::equalsIgnoreCase)) {
            logger.warning("Invalid value for " + Keys.AUTH_TARGET_TYPE + ": " + get(instanceProps, Keys.AUTH_TARGET_TYPE) + ". Defaulting to 'header'.");
            set(instanceProps, Keys.AUTH_TARGET_TYPE, "header");
        }
    }

    /**
     * Config file resolution order:
     * Environment variables first (BlackLab Frontend, then blacklab as fallback).
     * Then /etc/blacklab-frontend, then /etc/blacklab as fallback.
     * Then the directory containing the webapp, then the user's home directory.
     * </pre>
     * @param ctx ServletContext
     * @return GlobalConfig, with default settings if none was found
     */
    private static GlobalConfig loadConfigFile(ServletContext ctx) {
        final String applicationName = ctx.getContextPath().replaceAll("^/", "");
        final String configFileName = applicationName + ".properties";

        set(defaultProps, Keys.CF_URL_ON_CLIENT, "/" + applicationName);
        set(defaultProps, Keys.JSPATH, "/" + applicationName + "/js");

        // Get config dir from environment variable
        String envNameFromAppName = applicationName.replaceAll("\\W", "_").toUpperCase() + "_CONFIG_DIR";
        Optional<GlobalConfig> config =
                tryLoadConfigEnv(envNameFromAppName, configFileName) // deprecated? properties files already use the app name
                .or(() -> tryLoadConfigEnv("CORPUS_FRONTEND_CONFIG_DIR", configFileName)) // deprecated
                .or(() -> tryLoadConfigEnv("AUTOSEARCH_CONFIG_DIR", configFileName)) // deprecated
                .or(() -> tryLoadConfigEnv("BLACKLAB_CONFIG_DIR", configFileName)); // same as BlackLab

        // Look in the same dir as the WAR file, or in .blacklab under the user's home dir
        File userHomeDir = new File(System.getProperty("user.home")); // works on both linux and windows.
        config = config
                .or(() -> tryLoadConfigPath(new File(ctx.getRealPath("/")).getParentFile().getPath(), configFileName)) // WAR path; also works for multiple frontends. Deprecated
                .or(() -> tryLoadConfigPath(userHomeDir.getPath(), configFileName)) // deprecated
                .or(() -> tryLoadConfigPath(new File(userHomeDir, ".blacklab").getPath(), configFileName)); // same as BlackLab

        // Look in /etc/blacklab/
        if (SystemUtils.IS_OS_UNIX) {
            config = config
                    .or(() -> tryLoadConfigPath("/etc/" + applicationName + "/", configFileName)) // deprecated
                    .or(() -> tryLoadConfigPath("/etc/blacklab/", configFileName)); // same as BlackLab
        }

        // Return config, or default values if none found
        return config.orElseGet(() -> {
            logger.info("No global config file found, using default settings.");
            return getDefault();
        });
    }

    private static Optional<GlobalConfig> tryLoadConfigEnv(String envName, String filename) {
        String path = System.getenv(envName);
        if (path == null) {
            logger.fine("Config from env '" + envName + "': not set - ignoring.");
            return Optional.empty();
        }
        logger.info("Config from env '" + envName + "': " + path);
        Optional<GlobalConfig> theConfig = tryLoadConfigPath(path, filename);
        if (theConfig.isEmpty()) {
            logger.warning("Config from env '"+envName+" ("+path+")': file '"+filename+"' does not exist or is not readable - ignoring");
        }
        return theConfig;
    }

    private static Optional<GlobalConfig> tryLoadConfigPath(String path, String filename) {
        return Optional.of(path)
                .map(File::new)
                .map(f -> new File(f, filename))
                .filter(f -> {
                    if (!f.canRead()) logger.fine(String.format("Config from file '%s': does not exist/can't read - ignoring", f.getAbsolutePath()));
                    return f.canRead();
                })
                .map(f -> {
                    try {
                        return new GlobalConfig(f);
                    } catch (Exception e) {
                        logger.log(Level.WARNING, String.format("Config file from '%s': ERROR", f.getAbsolutePath()), e);
                        return null;
                    }
                });
    }

    /** Load the file and return it as-is. Names are not normalized, nothing is validated. */
    private static Properties loadProperties(File f) {
        if (!f.isFile())
            throw new IllegalArgumentException("File " + f + " does not exist");
        if (!f.canRead())
            throw new IllegalArgumentException("File" + f + " is not readable");

        // don't pass defaults, we set those manually later, so we can log which ones are used
        Properties loadedProps = new Properties();
        try (Reader in = new BufferedReader(new FileReader(f))) {
            logger.info(String.format("Reading global config: %s", f));
            loadedProps.load(in);
        } catch (IOException e) {
            throw new RuntimeException("Error reading global config file " + f, e);
        }
        return loadedProps;
    }


    // ========================
    // Livereload on the config
    // ========================

    private static void watchConfigFile(File configFile) {
        if (watchService != null || watchThread != null) throw new IllegalStateException("Already watching a config file");

        try {
            logger.info("Watching config file " + configFile + " for changes");
            watchService = FileSystems.getDefault().newWatchService();
            Path path = configFile.toPath().getParent();
            path.register(watchService, StandardWatchEventKinds.ENTRY_MODIFY);

            watchThread = new Thread(() -> {
                try {
                    while (!Thread.currentThread().isInterrupted()) {
                        WatchKey key = watchService.take();
                        for (WatchEvent<?> event : key.pollEvents()) {
                            if (event.kind() == StandardWatchEventKinds.ENTRY_MODIFY) {
                                Path changed = (Path) event.context();
                                if (changed.equals(configFile.toPath().getFileName())) {
                                    instance.apply(loadProperties(configFile));
                                }
                            }
                        }
                        key.reset();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } catch (ClosedWatchServiceException e) {
                    // ignore
                } catch (Exception e) {
                    logger.log(Level.WARNING, "Error watching config file " + configFile, e);
                }
            });
            watchThread.setDaemon(true);
            watchThread.start();
        } catch (IOException e) {
            throw new RuntimeException("Could not watch config file " + configFile, e);
        }
    }

    // ========================
    // ServletContextListener
    // ========================

    @Override
    public void contextInitialized(ServletContextEvent sce) {
        instance = loadConfigFile(sce.getServletContext());
    }

    @Override
    public void contextDestroyed(ServletContextEvent sce) {
        logger.info("Shutting down config file watcher");
        if (watchThread != null) {
            watchThread.interrupt();
            watchThread = null;
        }
        if (watchService != null) try {
            watchService.close();
        } catch (IOException e) {
            logger.log(Level.WARNING, "Error closing watch service", e);
        } finally {
            watchService = null;
        }
    }
}
