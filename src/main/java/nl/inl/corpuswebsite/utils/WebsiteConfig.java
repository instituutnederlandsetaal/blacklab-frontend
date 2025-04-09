package nl.inl.corpuswebsite.utils;

import java.io.File;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import nl.inl.corpuswebsite.MainServlet;
import org.apache.commons.configuration2.HierarchicalConfiguration;
import org.apache.commons.configuration2.XMLConfiguration;
import org.apache.commons.configuration2.builder.ConfigurationBuilder;
import org.apache.commons.configuration2.builder.FileBasedConfigurationBuilder;
import org.apache.commons.configuration2.builder.fluent.Parameters;
import org.apache.commons.configuration2.convert.DisabledListDelimiterHandler;
import org.apache.commons.configuration2.ex.ConfigurationException;
import org.apache.commons.configuration2.interpol.ConfigurationInterpolator;
import org.apache.commons.configuration2.interpol.Lookup;
import org.apache.commons.configuration2.tree.ImmutableNode;
import org.apache.commons.lang3.StringUtils;

/**
 * Configuration read from an XML config file.
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
         * @param relative does the url point within our own web application (e.g. starts with our context path)
         *        We need to track this to know if we should make this link relative to the current page, or whether it's an
         *        absolute url
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

    /**
     * Name to display for this corpus, null if no corpus set. Falls back to the corpus name if not explicitly configured.
     */
    private String corpusDisplayName;

    /** Raw name for this corpus, null if no corpus set. */
    private String corpusName;

    /** User for this corpus, null if no corpus set or this corpus has no owner. */
    private String corpusOwner;

    /** Custom css to use */
    private String pathToCustomCss;

    /** Custom js to use */
    private String pathToCustomJs;

    /** properties to show in result columns, empty if no corpus set */
    private String[] propColumns = new String[] {};

    /** Link to put in the top bar */
    private List<LinkInTopBar> linksInTopBar = new ArrayList<>();

    private Map<String, String> xsltParameters = new HashMap<>();

    /**
     *
     * @param configFile
     * @param corpus (optional) id of the corpus
     * @param corpusConfig (optional) the blacklab configuration for the corpus
     * @throws ConfigurationException when the configFile can't be parsed.
     */
    public WebsiteConfig(File configFile, String corpus, CorpusConfig corpusConfig, String contextPath) throws ConfigurationException {
        if (corpusConfig != null)
            initProps(corpusConfig);

        load(configFile, corpus, contextPath);

        if (corpusDisplayName == null) { // no displayName set
            String backendDisplayName = (corpusConfig != null) ? corpusConfig.getDisplayName() : null;
            if (backendDisplayName != null && !backendDisplayName.isEmpty() && !backendDisplayName.equals(corpus))
                corpusDisplayName = backendDisplayName;
            else
                corpusDisplayName = MainServlet.getCorpusName(corpus); // strip username prefix from corpus ID, and use remainder
        }
    }

    /**
     * Initializes the max 3 properties to show in columns, lemma and pos, when present, will be in these 3.
     *
     * @param corpusConfig
     */
    private void initProps(CorpusConfig corpusConfig) {
        if (corpusConfig == null)
            return;

        List<FieldDescriptor> fd = new ArrayList<>(3);

        List<FieldDescriptor> allDescriptors = new ArrayList<>(corpusConfig.getUngroupedPropertyFields());
        corpusConfig.getPropertyFieldGroups().values().forEach(allDescriptors::addAll);

        // Add lemma and pos
        allDescriptors.stream()
            .filter(pf -> ("lemma".equals(pf.getId()) || "pos".equals(pf.getId())))
            .forEach(fd::add);

        // Add first other fields in the list until we hit 3 fields
        allDescriptors.stream()
            .filter(pf -> fd.size() < 3 && !fd.contains(pf) && !pf.isMainProperty())
            .limit(Math.max(0, 3 - fd.size()))
            .forEach(fd::add);

        propColumns = fd.stream().map(FieldDescriptor::getId).toArray(String[]::new);
    }
    
    private static class RequesLookup implements Lookup {

        private final String contextPath;

        public RequesLookup(String contextPath) {
            this.contextPath = contextPath;
        }
        
        @Override
        public Object lookup(String variable) {
            if ("contextPath".equals(variable)) {
                return contextPath;
            } else {
                return variable + " not supported, only contextPath";
            }
        }
        
    }

    /**
     * Note that corpus may be null, when parsing the base config.
     *
     * @param configFile
     * @param corpus (optional) raw name of the corpus, including the username (if applicable), (null when loading the
     *        config for the pages outside a corpus context, such as /about, /help, and / (root)))
     * @throws ConfigurationException
     */
    private void load(File configFile, String corpus, String contextPath) throws ConfigurationException {
        Map<String, Lookup> variableLookup = new HashMap<String, Lookup>(ConfigurationInterpolator.getDefaultPrefixLookups());
        variableLookup.put("request", new RequesLookup(contextPath));
        
        Parameters parameters = new Parameters();
        ConfigurationBuilder<XMLConfiguration> cb = new FileBasedConfigurationBuilder<XMLConfiguration>(XMLConfiguration.class)
                .configure(parameters.fileBased()
                .setFile(configFile)
                .setListDelimiterHandler(new DisabledListDelimiterHandler())
                .setPrefixLookups(variableLookup));
        // Load the specified config file
        XMLConfiguration xmlConfig = cb.getConfiguration();

        corpusName = MainServlet.getCorpusName(corpus);
        corpusOwner = MainServlet.getCorpusOwner(corpus);
        corpusDisplayName = xmlConfig.getString("InterfaceProperties.DisplayName", null);
        pathToCustomJs = xmlConfig.getString("InterfaceProperties.CustomJs");
        pathToCustomCss = xmlConfig.getString("InterfaceProperties.CustomCss");

        String props = xmlConfig.getString("InterfaceProperties.PropColumns");
        if (props != null && !props.isEmpty()) {
            propColumns = StringUtils.split(props);
        }

        List<HierarchicalConfiguration<ImmutableNode>> myfields = xmlConfig.configurationsAt("InterfaceProperties.NavLinks.Link");
        for (Iterator<HierarchicalConfiguration<ImmutableNode>> it = myfields.iterator(); it.hasNext();) {
            HierarchicalConfiguration<ImmutableNode> sub = it.next();

            String href = sub.getString("[@value]", null);
            String label = sub.getString("");
            boolean newWindow = sub.getBoolean("[@newWindow]", false);
            boolean relative = sub.getBoolean("[@relative]", false); // No longer supported, keep around for compatibility
            if (href == null)
                href = label;

            if (relative)
                href = contextPath + "/" + href;
            
            linksInTopBar.add(new LinkInTopBar(label, href, newWindow));
        }

        myfields = xmlConfig.configurationsAt("XsltParameters.XsltParameter");
        for (Iterator<HierarchicalConfiguration<ImmutableNode>> it = myfields.iterator(); it.hasNext();) {
            HierarchicalConfiguration<ImmutableNode> sub = it.next();

            String name = sub.getString("[@name]");
            String value = sub.getString("[@value]");

            xsltParameters.put(name, value);
        }
    }

    public String getCorpusDisplayName() {
        return corpusDisplayName;
    }

    public String getCorpusName() {
        return corpusName;
    }

    public String getCorpusOwner() {
        return corpusOwner;
    }

    /**
     * Get the links for use in the navbar
     * Note that links where {@link LinkInTopBar#isRelative()} is true assume that the current page is
     * the context root (by default /corpus-frontend/)
     * Usually this is not the case (when looking at e.g. /corpus-frontend/my-corpus/search),
     * so they will need to be prefixed by some ../../ segments first,
     * this is done using the pathToTop variable in the velocity templates.
     *
     * @return the list of links
     */
    public List<LinkInTopBar> getLinks() {
        return linksInTopBar;
    }

    public Map<String, String> getXsltParameters() {
        return xsltParameters;
    }

    public String getPathToCustomCss() {
        return pathToCustomCss;
    }

    public String getPathToCustomJs() {
        return pathToCustomJs;
    }

    public String getPropColumns() {
        return StringUtils.join(propColumns, ",");
    }
}
