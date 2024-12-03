package nl.inl.corpuswebsite.utils;

import java.io.File;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.apache.commons.configuration2.XMLConfiguration;
import org.apache.commons.configuration2.builder.ConfigurationBuilder;
import org.apache.commons.configuration2.builder.FileBasedConfigurationBuilder;
import org.apache.commons.configuration2.builder.fluent.Parameters;
import org.apache.commons.configuration2.convert.DisabledListDelimiterHandler;
import org.apache.commons.configuration2.ex.ConfigurationException;
import org.apache.commons.configuration2.interpol.ConfigurationInterpolator;
import org.apache.commons.lang3.StringUtils;

/**
 * Configuration read from the Search.xml config file specific to a corpus.
 */
public class WebsiteConfig {
    /** One of the links shown in the top bar */
    public static class LinkInTopBar {
        private final String label;
        private final String href;
        private final boolean openInNewWindow;

        /**
         *
         * @param label display text
         * @param href address of the link, this should be an absolute path
         * @param openInNewWindow
         */
        public LinkInTopBar(String label, String href, boolean openInNewWindow) {
            super();
            this.label = label;
            this.href = href;
            this.openInNewWindow = openInNewWindow;
        }

        // Getters required for velicity
        public String getLabel() {
            return label;
        }

        public String getHref() {
            return href;
        }

        public boolean isOpenInNewWindow() {
            return openInNewWindow;
        }

        @Override
        public String toString() {
            return label;
        }
    }

    public static class CustomJs implements Comparable<CustomJs> {
        private final String url;
        private final Map<String, String> attributes = new HashMap<>();
        private final int index;

        public CustomJs(String url, int index) {
            this.url = url;
            this.index = index;
        }

        public String getUrl() {
            return this.url;
        }

        public Map<String, String> getAttributes() {
            return attributes;
        }

        public int getIndex() {
            return index;
        }

        public int compareTo(CustomJs other) {
            return Integer.compare(this.index, other.index);
        }
    }

    private final Optional<String> corpusId;

    /** Name to display for this corpus, null if no corpus set or no explicit display name configured */
    private final Optional<String> corpusDisplayName;
    /** Autocomatically computed displayname from the corpus id. Null if no corpus set. */
    private final Optional<String> corpusDisplayNameFallback;

    /** User for this corpus, unset if no corpus set or this corpus has no owner. */
    private final Optional<String> corpusOwner;

    /** Should be a directory */
    private final String pathToFaviconDir;

    /** properties to show in result columns, empty string if no corpus set or not configured for this corpus */
    private final Optional<String> propColumns;

    /** Allow suppressing pagination on the article page. This causes the article xslt to receive the full document instead of only a snippet */
    private final boolean pagination;

    /** Page size to use for paginating documents in this corpus, defaults to 1000 if omitted (also see default Search.xml) */
    private final int pageSize;

    /** Google analytics key, analytics are disabled if not provided */
    private final Optional<String> analyticsKey;

    private final Optional<String> plausibleDomain;
    private final Optional<String> plausibleApiHost;

    /** Link to put in the top bar */
    private final List<LinkInTopBar> linksInTopBar;

    private final Map<String, String> xsltParameters;

    private final Map<String, List<CustomJs>> customJS = new HashMap<>();
    private final Map<String, List<String>> customCSS = new HashMap<>();

    /**
     * Note that corpus may be null, when parsing the default website settings for non-corpus pages (such as the landing page).
     *
     * @param configFile the Search.xml file
     * @param corpusId (optional) corpus id if this is a corpus-specific config file
     * @param contextPath the application root url on the client (usually /corpus-frontend). Required for string interpolation while loading the configFile.
     * @throws ConfigurationException
     */
    public WebsiteConfig(File configFile, String contextPath, Optional<String> corpusId) throws ConfigurationException {
        this.corpusId = corpusId;
        Parameters parameters = new Parameters();
        ConfigurationBuilder<XMLConfiguration> cb = new FileBasedConfigurationBuilder<>(XMLConfiguration.class)
                .configure(parameters.fileBased()
                .setFile(configFile)
                .setListDelimiterHandler(new DisabledListDelimiterHandler())
                .setPrefixLookups(new HashMap<>(ConfigurationInterpolator.getDefaultPrefixLookups()) {{
                    put("request", key -> {
                        switch (key) {
                            case "contextPath": return contextPath;
                            case "corpusId": return corpusId.orElse(""); // don't return null, or the interpolation string (${request:corpusId}) will be rendered
                            case "corpusPath": return contextPath + corpusId.map(c -> "/" + c).orElse("");
                            default: return key;
                        }
                    });
                }}));
        // Load the specified config file

        XMLConfiguration xmlConfig = cb.getConfiguration();

        // Keep the autogenerated fallback separate, as we might want to override it on the client.
        corpusDisplayName = Optional.ofNullable(xmlConfig.getString("InterfaceProperties.DisplayName")).map(StringUtils::trimToNull);
        corpusDisplayNameFallback = CorpusFileUtil.getCorpusName(corpusId);
        corpusOwner = CorpusFileUtil.getCorpusOwner(corpusId);

        AtomicInteger i = new AtomicInteger();
        xmlConfig.configurationsAt("InterfaceProperties.CustomJs").forEach(sub -> {
            String url = sub.getString("", sub.getString("[@src]", ""));
            if (url.isEmpty()) return;
            CustomJs js = new CustomJs(url, i.getAndIncrement()); // preserve order as the scripts may depend on each other.

            // src attribute handled separately above.
            Stream.of("async", "crossorigin", "defer", "integrity", "nomodule", "nonce", "referrerpolicy", "type").forEach(att -> {
                String v = sub.getString("[@" + att + "]");
                if (v != null) js.getAttributes().put(att, StringUtils.trimToNull(v));
            });

            String page = sub.getString("[@page]", "").toLowerCase();
            customJS.computeIfAbsent(page, __ -> new ArrayList<>()).add(js);
        });
        xmlConfig.configurationsAt("InterfaceProperties.CustomCss").forEach(sub -> {
            String page = sub.getString("[@page]", "").toLowerCase();
            String url = sub.getString("", "");
            if (!url.isEmpty()) customCSS.computeIfAbsent(page, __ -> new ArrayList<>()).add(url);
        });

        pathToFaviconDir = xmlConfig.getString("InterfaceProperties.FaviconDir", contextPath + "/img");
        propColumns = Optional.ofNullable(StringUtils.trimToNull(xmlConfig.getString("InterfaceProperties.PropColumns")));
        pagination = xmlConfig.getBoolean("InterfaceProperties.Article.Pagination", false);
        pageSize = Math.max(1, xmlConfig.getInt("InterfaceProperties.Article.PageSize", 1000));
        analyticsKey = Optional.ofNullable(StringUtils.trimToNull(xmlConfig.getString("InterfaceProperties.Analytics.Key")));
        linksInTopBar = Stream.concat(
            corpusOwner.isPresent() ? Stream.of(new LinkInTopBar("My corpora", contextPath + "/corpora", false)) : Stream.empty(),
            xmlConfig.configurationsAt("InterfaceProperties.NavLinks.Link").stream().map(sub -> {
                String label = sub.getString("");
                String href = StringUtils.defaultIfEmpty(sub.getString("[@value]"), label);
                boolean newWindow = sub.getBoolean("[@newWindow]", false);
                boolean relative = sub.getBoolean("[@relative]", false); // No longer supported, keep around for compatibility
                if (relative)
                    href = contextPath + "/" + href;

                return new LinkInTopBar(label, href, newWindow);
            })
        ).collect(Collectors.toList());
        xsltParameters = xmlConfig.configurationsAt("XsltParameters.XsltParameter").stream()
                .collect(Collectors.toMap(sub -> sub.getString("[@name]"), sub -> sub.getString("[@value]")));

        // plausible
        this.plausibleDomain = Optional.ofNullable(StringUtils.trimToNull(xmlConfig.getString("InterfaceProperties.Plausible.domain")));
        this.plausibleApiHost = Optional.ofNullable(StringUtils.trimToNull(xmlConfig.getString("InterfaceProperties.Plausible.apiHost")));
    }

    public Optional<String> getCorpusId() {
        return corpusId;
    }

    public String getDisplayName() {
        return corpusDisplayName.orElse(corpusDisplayNameFallback.orElse(""));
    }
    public boolean displayNameIsFallback() {
        return corpusDisplayName.isEmpty();
    }

    public Optional<String> getCorpusOwner() {
        return corpusOwner;
    }

    /**
     * Get the links for use in the navbar
     * @return the list of links
     */
    public List<LinkInTopBar> getLinks() {
        return linksInTopBar;
    }

    public Map<String, String> getXsltParameters() {
        return xsltParameters;
    }

    public List<CustomJs> getCustomJS(String page) {
        Stream<CustomJs> s = customJS.computeIfAbsent(page, __ -> new ArrayList<>()).stream();
        // add the default scripts to the stream if the page is not empty
        if (!page.isEmpty()) s = Stream.concat(s, customJS.computeIfAbsent("", __ -> new ArrayList<>()).stream());
        // sort the scripts by index in the config, and return
        return s.sorted().collect(Collectors.toList());
    }

    public List<String> getCustomCSS(String page) {
        return customCSS.computeIfAbsent(page, __ -> new ArrayList<>());
    }

    public String getPathToFaviconDir() {
        return pathToFaviconDir;
    }

    public Optional<String> getPropColumns() {
        return propColumns;
    }

    /** Return the pagination size, if pagination is enabled for this corpus */
    public Optional<Integer> getPageSize() {
        return Optional.of(pageSize).filter(p -> this.pagination && p > 0);
    }

    public Optional<String> getAnalyticsKey() {
        return analyticsKey;
    }

    public Optional<String> getPlausibleDomain() {
        return plausibleDomain;
    }

    public Optional<String> getPlausibleApiHost() {
    	return plausibleApiHost;
    }
}
