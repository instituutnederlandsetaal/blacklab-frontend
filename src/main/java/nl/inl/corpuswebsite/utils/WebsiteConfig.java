package nl.inl.corpuswebsite.utils;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import javax.xml.transform.stream.StreamSource;

import org.apache.commons.lang3.StringUtils;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonInclude.Include;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;

import net.sf.saxon.s9api.DocumentBuilder;
import net.sf.saxon.s9api.Processor;
import net.sf.saxon.s9api.SaxonApiException;
import net.sf.saxon.s9api.XPathCompiler;
import net.sf.saxon.s9api.XdmItem;
import net.sf.saxon.s9api.XdmNode;
import nl.inl.corpuswebsite.utils.GlobalConfig.Keys;

/**
 * Configuration read from the Search.xml config file specific to a corpus.
 */
public class WebsiteConfig {
    @JsonSerialize
    public static class WebsiteConfigJson {
        @JsonIgnore
        private final WebsiteConfig config;

        public WebsiteConfigJson(WebsiteConfig config) {
            this.config = config;
        }

        @JsonProperty("id")
        public String id() {
            return config.getCorpusId().orElse(null);
        }

        @JsonProperty("displayName")
        public String name() {
            return config.getDisplayName().orElse(null);
        }

        @JsonProperty("faviconDir")
        public String faviconDir() {
            return config.getPathToFaviconDir();
        }

        @JsonProperty("pageSize")
        public Integer pageSize() {
            return config.getPageSize().orElse(null);
        }

        @JsonProperty("analytics")
        public Map<String, Object> analytics() {
            Map<String, Object> analyticsMap = new HashMap<>();
            analyticsMap.put("google", getGoogleAnalytics());
            analyticsMap.put("plausible", getPlausibleAnalytics());
            return analyticsMap;
        }

        private Map<String, String> getGoogleAnalytics() {
            return config.getAnalyticsKey().map(key -> Map.of("key", key)).orElse(null);
        }

        private Map<String, String> getPlausibleAnalytics() {
            if (config.getPlausibleDomain().isPresent() && config.getPlausibleApiHost().isPresent()) {
                return Map.of(
                    "domain", config.getPlausibleDomain().get(),
                    "apiHost", config.getPlausibleApiHost().get()
                );
            }
            return null;
        }

        @JsonProperty("navbarLinks")
        public List<ElementOnPage> topBarLinks() {
            return config.getLinks();
        }

        @JsonProperty("bannerMessage")
        public String bannerMessage() {
            return StringUtils.trimToNull(config.globalConfig.get(Keys.BANNER_MESSAGE));
        }

        @JsonProperty("customJs")
        public Map<String, List<ElementOnPage>> customJs() {
            return config.getAllCustomJs();
        }

        @JsonProperty("customCss")
        public Map<String, List<ElementOnPage>> customCss() {
            return config.getAllCustomCss();
        }

        @JsonProperty("loadedFromPath")
        @JsonInclude(Include.NON_EMPTY)
        public String loadedFromPath() {
            return Boolean.parseBoolean(config.globalConfig.get(Keys.SHOW_DEBUG_CHECKBOX_ON_CLIENT)) ? config.loadedFromFile : null;
        }

        @JsonIgnore
        public Long lastModified() {
            return config.lastModified;
        }
    }

    public static class ElementOnPage implements Comparable<ElementOnPage> {
        private final String label;
        private final Map<String, String> attributes = new HashMap<>();
        private final int index;

        public ElementOnPage(String label, int index) {
            this.label = label;
            this.index = index;
        }

        @JsonProperty("label")
        @JsonInclude(Include.NON_EMPTY)
        public String getLabel() {
            return label;
        }

        @JsonProperty("attributes")
        public Map<String, String> getAttributes() {
            return attributes;
        }

        @JsonProperty("index")
        public int getIndex() {
            return index;
        }

        public int compareTo(ElementOnPage other) {
            return Integer.compare(this.index, other.index);
        }
    }

    private final GlobalConfig globalConfig;

    private final Optional<String> corpusId;

    /** Name to display for this corpus, null if no corpus set or no explicit display name configured */
    private final Optional<String> corpusDisplayName;

    /** Should be a directory */
    private final String pathToFaviconDir;

    /** Allow suppressing pagination on the article page. This causes the article xslt to receive the full document instead of only a snippet */
    private final boolean pagination;

    /** Page size to use for paginating documents in this corpus, defaults to 1000 if omitted (also see default Search.xml) */
    private final int pageSize;

    /** Google Analytics key, analytics are disabled if not provided */
    private final Optional<String> analyticsKey;

    private final Optional<String> plausibleDomain;
    private final Optional<String> plausibleApiHost;

    /** Link to put in the top bar */
    private final List<ElementOnPage> linksInTopBar;

    private final Map<String, String> xsltParameters;

    private final Map<String, List<ElementOnPage>> customJS = new HashMap<>();
    private final Map<String, List<ElementOnPage>> customCSS = new HashMap<>();

    private final XPathCompiler xp;
    private final XdmNode doc;

    private final String loadedFromFile;
    private final long lastModified;

    /**
     * Note that corpus may be null, when parsing the default website settings for non-corpus pages (such as the landing page).
     *
     * @param configFile the Search.xml file
     * @param globalConfig the global configuration
     * @param corpusId (optional) corpus id if this is a corpus-specific config file
     * @throws SaxonApiException, IOException, ParserConfigurationException, XPathExpressionException, SAXException
     */
    public WebsiteConfig(File configFile, GlobalConfig globalConfig, Optional<String> corpusId) throws SaxonApiException, IOException {
        this.loadedFromFile = configFile.getAbsolutePath();
        this.lastModified = configFile.lastModified();
        this.globalConfig = globalConfig;
        this.corpusId = corpusId;
        String contextPath = globalConfig.get(Keys.CF_URL_ON_CLIENT);

        // Read the file content and interpolate values
        String xmlContent = Files.readString(configFile.toPath());
        xmlContent = xmlContent.replace("${request:contextPath}", contextPath)
                               .replace("${request:corpusId}", corpusId.orElse(""))
                               .replace("${request:corpusPath}", contextPath + corpusId.map(c -> "/" + c).orElse(""));

        Processor proc = new Processor(false);
        DocumentBuilder builder = proc.newDocumentBuilder();
        this.doc = builder.build(new StreamSource(new ByteArrayInputStream(xmlContent.getBytes(StandardCharsets.UTF_8))));
        this.xp = proc.newXPathCompiler();

        corpusDisplayName = getString("//InterfaceProperties/DisplayName");
        Optional<String> corpusOwner = CorpusFileUtil.getCorpusOwner(corpusId);

        AtomicInteger i = new AtomicInteger();
        xp.evaluate("//InterfaceProperties/CustomJs", doc).forEach(sub -> {
            XdmNode cssNode = (XdmNode) sub;
            ElementOnPage css = new ElementOnPage("", i.getAndIncrement());
            css.getAttributes().put("src", cssNode.getStringValue());
            try {
                for (XdmItem att: xp.evaluate("@*", sub)) {
                    XdmNode attNode = (XdmNode) att;
                    css.getAttributes().put(attNode.getNodeName().getLocalName(), attNode.getStringValue());
                }
            } catch (SaxonApiException e) {
                throw new RuntimeException(e);
            }

            String page = Objects.toString(css.getAttributes().remove("page"), "");
            customJS.computeIfAbsent(page, __ -> new ArrayList<>()).add(css);
        });

        i.set(0);
        xp.evaluate("//InterfaceProperties/CustomCss", doc).forEach(sub -> {
            XdmNode cssNode = (XdmNode) sub;
            ElementOnPage css = new ElementOnPage("", i.getAndIncrement());
            css.getAttributes().put("href", cssNode.getStringValue());
            css.getAttributes().put("rel", "stylesheet");
            try {
                for (XdmItem att: xp.evaluate("@*", sub)) {
                    XdmNode attNode = (XdmNode) att;
                    css.getAttributes().put(attNode.getNodeName().getLocalName(), attNode.getStringValue());
                }
            } catch (SaxonApiException e) {
                throw new RuntimeException(e);
            }

            String page = Objects.toString(css.getAttributes().remove("page"), "");
            customCSS.computeIfAbsent(page, __ -> new ArrayList<>()).add(css);
        });


        pathToFaviconDir = getString("//InterfaceProperties/FaviconDir").orElse(contextPath + "/img");
        pagination = getBoolean("//InterfaceProperties/Article/Pagination").orElse(false);
        pageSize = getInt("//InterfaceProperties/Article/PageSize").filter(p -> p > 0).orElse(1000);
        analyticsKey = getString("//InterfaceProperties/Analytics/Key");

        linksInTopBar = Stream.concat(
            corpusOwner.isPresent() ? Stream.of(new ElementOnPage("My corpora", i.getAndIncrement())) : Stream.empty(),
            xp.evaluate("//InterfaceProperties/NavLinks/Link", doc).stream().map(sub -> {
                String label = sub.getStringValue();
                String href = getString("@value", (XdmNode) sub).orElse(label);
                boolean newWindow = getBoolean("@newWindow", (XdmNode) sub).orElse(false);
                boolean relative = getBoolean("@relative", (XdmNode) sub).orElse(false); // No longer supported, keep around for compatibility
                if (relative)
                    href = contextPath + "/" + href;

                ElementOnPage link = new ElementOnPage(label, i.getAndIncrement());
                link.getAttributes().put("href", href);
                link.getAttributes().put("target", newWindow ? "_blank" : "_self");
                try {
                    for (XdmItem att: xp.evaluate("@*", sub)) {
                        XdmNode attNode = (XdmNode) att;
                        link.getAttributes().put(attNode.getNodeName().getLocalName(), attNode.getStringValue());
                    }
                } catch (SaxonApiException e) {
                    throw new RuntimeException(e);
                }
                link.getAttributes().remove("newWindow");
                link.getAttributes().remove("relative");
                link.getAttributes().remove("value");
                return link;
            })
        ).collect(Collectors.toList());

        xsltParameters = xp.evaluate("//XsltParameters/XsltParameter", doc).stream()
                .collect(Collectors.toMap(sub -> getString("@name", (XdmNode) sub).orElse(""), sub -> getString("@value", (XdmNode) sub).orElse("")));

        plausibleDomain = getString("//InterfaceProperties/Plausible/domain");
        plausibleApiHost = getString("//InterfaceProperties/Plausible/apiHost");
    }



    private Optional<String> getString(String expression) {
        try {
            return Optional.ofNullable(xp.evaluateSingle(expression, doc)).map(XdmItem::getStringValue).filter(StringUtils::isNotBlank);
        } catch (SaxonApiException e) {
            return Optional.empty();
        }
    }

    private Optional<Integer> getInt(String expression) {
        return getString(expression).flatMap(s -> {
            try {
                return Optional.of(Integer.parseInt(s));
            } catch (NumberFormatException e) {
                return Optional.empty();
            }
        });
    }

    private Optional<Boolean> getBoolean(String expression) {
        return getString(expression).map(Boolean::parseBoolean);
    }

    private Optional<String> getString(String expression, XdmNode contextNode) {
        try {
            return Optional.ofNullable(xp.evaluateSingle(expression, contextNode)).map(XdmItem::getStringValue).filter(StringUtils::isNotBlank);
        } catch (SaxonApiException e) {
            return Optional.empty();
        }
    }

    private Optional<Integer> getInt(String expression, XdmNode contextNode) {
        return getString(expression, contextNode).flatMap(s -> {
            try {
                return Optional.of(Integer.parseInt(s));
            } catch (NumberFormatException e) {
                return Optional.empty();
            }
        });
    }

    private Optional<Boolean> getBoolean(String expression, XdmNode contextNode) {
        return getString(expression, contextNode).map(Boolean::parseBoolean);
    }

    public Optional<String> getCorpusId() {
        return corpusId;
    }

    public Optional<String> getDisplayName() {
        return corpusDisplayName;
    }

    /**
     * Get the links for use in the navbar
     * @return the list of links
     */
    public List<ElementOnPage> getLinks() {
        return linksInTopBar;
    }

    public Map<String, String> getXsltParameters() {
        return xsltParameters;
    }

    public String getPathToFaviconDir() {
        return pathToFaviconDir;
    }

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

    /** Package-private for serialization */
    Map<String, List<ElementOnPage>> getAllCustomJs() {
        return customJS;
    }

    /** Package-private for serialization */
    Map<String, List<ElementOnPage>> getAllCustomCss() {
        return customCSS;
    }
}
