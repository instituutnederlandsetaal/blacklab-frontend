package nl.inl.corpuswebsite.utils;

import java.util.Arrays;
import java.util.Optional;
import java.util.logging.Logger;

import javax.servlet.http.Cookie;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;

import nl.inl.corpuswebsite.utils.GlobalConfig.Keys;

/**
 * Helper class for talking to BlackLab.
 * Is initialized with the BlackLab server URL once on startup.
 * Has methods for getting various things from BlackLab, with the ability to copy basic auth headers from the client request (which is why it needs the request and response objects).
 */
public class BlackLabApi {
	protected static String blsUrl;
	
	protected final HttpServletRequest request;
	protected final HttpServletResponse response;
	protected final GlobalConfig config;
	
	public BlackLabApi(HttpServletRequest clientRequest, HttpServletResponse clientResponse, GlobalConfig config) {
		this.request = clientRequest;
		this.response = clientResponse;
		this.config = config;
	}

	private AuthRequest authRequest() {
		var req = new AuthRequest(request, response);

		readRequestParameter(request, config.get(Keys.AUTH_SOURCE_TYPE), config.get(Keys.AUTH_SOURCE_NAME))
				.ifPresent(auth -> setParameter(req, config.get(Keys.AUTH_TARGET_TYPE), config.get(Keys.AUTH_TARGET_NAME), auth));

		return req;
	}

	public Result<String, QueryException> getDocumentMetadata(String corpus, String documentId) {
		return authRequest()
				.url(blsUrl, corpus, "docs", documentId)
				.query("outputformat", "xml")
				.request(true);
	}

	public Result<CorpusConfig, Exception> getCorpusConfig(String corpus) {
		return authRequest()
				.url(blsUrl, corpus)
				.query("outputformat", "xml")
				.request(true)
				.flatMapWithErrorHandling(xml ->
						authRequest()
							.url(blsUrl, corpus)
							.query("outputformat", "json")
							.query("listvalues", new CorpusConfig(corpus, xml, "").getListValues())
							.request(true)
							.mapWithErrorHandling(json -> new CorpusConfig(corpus, xml, json))
				);
	}

	public Result<String, QueryException> getStylesheet(String formatName) {
		return authRequest()
				.url(blsUrl, "input-formats", formatName, "xslt")
				.request(true);
	}

	public Result<String, QueryException> getDocumentContents(
			String corpus,
			String docId,
			Optional<String> field,
			Optional<String> searchfield,
			Optional<String> blacklabQuery,
			Optional<String> pattgapdata,
			Optional<Integer> pageStart,
			Optional<Integer> pageEnd) {
		return authRequest()
				.url(blsUrl, corpus, "docs", docId, "contents")
				.query("field", field)
				.query("searchfield", searchfield)
				.query("patt", blacklabQuery)
				.query("pattgapdata", pattgapdata)
				.query("wordstart", pageStart.map(Object::toString))
				.query("wordend", pageEnd.map(Object::toString))
				.query("escapexmlfragments", "false")
				.request(true);
	}
	
	public static void setBlsUrl(String url) {
		BlackLabApi.blsUrl = url;
	}

	private static boolean warned = false;
	public static Optional<String> readRequestParameter(HttpServletRequest request, String type, String name) {
		return Optional
			.ofNullable(type)
			.filter(t -> name != null)
			.map(String::toLowerCase)
			.map(t -> {
				switch (t) {
					case "header": return request.getHeader(name);
					case "attribute": return (String) request.getAttribute(name);
					case "cookie": return Arrays.stream(request.getCookies()).filter(c -> c.getName().equals(name)).map(Cookie::getValue).findFirst().orElse(null);
					case "parameter": return request.getParameter(name);
					default: {
						if (!warned) {
							Logger.getLogger(BlackLabApi.class.getName()).warning("Unknown auth source type: " + t);
							warned = true;
						}
						return null;
					}
				}
			})
			.filter(s -> !s.isBlank());
	}

	private void setParameter(AuthRequest request, String type, String name, String value) {
		Optional.ofNullable(type)
			.filter(t -> name != null)
			.filter(t -> value != null)
			.map(String::toLowerCase)
			.ifPresent(t -> {
				switch (t) {
					case "header": request.header(name, value); break;
					case "cookie": request.cookie(name, value); break;
					case "parameter": request.query(name, value); break;
					default: {
						if (!warned) {
							Logger.getLogger(BlackLabApi.class.getName()).warning("Unknown auth target type: " + t);
							warned = true;
						}
					}
				}
			});
	}
}
